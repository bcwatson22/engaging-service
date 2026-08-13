import {
  extractContent,
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
