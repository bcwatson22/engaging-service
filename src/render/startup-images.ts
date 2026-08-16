import { Logger } from '@nestjs/common';
import type { Browser } from 'puppeteer';

import {
  getStartupImageKey,
  startupDevices,
  type TStartupDevice,
} from './startup-devices';

const logger = new Logger('StartupImages');

/* Long enough for the particles canvas to mount and entry animations to
   finish. A screenshot taken before that captures a half-faded page. */
const settleDelay = 2000;

const startupPages = [
  { name: 'home', path: '/' },
  { name: 'cv', path: '/cv' },
] as const;

/* A day, because nobody notices a splash screen that lags behind the site
   by an afternoon, and these are fetched in bursts when a device installs
   the PWA — exactly when a cache earns its keep. */
const objectHeaders = {
  contentType: 'image/png',
  cacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
} as const;

type TStartupImage = { key: string; image: Uint8Array };

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const captureDevice = async (
  browser: Browser,
  url: string,
  device: TStartupDevice,
): Promise<Uint8Array> => {
  const page = await browser.newPage();

  try {
    const { width, height, ratio } = device;

    await page.setViewport({
      width,
      height,
      deviceScaleFactor: ratio,
      isMobile: true,
      hasTouch: true,
    });

    await page.goto(url, { waitUntil: 'load' });

    await wait(settleDelay);

    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
};

/* Sequential rather than parallel: each capture is a full page load in a
   1GB container, and eleven at once would swap rather than finish sooner. */
const captureStartupImages = async (
  browser: Browser,
  siteUrl: string,
): Promise<TStartupImage[]> => {
  const captured: TStartupImage[] = [];

  for (const { name, path } of startupPages) {
    for (const device of startupDevices) {
      captured.push({
        key: getStartupImageKey(name, device),
        image: await captureDevice(browser, `${siteUrl}${path}`, device),
      });
    }
  }

  logger.log(`Captured ${captured.length} startup images`);

  return captured;
};

export {
  captureStartupImages,
  captureDevice,
  startupPages,
  settleDelay,
  objectHeaders,
  wait,
};
export type { TStartupImage };
