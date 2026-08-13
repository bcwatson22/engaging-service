import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";

import { cvPdfJob, jobOptions, renderQueue } from "./render.constants";

const missingIdMessage = "The queue accepted the job without returning an id";

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  constructor(@InjectQueue(renderQueue) private readonly queue: Queue) {}

  /* Returns as soon as the job is durable in Redis — the render itself takes
     10–20 seconds, far longer than any webhook sender will wait. */
  async enqueueCvPdf(): Promise<string> {
    const { id } = await this.queue.add(cvPdfJob, {}, jobOptions);

    if (!id) throw new Error(missingIdMessage);

    this.logger.log(`Queued ${cvPdfJob} as ${id}`);

    return id;
  }
}

export { missingIdMessage };
