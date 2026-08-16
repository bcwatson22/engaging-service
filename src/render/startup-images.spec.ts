import type { Browser, Page } from 'puppeteer';

import { startupDevices } from './startup-devices';
import {
  captureDevice,
  captureStartupImages,
  settleDelay,
  startupPages,
} from './startup-images';

const siteUrl = 'https://www.engaging.engineering';

const setup = () => {
  const screenshot = vi
    .fn<() => Promise<Uint8Array>>()
    .mockResolvedValue(Buffer.from('png'));

  const page = {
    setViewport: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    screenshot,
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as Page;

  const browser = {
    newPage: vi.fn<() => Promise<Page>>().mockResolvedValue(page),
  } as unknown as Browser;

  return { browser, page, screenshot };
};

describe('captureDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("applies the device's viewport and pixel ratio", async () => {
    const { browser, page } = setup();
    const device = { width: 390, height: 844, ratio: 3 };

    const capture = captureDevice(browser, siteUrl, device);
    await vi.advanceTimersByTimeAsync(settleDelay);
    await capture;

    expect(page.setViewport).toHaveBeenNthCalledWith(1, {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
  });

  it('lets animations settle before capturing', async () => {
    const { browser, screenshot } = setup();

    const capture = captureDevice(browser, siteUrl, startupDevices[0]);

    await vi.advanceTimersByTimeAsync(settleDelay - 1);
    expect(screenshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await capture;

    expect(screenshot).toHaveBeenCalledTimes(1);
  });

  it('closes the page even when navigation fails', async () => {
    const { browser, page } = setup();

    (page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('offline'),
    );

    await expect(
      captureDevice(browser, siteUrl, startupDevices[0]),
    ).rejects.toThrow('offline');

    expect(page.close).toHaveBeenCalledTimes(1);
  });
});

describe('captureStartupImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  const captureAll = async (browser: Browser) => {
    const capturing = captureStartupImages(browser, siteUrl);

    await vi.advanceTimersByTimeAsync(
      settleDelay * startupDevices.length * startupPages.length,
    );

    return await capturing;
  };

  it('captures every device for every page', async () => {
    const { browser } = setup();

    const captured = await captureAll(browser);

    expect(captured).toHaveLength(startupDevices.length * startupPages.length);
  });

  it('names each image after its page and pixel dimensions', async () => {
    const { browser } = setup();

    const [first] = await captureAll(browser);

    expect(first.key).toBe('startup-home-1320x2868.png');
  });

  it('captures both the home and cv pages', async () => {
    const { browser } = setup();

    const captured = await captureAll(browser);
    const pages = new Set(captured.map(({ key }) => key.split('-')[1]));

    expect([...pages]).toEqual(['home', 'cv']);
  });
});
