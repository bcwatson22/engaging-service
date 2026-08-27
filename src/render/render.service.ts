import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { StreamService } from '../stream/stream.service';
import {
  artifacts,
  jobOptions,
  renderQueue,
  type TArtifact,
  type TRenderJob,
} from './render.constants';

const missingIdMessage = 'The queue accepted the job without returning an id';

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  constructor(
    @InjectQueue(renderQueue) private readonly queue: Queue,
    private readonly stream: StreamService,
  ) {}

  /* Returns as soon as the job is durable in Redis — a render takes 10–20
     seconds and a full set of startup images considerably longer, both far
     beyond what any webhook sender will wait for.

     `force` skips the unchanged-content check. A CMS publish should never set
     it, because waiting for the content to change is the entire point; a
     manual re-render after a print-stylesheet change must. */
  async enqueue(artifact: TArtifact, force = false): Promise<string> {
    const data: TRenderJob = { force };

    const { id } = await this.queue.add(artifact, data, jobOptions);

    if (!id) throw new Error(missingIdMessage);

    this.logger.log(`Queued ${artifact} as ${id}${force ? ' (forced)' : ''}`);

    /* Both paths, deliberately. The Go worker renders to a candidate/ prefix
       while this one still produces everything the site links to, so the two
       can be compared over real publishes before anything is cut over. The
       stream enqueue never throws — a failure there must not take down the
       path that currently does the work. */
    await this.stream.enqueue(artifact, force);

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

export { missingIdMessage };
