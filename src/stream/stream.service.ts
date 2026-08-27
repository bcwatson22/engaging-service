import { Inject, Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';

import { redisClient } from '../redis/redis.module';
import { HashStore } from '../render/hash.store';
import type { TArtifact } from '../render/render.constants';
import {
  dedupePrefix,
  dedupeSeconds,
  payloadField,
  renderGroup,
  renderStream,
  streamMaxLength,
  streamVersion,
  type TStreamJob,
} from './stream.constants';
import { WorkerClient } from './worker.client';

const duplicateMessage = 'already queued moments ago, collapsing';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    @Inject(redisClient) private readonly client: IORedis,
    private readonly hashes: HashStore,
    private readonly worker: WorkerClient,
  ) {}

  /* Puts a job on the stream and wakes the worker.

     Returns the message id, or null when the job was collapsed as a duplicate.
     Never throws: this runs alongside the BullMQ enqueue that still does the
     real work, and a failure here must not take the working path down with
     it. */
  async enqueue(artifact: TArtifact, force = false): Promise<string | null> {
    try {
      if (!(await this.claim(artifact))) {
        this.logger.log(`${artifact} ${duplicateMessage}`);

        return null;
      }

      const id = await this.client.xadd(
        renderStream,
        'MAXLEN',
        '~',
        streamMaxLength,
        '*',
        payloadField,
        JSON.stringify(await this.payload(artifact, force)),
      );

      this.logger.log(
        `Streamed ${artifact} as ${id}${force ? ' (forced)' : ''}`,
      );

      /* Not awaited: see WorkerClient.wake. The job is durable already, and a
         cold boot is far longer than anything this path should hold. */
      void this.worker.wake(`${artifact} queued`);

      return id;
    } catch (error) {
      this.logger.error(`Could not stream ${artifact}: ${String(error)}`);

      return null;
    }
  }

  /* SET NX is the whole of the idempotency. A stream id cannot carry it —
     Redis ids must be <ms>-<seq> and a hash is rejected outright — so the
     collapse has to live in a key beside the stream rather than in it. */
  private async claim(artifact: TArtifact): Promise<boolean> {
    const claimed = await this.client.set(
      `${dedupePrefix}:${artifact}`,
      '1',
      'EX',
      dedupeSeconds,
      'NX',
    );

    return claimed === 'OK';
  }

  /* contentHash is what was last rendered, not what is live now. Reading the
     live page here would put a network fetch on the webhook path to produce a
     value the worker recomputes anyway — it does its own check, because by the
     time it runs the site has usually finished revalidating. Recording the
     previous hash instead costs one lookup and makes a dead letter legible:
     it says which version this job was meant to supersede. */
  private async payload(
    artifact: TArtifact,
    force: boolean,
  ): Promise<TStreamJob> {
    const previous = (await this.hashes.get(artifact)) ?? '';

    return {
      v: streamVersion,
      job: artifact,
      contentHash: previous,
      requestedAt: new Date().toISOString(),
      force,
    };
  }

  /* What the backstop needs: anything waiting, and anything a consumer took
     and never acked. */
  async depth(): Promise<{ waiting: number; pending: number }> {
    const waiting = await this.client.xlen(renderStream);

    let pending = 0;
    try {
      const summary = (await this.client.xpending(
        renderStream,
        renderGroup,
      )) as [number, ...unknown[]] | null;

      pending = summary?.[0] ?? 0;
    } catch {
      /* No group yet means the worker has never started, which is not an
         error — there is simply nothing pending. */
      pending = 0;
    }

    return { waiting, pending };
  }
}

export { duplicateMessage };
