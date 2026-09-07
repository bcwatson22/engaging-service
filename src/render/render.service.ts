import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import type { TEnv } from '../config/env.schema';
import { StreamService } from '../stream/stream.service';
import {
  artifacts,
  jobOptions,
  renderQueue,
  type TArtifact,
  type TRenderJob,
} from './render.constants';

const missingIdMessage = 'The queue accepted the job without returning an id';

/* Returned when the stream collapsed the job as a duplicate, or refused it.
   The caller wants an id per artifact, and a webhook that 500s because a
   duplicate was correctly ignored would be worse than a meaningless one. */
const skipped = 'skipped';

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  private readonly owned: readonly string[];

  constructor(
    @InjectQueue(renderQueue) private readonly queue: Queue,
    private readonly stream: StreamService,
    config: ConfigService<TEnv, true>,
  ) {
    this.owned = config.get('WORKER_ARTIFACTS', { infer: true });
  }

  /* Returns as soon as the job is durable in Redis — a render takes 10–20
     seconds and a full set of startup images considerably longer, both far
     beyond what any webhook sender will wait for.

     `force` skips the unchanged-content check. A CMS publish should never set
     it, because waiting for the content to change is the entire point; a
     manual re-render after a print-stylesheet change must. */
  async enqueue(artifact: TArtifact, force = false): Promise<string> {
    /* Cut over: an artifact the Go worker owns goes to the stream and not to
       BullMQ. Running both would have the two services race to overwrite the
       same object with identical bytes — harmless, but it would keep this
       container rendering something it no longer owns, and hide a broken
       worker behind a working fallback.

       The render code below stays, and stays tested. Taking an artifact out of
       WORKER_ARTIFACTS hands it straight back. */
    if (this.owned.includes(artifact)) {
      const streamed = await this.stream.enqueue(artifact, force);

      return streamed ?? skipped;
    }

    const data: TRenderJob = { force };

    const { id } = await this.queue.add(artifact, data, jobOptions);

    if (!id) throw new Error(missingIdMessage);

    this.logger.log(`Queued ${artifact} as ${id}${force ? ' (forced)' : ''}`);

    return id;
  }

  /* A publish changes the content every artifact is derived from, so all of
     them are re-made rather than only the CV PDF. */
  async enqueueAll(force = false): Promise<string[]> {
    return await Promise.all(
      artifacts.map((artifact) => this.enqueue(artifact, force)),
    );
  }
}

export { missingIdMessage, skipped };
