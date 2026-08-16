import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Browser } from 'puppeteer';

import type { TEnv } from '../config/env.schema';
import { StorageService } from '../storage/storage.service';
import { launch } from './browser';
import { fetchCombinedHash } from './content-hash';
import { HashStore } from './hash.store';
import { renderPdf } from './pdf';
import {
  cvPdf,
  renderQueue,
  startupImages,
  startupImagesJob,
  type TRenderJob,
} from './render.constants';
import { captureStartupImages, objectHeaders } from './startup-images';

/* One at a time: two Chrome instances on a shared-CPU machine will contend
   for memory and make both renders slower and less reliable. */
const concurrency = 1;

const unchangedMessage =
  'The page has not changed yet — the site is still revalidating';

@Processor(renderQueue, { concurrency })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    private readonly storage: StorageService,
    private readonly hashes: HashStore,
    private readonly config: ConfigService<TEnv, true>,
  ) {
    super();
  }

  async process(job: Job<TRenderJob>): Promise<string> {
    return job.name === startupImagesJob
      ? await this.startupImages(job)
      : await this.cvPdf(job);
  }

  /* Without these, a thrown job is silent: BullMQ catches it, schedules a
     retry and emits an event that nothing was listening for. Every failure
     looked like the job had simply never run. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<TRenderJob>, error: Error): void {
    const of = job.opts.attempts ?? 1;

    this.logger.warn(
      `${job.name} #${job.id} attempt ${job.attemptsMade}/${of}: ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<TRenderJob>, result: string): void {
    this.logger.log(`${job.name} #${job.id} finished: ${result}`);
  }

  private async cvPdf(job: Job<TRenderJob>): Promise<string> {
    const url = this.urlFor(cvPdf.path);
    const hash = await this.assertChanged([url], cvPdf.key, job);

    this.logger.log(`Rendering ${url} for job ${job.id}`);

    return await this.withBrowser(async (browser) => {
      const pdf = await renderPdf(browser, url);
      const uploaded = await this.storage.upload(cvPdf.key, pdf, cvPdf);

      await this.hashes.set(cvPdf.key, hash);

      return uploaded;
    });
  }

  private async startupImages(job: Job<TRenderJob>): Promise<string> {
    const urls = startupImages.paths.map((path) => this.urlFor(path));
    const hash = await this.assertChanged(urls, startupImages.key, job);

    this.logger.log(`Capturing startup images for job ${job.id}`);

    return await this.withBrowser(async (browser) => {
      const captured = await captureStartupImages(
        browser,
        this.config.get('SITE_URL', { infer: true }),
      );

      /* Sequential, so a failure part-way leaves the earlier images uploaded
         and the hash unrecorded — the retry simply overwrites them. */
      for (const { key, image } of captured) {
        await this.storage.upload(key, image, objectHeaders);
      }

      await this.hashes.set(startupImages.key, hash);

      return `${captured.length} startup images`;
    });
  }

  private urlFor(path: string): string {
    return `${this.config.get('SITE_URL', { infer: true })}${path}`;
  }

  private async withBrowser<Result>(
    run: (browser: Browser) => Promise<Result>,
  ): Promise<Result> {
    const browser = await launch();

    try {
      return await run(browser);
    } finally {
      /* Always — an orphaned Chrome would hold its memory for the life of
         the container. */
      await browser.close();
    }
  }

  /* The CMS notifies the site and this service at the same moment, so the
     pages may still be serving their previous render. Throwing hands the job
     back to BullMQ, which retries with exponential backoff until the content
     actually changes — self-correcting, rather than a tuned delay.

     The hash is recorded by the caller only after a successful upload, so a
     failed render is retried against the same previous hash rather than being
     treated as done. */
  private async assertChanged(
    urls: string[],
    key: string,
    job: Job<TRenderJob>,
  ): Promise<string> {
    const hash = await fetchCombinedHash(urls);

    if (job.data.force) {
      this.logger.log(`Forced, skipping the content check for ${key}`);

      return hash;
    }

    const previous = await this.hashes.get(key);

    this.logger.log(
      `${key}: live ${hash.slice(0, 8)}, last rendered ${previous?.slice(0, 8) ?? 'none'}`,
    );

    if (previous === hash) throw new Error(unchangedMessage);

    return hash;
  }
}

export { concurrency, unchangedMessage };
