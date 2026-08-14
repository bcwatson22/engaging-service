import {
  extractContent,
  fetchCombinedHash,
  fetchContentHash,
  hashContent,
  missingMainMessage,
  statusMessage,
} from "./content-hash";

const page = (content: string, extra = "") =>
  `<html><head>${extra}</head><body><main class="cv main">${content}</main><script>self.__next_f.push([1,"build-abc"])</script></body></html>`;

const setup = (
  options: { html?: string; ok?: boolean; status?: number } = {},
) => {
  const { html = page("<h1>Billy</h1>"), ok = true, status = 200 } = options;

  const text = vi.fn<() => Promise<string>>().mockResolvedValue(html);

  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok, status, text }),
  );

  return { text };
};

describe("extractContent", () => {
  it("takes only the main element", () => {
    expect(extractContent(page("<h1>Billy</h1>"))).toBe("<h1>Billy</h1>");
  });

  it("drops scripts inside the content", () => {
    const content = extractContent(page("<h1>Billy</h1><script>x()</script>"));

    expect(content).toBe("<h1>Billy</h1>");
  });

  it("normalises whitespace so formatting changes do not register", () => {
    expect(extractContent(page("<h1>\n  Billy\n</h1>"))).toBe(
      "<h1> Billy </h1>",
    );
  });

  it("throws when there is no main element", () => {
    expect(() => extractContent("<html><body>nope</body></html>")).toThrow(
      missingMainMessage,
    );
  });
});

describe("hashContent", () => {
  it("is stable for identical content", () => {
    expect(hashContent(page("<h1>Billy</h1>"))).toBe(
      hashContent(page("<h1>Billy</h1>")),
    );
  });

  it("ignores changes outside the main element", () => {
    expect(hashContent(page("<h1>Billy</h1>", "<title>a</title>"))).toBe(
      hashContent(page("<h1>Billy</h1>", "<title>b</title>")),
    );
  });

  it("changes when the content changes", () => {
    expect(hashContent(page("<h1>Billy</h1>"))).not.toBe(
      hashContent(page("<h1>Someone else</h1>")),
    );
  });
});

describe("fetchContentHash", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hashes the fetched page", async () => {
    setup();

    await expect(fetchContentHash("https://example.com/cv")).resolves.toBe(
      hashContent(page("<h1>Billy</h1>")),
    );
  });

  it("throws when the site responds with an error", async () => {
    setup({ ok: false, status: 503 });

    await expect(fetchContentHash("https://example.com/cv")).rejects.toThrow(
      `${statusMessage} 503`,
    );
  });
});

describe("fetchCombinedHash", () => {
  afterEach(() => vi.unstubAllGlobals());

  /* Each url answers with its own content, so a change to either page can be
     told apart from a change to the other. */
  const stubPages = (pages: Record<string, string>) =>
    vi.stubGlobal(
      "fetch",
      vi
        .fn<(url: string) => Promise<unknown>>()
        .mockImplementation(async (url) => ({
          ok: true,
          status: 200,
          text: async () => page(pages[url]),
        })),
    );

  const home = "https://example.com/";
  const cv = "https://example.com/cv";

  it("is stable while both pages are unchanged", async () => {
    stubPages({ [home]: "<h1>Home</h1>", [cv]: "<h1>CV</h1>" });
    const first = await fetchCombinedHash([home, cv]);

    stubPages({ [home]: "<h1>Home</h1>", [cv]: "<h1>CV</h1>" });
    const second = await fetchCombinedHash([home, cv]);

    expect(first).toBe(second);
  });

  it("changes when any one of the pages changes", async () => {
    stubPages({ [home]: "<h1>Home</h1>", [cv]: "<h1>CV</h1>" });
    const before = await fetchCombinedHash([home, cv]);

    stubPages({ [home]: "<h1>Home</h1>", [cv]: "<h1>CV, edited</h1>" });
    const after = await fetchCombinedHash([home, cv]);

    expect(before).not.toBe(after);
  });

  it("differs from the hash of either page alone", async () => {
    stubPages({ [home]: "<h1>Home</h1>", [cv]: "<h1>CV</h1>" });

    const combined = await fetchCombinedHash([home, cv]);

    expect(combined).not.toBe(hashContent(page("<h1>Home</h1>")));
  });
});
