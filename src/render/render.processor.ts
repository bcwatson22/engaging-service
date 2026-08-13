import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";

import type { TEnv } from "../config/env.schema";
import { StorageService } from "../storage/storage.service";
import { launch } from "./browser";
import { fetchContentHash } from "./content-hash";
import { HashStore } from "./hash.store";
import { renderPdf } from "./pdf";
import { cvPdf, renderQueue, type TRenderJob } from "./render.constants";

/* One at a time: two Chrome instances on a shared-CPU machine will contend
   for memory and make both renders slower and less reliable. */
const concurrency = 1;

const unchangedMessage =
  "The page has not changed yet — the site is still revalidating";

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
    const siteUrl = this.config.get("SITE_URL", { infer: true });
    const url = `${siteUrl}${cvPdf.path}`;

    const hash = await this.assertChanged(url, job);

    this.logger.log(`Rendering ${url} for job ${job.id}`);

    const browser = await launch();

    try {
      const pdf = await renderPdf(browser, url);
      const uploaded = await this.storage.upload(
        cvPdf.key,
        pdf,
        cvPdf.contentType,
      );

      /* Only after a successful upload, so a failed render is retried against
         the same previous hash rather than being treated as done. */
      await this.hashes.set(cvPdf.key, hash);

      return uploaded;
    } finally {
      /* Always — an orphaned Chrome would hold its memory for the life of
         the container. */
      await browser.close();
    }
  }

  /* The CMS notifies the site and this service at the same moment, so the
     page may still be serving its previous render. Throwing hands the job
     back to BullMQ, which retries with exponential backoff until the content
     actually changes — self-correcting, rather than a tuned delay. */
  private async assertChanged(url: string, job: Job<TRenderJob>) {
    const hash = await fetchContentHash(url);

    if (job.data.force) return hash;

    const previous = await this.hashes.get(cvPdf.key);

    if (previous === hash) throw new Error(unchangedMessage);

    return hash;
  }
}

export { concurrency, unchangedMessage };
