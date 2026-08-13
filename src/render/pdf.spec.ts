import type { Browser, Page } from "puppeteer";

import {
  applyFiller,
  countMessage,
  fillLastPage,
  fillerId,
  getPageCount,
  maxFill,
  renderPdf,
  spillMessage,
} from "./pdf";

const url = "https://www.engaging.engineering/cv";

const makePdf = (count: number): Uint8Array =>
  Buffer.from(`%PDF-1.4\n/Type /Pages /Kids [] /Count ${count}\n`);

/* A page whose reported PDF length grows once the filler passes a threshold,
   which is the only property the binary search actually depends on. */
const setup = (options: { threshold?: number; spills?: boolean } = {}) => {
  const { threshold = 600, spills = true } = options;

  let height = 0;

  const page = {
    goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    evaluate: vi.fn<
      (apply: unknown, id: string, next: number) => Promise<void>
    >(async (_apply, _id, next) => {
      height = next;
    }),
    pdf: vi.fn<() => Promise<Uint8Array>>(async () =>
      makePdf(spills && height >= threshold ? 2 : 1),
    ),
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as Page;

  const browser = {
    newPage: vi.fn<() => Promise<Page>>().mockResolvedValue(page),
  } as unknown as Browser;

  return { page, browser, getHeight: () => height };
};

const stubDocument = (
  options: { existing?: boolean; wrapper?: boolean } = {},
) => {
  const { existing = false, wrapper = true } = options;

  const element = {
    id: "",
    setAttribute: vi.fn<(name: string, value: string) => void>(),
    style: {} as CSSStyleDeclaration,
  };
  const container = { append: vi.fn<(node: unknown) => void>() };

  vi.stubGlobal("document", {
    getElementById: vi
      .fn<() => unknown>()
      .mockReturnValue(existing ? element : null),
    createElement: vi.fn<() => unknown>().mockReturnValue(element),
    querySelector: vi
      .fn<() => unknown>()
      .mockReturnValue(wrapper ? container : null),
  });

  return { element, container };
};

describe("getPageCount", () => {
  it("reads the count from the page tree", () => {
    expect(getPageCount(makePdf(3))).toBe(3);
  });

  it("throws when the page tree cannot be found", () => {
    expect(() => getPageCount(Buffer.from("not a pdf"))).toThrow(countMessage);
  });
});

describe("applyFiller", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates the filler when it does not already exist", () => {
    const { element, container } = stubDocument();

    applyFiller(fillerId, 120);

    expect(element.id).toBe(fillerId);
    expect(element.style.height).toBe("120px");
    expect(container.append).toHaveBeenNthCalledWith(1, element);
  });

  it("reuses the filler when it already exists", () => {
    stubDocument({ existing: true });

    applyFiller(fillerId, 40);

    expect(document.createElement).not.toHaveBeenCalled();
  });

  it("hides the filler from assistive technology", () => {
    const { element } = stubDocument();

    applyFiller(fillerId, 10);

    expect(element.setAttribute).toHaveBeenNthCalledWith(
      1,
      "aria-hidden",
      "true",
    );
  });

  it("does nothing further when there is no wrapper to append to", () => {
    const { element } = stubDocument({ wrapper: false });

    expect(() => applyFiller(fillerId, 10)).not.toThrow();
    expect(element.id).toBe(fillerId);
  });
});

describe("fillLastPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("settles on the largest fill that keeps the same page count", async () => {
    const { page, getHeight } = setup({ threshold: 600 });

    await fillLastPage(page);

    expect(getHeight()).toBe(599);
  });

  it("throws when the maximum fill does not spill onto a new page", async () => {
    const { page } = setup({ spills: false });

    await expect(fillLastPage(page)).rejects.toThrow(spillMessage);
  });

  it("probes the upper bound before searching", async () => {
    const { page } = setup();

    await fillLastPage(page);

    expect(page.evaluate).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      fillerId,
      maxFill,
    );
  });
});

describe("renderPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits for the network to settle before rendering", async () => {
    const { browser, page } = setup();

    await renderPdf(browser, url);

    expect(page.goto).toHaveBeenNthCalledWith(1, url, {
      waitUntil: "networkidle0",
    });
  });

  it("returns the rendered document", async () => {
    const { browser } = setup();

    await expect(renderPdf(browser, url)).resolves.toBeInstanceOf(Buffer);
  });

  it("still renders when the filler cannot be sized", async () => {
    const { browser } = setup({ spills: false });

    await expect(renderPdf(browser, url)).resolves.toBeInstanceOf(Buffer);
  });

  it("closes the page even when navigation fails", async () => {
    const { browser, page } = setup();

    (page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("nope"),
    );

    await expect(renderPdf(browser, url)).rejects.toThrow("nope");
    expect(page.close).toHaveBeenCalledTimes(1);
  });
});
