import { Injectable, Logger } from '@nestjs/common';

import { StreamService } from '../stream/stream.service';
import { artifacts, type TArtifact } from './render.constants';

/* Returned when the stream collapsed the job as a duplicate. The caller wants
   an id per artifact, and a webhook that 500s because a duplicate was
   correctly ignored would be worse than a meaningless one. */
const skipped = 'skipped';

/* What remains of this after rendering moved: somewhere for the webhook, the
   manual trigger and the integrity check to ask for an artifact without any of
   them knowing how it gets made, or by which service. */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  constructor(private readonly stream: StreamService) {}

  /* Returns as soon as the job is durable in Redis — a render takes tens of
     seconds and a full set of startup images considerably longer, both far
     beyond what any webhook sender will wait for.

     `force` skips the worker's unchanged-content check. A CMS publish should
     never set it, because waiting for the content to change is the entire
     point; a manual re-render after a print-stylesheet change must. */
  async enqueue(artifact: TArtifact, force = false): Promise<string> {
    const streamed = await this.stream.enqueue(artifact, force);

    this.logger.log(
      `Requested ${artifact}${force ? ' (forced)' : ''}: ${streamed ?? skipped}`,
    );

    return streamed ?? skipped;
  }

  /* A publish changes the content every artifact is derived from, so all of
     them are re-made rather than only the CV PDF. */
  async enqueueAll(force = false): Promise<string[]> {
    return await Promise.all(
      artifacts.map((artifact) => this.enqueue(artifact, force)),
    );
  }
}

export { skipped };
