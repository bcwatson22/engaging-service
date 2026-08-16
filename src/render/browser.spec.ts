import puppeteer from 'puppeteer';

import { args, executablePath, launch } from './browser';

vi.mock('puppeteer', () => ({
  default: {
    launch: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'browser' }),
  },
}));

const setup = (options: { path?: string } = {}) => {
  if (options.path) vi.stubEnv('PUPPETEER_EXECUTABLE_PATH', options.path);

  return { launched: puppeteer.launch as ReturnType<typeof vi.fn> };
};

describe('executablePath', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is undefined when the image has not set one', () => {
    expect(executablePath()).toBeUndefined();
  });

  it("is the image's Chromium when set", () => {
    setup({ path: '/usr/bin/chromium' });

    expect(executablePath()).toBe('/usr/bin/chromium');
  });
});

describe('launch', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('launches headless with the container-safe flags', async () => {
    const { launched } = setup();

    await launch();

    expect(launched).toHaveBeenNthCalledWith(1, {
      headless: true,
      args,
      executablePath: undefined,
    });
  });

  it("uses the image's Chromium when one is configured", async () => {
    const { launched } = setup({ path: '/usr/bin/chromium' });

    await launch();

    expect(launched).toHaveBeenNthCalledWith(1, {
      headless: true,
      args,
      executablePath: '/usr/bin/chromium',
    });
  });
});
