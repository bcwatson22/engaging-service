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

/* RESP2 returns XINFO as a flat [key, value, key, value] array rather than a
   map, and ioredis passes that through untouched. */
const fromFlat = (flat: unknown[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (let i = 0; i < flat.length - 1; i += 2) {
    out[String(flat[i])] = flat[i + 1];
  }

  return out;
};

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

  /* What the backstop needs: anything not yet delivered, and anything a
     consumer took and never acked.

     Deliberately not XLEN. A stream keeps its entries after they are acked —
     they leave only when trimmed — so XLEN counts finished work and never
     returns to zero. The backstop read that as "something is waiting" and woke
     the worker every fifteen minutes forever: ~96 boots a day for nothing,
     which is most of the saving this whole split is meant to produce.

     The group's `lag` is the honest measure: entries added but not yet handed
     to a consumer. */
  async depth(): Promise<{ waiting: number; pending: number }> {
    try {
      const groups = (await this.client.call(
        'XINFO',
        'GROUPS',
        renderStream,
      )) as unknown[][];

      const group = groups
        .map((flat) => fromFlat(flat))
        .find((g) => g.name === renderGroup);

      /* No group yet means the worker has never started. Anything already on
         the stream is genuinely undelivered, so fall back to its length. */
      if (!group)
        return { waiting: await this.client.xlen(renderStream), pending: 0 };

      return {
        waiting: await this.waiting(group),
        pending: Number(group.pending ?? 0),
      };
    } catch {
      /* No stream at all — nothing has ever been queued. */
      return { waiting: 0, pending: 0 };
    }
  }

  /* Redis reports lag as null when it cannot work it out, which happens once
     entries have been trimmed or deleted from under the group. Comparing the
     group's last-delivered id against the stream's last id answers the only
     question the backstop actually asks: is there anything it has not seen? */
  private async waiting(group: Record<string, unknown>): Promise<number> {
    if (group.lag !== null && group.lag !== undefined) return Number(group.lag);

    const info = fromFlat(
      (await this.client.call('XINFO', 'STREAM', renderStream)) as unknown[],
    );

    return info['last-generated-id'] === group['last-delivered-id'] ? 0 : 1;
  }
}

export { duplicateMessage };
