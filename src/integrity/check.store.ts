import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';

import { redisClient } from '../redis/redis.module';
import type { Artifact } from '../render/render.constants';

const prefix = 'integrity-check';

/* The outcome of one check, per artifact.

   `drifted` — the live page no longer matches what was last rendered from it.
   `queued`  — this check enqueued a render to put that right.
   `stale`   — it drifted, a previous check already queued a render for this
               same live page, and it is still drifting. Something is wrong
               that re-rendering will not fix, and the next check should say
               so rather than queue again.
   `live`    — the hash of the live page this check saw. It is what tells a
               render that did not take apart from a new change: two deploys
               in a row that each alter the page are two different drifts,
               and the second deserves a render as much as the first.

   Only the last check is kept. A history of "nothing has drifted" fifty weeks
   running is not worth the space; the status page wants the current answer. */
type Check = {
  at: string;
  drifted: boolean;
  queued: boolean;
  stale: boolean;
  live?: string;
};

type Outcome = Omit<Check, 'at'>;

const isCheck = (value: unknown): value is Check => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, drifted, queued, stale, live } = value as Check;

  /* live is optional: checks stored before it existed are still read. */
  return (
    typeof at === 'string' &&
    [drifted, queued, stale].every((flag) => typeof flag === 'boolean') &&
    (live === undefined || typeof live === 'string')
  );
};

@Injectable()
export class CheckStore {
  constructor(@Inject(redisClient) private readonly client: IORedis) {}

  async get(artifact: Artifact): Promise<Check | null> {
    const stored = await this.client.get(`${prefix}:${artifact}`);

    if (!stored) return null;

    /* Anything unreadable is treated as never checked, which makes the next
       check behave as a first one — it will queue a render if the artifact
       has drifted, which is the safe direction to be wrong in. */
    try {
      const value: unknown = JSON.parse(stored);

      return isCheck(value) ? value : null;
    } catch {
      return null;
    }
  }

  async set(artifact: Artifact, outcome: Outcome): Promise<void> {
    const check: Check = { at: new Date().toISOString(), ...outcome };

    await this.client.set(`${prefix}:${artifact}`, JSON.stringify(check));
  }
}

export { prefix, isCheck };
export type { Check, Outcome };
