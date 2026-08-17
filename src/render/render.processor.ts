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
import { RecordStore } from './record.store';
import {
  cvPdf,
  isArtifact,
  renderQueue,
  startupImages,
  startupImagesJob,
  type TRenderJob,
} from './render.constants';
import { captureStartupImages, objectHeaders } from './startup-images';

/* One at a time: two Chrome instances on a shared-CPU machine will contend
   for memory and make both renders slower and less reliable. */
const concurrency = 1;

/* What a successful pass produced and how long it took. Returned rather than
   logged and dropped, because the completed event is where it is recorded and
   the event only carries what process returns. */
type TResult = {
  result: string;
  durationMs: number;
};

const unchangedMessage =
  'The page has not changed yet — the site is still revalidating';

@Processor(renderQueue, { concurrency })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    private readonly storage: StorageService,
    private readonly hashes: HashStore,
    private readonly records: RecordStore,
    private readonly config: ConfigService<TEnv, true>,
  ) {
    super();
  }

  /* Timed here rather than in each render, so there is one clock and no way
     to add an artifact that renders but reports no duration. The measurement
     starts before the content check, so an attempt that renders includes the
     hash fetch that let it — which is the work that actually happened. */
  async process(job: Job<TRenderJob>): Promise<TResult> {
    const startedAt = Date.now();

    const result =
      job.name === startupImagesJob
        ? await this.startupImages(job)
        : await this.cvPdf(job);

    return { result, durationMs: Date.now() - startedAt };
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

  /* Recorded here rather than inside each render, so there is one place a
     success is written down and no way to add an artifact that renders but
     never reports. The log stays: it is what you read while watching a
     deploy, and the record is what answers a question days later.

     `elapsedMs` is measured from the job's own timestamp, so it spans every
     attempt including the backoff between them — the gap between it and
     `durationMs` is how long the site took to catch up after a publish. */
  @OnWorkerEvent('completed')
  async onCompleted(job: Job<TRenderJob>, outcome: TResult): Promise<void> {
    this.logger.log(`${job.name} #${job.id} finished: ${outcome.result}`);

    if (!isArtifact(job.name)) return;

    await this.records.add(job.name, {
      ...outcome,
      /* BullMQ counts a first, uneventful pass as zero attempts made. Nobody
         reading a status page thinks a render that happened took none. */
      attempts: Math.max(job.attemptsMade, 1),
      elapsedMs: Date.now() - job.timestamp,
    });
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
export type { TResult };
