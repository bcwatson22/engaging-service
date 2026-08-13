import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";

import type { TEnv } from "../config/env.schema";
import { StorageService } from "../storage/storage.service";
import { launch } from "./browser";
import { renderPdf } from "./pdf";
import { cvPdf, renderQueue } from "./render.constants";

/* One at a time: two Chrome instances on a shared-CPU machine will contend
   for memory and make both renders slower and less reliable. */
const concurrency = 1;

@Processor(renderQueue, { concurrency })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService<TEnv, true>,
  ) {
    super();
  }

  async process(job: Job): Promise<string> {
    const siteUrl = this.config.get("SITE_URL", { infer: true });
    const url = `${siteUrl}${cvPdf.path}`;

    this.logger.log(`Rendering ${url} for job ${job.id}`);

    const browser = await launch();

    try {
      const pdf = await renderPdf(browser, url);

      return await this.storage.upload(cvPdf.key, pdf, cvPdf.contentType);
    } finally {
      /* Always — an orphaned Chrome would hold its memory for the life of
         the container. */
      await browser.close();
    }
  }
}

export { concurrency };
