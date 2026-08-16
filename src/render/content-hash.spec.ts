import {
  extractContent,
  fetchCombinedHash,
  fetchContentHash,
  hashContent,
  missingBodyMessage,
  statusMessage,
} from './content-hash';

/* Mirrors what streaming SSR actually emits: a skeleton <main>, the real
   <main>, and a late Suspense chunk sitting outside both. */
const page = (content: string, extra = '', late = '') =>
  `<html><head>${extra}</head><body>` +
  `<main class="home main"><div class="skeleton">Loading...</div></main>` +
  `<main class="cv main">${content}</main>` +
  `<div hidden id="S:8">${late}</div>` +
  `<script>self.__next_f.push([1,"build-abc"])</script>` +
  `</body></html>`;

const setup = (
  options: { html?: string; ok?: boolean; status?: number } = {},
) => {
  const { html = page('<h1>Billy</h1>'), ok = true, status = 200 } = options;

  const text = vi.fn<() => Promise<string>>().mockResolvedValue(html);

  vi.stubGlobal(
    'fetch',
    vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok, status, text }),
  );

  return { text };
};

describe('extractContent', () => {
  it('keeps the rendered markup', () => {
    expect(extractContent(page('<h1>Billy</h1>'))).toContain('<h1>Billy</h1>');
  });

  /* The regression that froze every artifact: the first <main> is a loading
     skeleton, so hashing it alone never changed. */
  it('does not stop at the first main, which is a loading skeleton', () => {
    const first = extractContent(page('<h1>Billy</h1>'));
    const second = extractContent(page('<h1>Someone else</h1>'));

    expect(first).not.toBe(second);
  });

  /* Late Suspense content arrives as a sibling of <main>, not inside it. */
  it('keeps content streamed in after the main elements', () => {
    const content = extractContent(page('<h1>Billy</h1>', '', 'Havas Lynx'));

    expect(content).toContain('Havas Lynx');
  });

  it('drops scripts, whose chunk names change on every deploy', () => {
    const content = extractContent(page('<h1>Billy</h1><script>x()</script>'));

    expect(content).not.toContain('x()');
    expect(content).not.toContain('__next_f');
  });

  it('normalises whitespace so formatting changes do not register', () => {
    expect(extractContent(page('<h1>\n  Billy\n</h1>'))).toContain(
      '<h1> Billy </h1>',
    );
  });

  it('throws when there is no body to hash', () => {
    expect(() => extractContent('<html>nope</html>')).toThrow(
      missingBodyMessage,
    );
  });
});

describe('hashContent', () => {
  it('is stable for identical content', () => {
    expect(hashContent(page('<h1>Billy</h1>'))).toBe(
      hashContent(page('<h1>Billy</h1>')),
    );
  });

  it('ignores head changes, whose preload hrefs carry build hashes', () => {
    expect(hashContent(page('<h1>Billy</h1>', '<title>a</title>'))).toBe(
      hashContent(page('<h1>Billy</h1>', '<title>b</title>')),
    );
  });

  it('changes when the content changes', () => {
    expect(hashContent(page('<h1>Billy</h1>'))).not.toBe(
      hashContent(page('<h1>Someone else</h1>')),
    );
  });
});

describe('fetchContentHash', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hashes the fetched page', async () => {
    setup();

    await expect(fetchContentHash('https://example.com/cv')).resolves.toBe(
      hashContent(page('<h1>Billy</h1>')),
    );
  });

  it('throws when the site responds with an error', async () => {
    setup({ ok: false, status: 503 });

    await expect(fetchContentHash('https://example.com/cv')).rejects.toThrow(
      `${statusMessage} 503`,
    );
  });
});

describe('fetchCombinedHash', () => {
  afterEach(() => vi.unstubAllGlobals());

  /* Each url answers with its own content, so a change to either page can be
     told apart from a change to the other. */
  const stubPages = (pages: Record<string, string>) =>
    vi.stubGlobal(
      'fetch',
      vi
        .fn<(url: string) => Promise<unknown>>()
        .mockImplementation(async (url) => ({
          ok: true,
          status: 200,
          text: async () => page(pages[url]),
        })),
    );

  const home = 'https://example.com/';
  const cv = 'https://example.com/cv';

  it('is stable while both pages are unchanged', async () => {
    stubPages({ [home]: '<h1>Home</h1>', [cv]: '<h1>CV</h1>' });
    const first = await fetchCombinedHash([home, cv]);

    stubPages({ [home]: '<h1>Home</h1>', [cv]: '<h1>CV</h1>' });
    const second = await fetchCombinedHash([home, cv]);

    expect(first).toBe(second);
  });

  it('changes when any one of the pages changes', async () => {
    stubPages({ [home]: '<h1>Home</h1>', [cv]: '<h1>CV</h1>' });
    const before = await fetchCombinedHash([home, cv]);

    stubPages({ [home]: '<h1>Home</h1>', [cv]: '<h1>CV, edited</h1>' });
    const after = await fetchCombinedHash([home, cv]);

    expect(before).not.toBe(after);
  });

  it('differs from the hash of either page alone', async () => {
    stubPages({ [home]: '<h1>Home</h1>', [cv]: '<h1>CV</h1>' });

    const combined = await fetchCombinedHash([home, cv]);

    expect(combined).not.toBe(hashContent(page('<h1>Home</h1>')));
  });
});
