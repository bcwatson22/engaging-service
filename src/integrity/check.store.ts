import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';

import { redisClient } from '../redis/redis.module';
import type { TArtifact } from '../render/render.constants';

const prefix = 'integrity-check';

/* The outcome of one check, per artifact.

   `drifted` — the live page no longer matches what was last rendered from it.
   `queued`  — this check enqueued a render to put that right.
   `stale`   — it drifted, a previous check already queued a render, and it is
               still drifting. Something is wrong that re-rendering will not
               fix, and the next check should say so rather than queue again.

   Only the last check is kept. A history of "nothing has drifted" fifty weeks
   running is not worth the space; the status page wants the current answer. */
type TCheck = {
  at: string;
  drifted: boolean;
  queued: boolean;
  stale: boolean;
};

type TOutcome = Omit<TCheck, 'at'>;

const isCheck = (value: unknown): value is TCheck => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, drifted, queued, stale } = value as TCheck;

  return (
    typeof at === 'string' &&
    [drifted, queued, stale].every((flag) => typeof flag === 'boolean')
  );
};

@Injectable()
export class CheckStore {
  constructor(@Inject(redisClient) private readonly client: IORedis) {}

  async get(artifact: TArtifact): Promise<TCheck | null> {
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

  async set(artifact: TArtifact, outcome: TOutcome): Promise<void> {
    const check: TCheck = { at: new Date().toISOString(), ...outcome };

    await this.client.set(`${prefix}:${artifact}`, JSON.stringify(check));
  }
}

export { prefix, isCheck };
export type { TCheck, TOutcome };
