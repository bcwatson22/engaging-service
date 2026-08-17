import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';

import type { TEnv } from '../config/env.schema';
import { createConnection } from '../redis/connection';
import type { TArtifact } from './render.constants';

/* A new prefix rather than the single key this replaced. That key holds a
   string, and pushing a list onto it would fail with WRONGTYPE against a
   deployment that has already recorded a render. The old key is left where it
   is — one small string, orphaned, cheaper to ignore than to migrate. */
const prefix = 'render-history';

/* Renders happen roughly twice a month, so twenty entries is the best part of
   a year — long enough to be a history, short enough that the whole list can
   be read on every status request without paging. */
const limit = 20;

/* What a render produced, and what it took to get there.

   `result` is whatever the processor returned — a public URL for the PDF, a
   count for the startup images, which have no single URL between them.

   `durationMs` is the render itself. `elapsedMs` is enqueue to finish, so the
   difference between them is time spent waiting for the site to catch up: the
   publish race that the content-hash check retries through. `attempts` is how
   many passes that took. Recorded because the logs are the only other place
   this exists, and they go with the machine. */
type TRecord = {
  at: string;
  result: string;
  durationMs: number;
  attempts: number;
  elapsedMs: number;
};

/* What the processor knows; `at` is stamped here so a caller cannot record a
   render as having happened at a time of its choosing. */
type TOutcome = Omit<TRecord, 'at'>;

const isNumber = (value: unknown): boolean => typeof value === 'number';

const isRecord = (value: unknown): value is TRecord => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, result, durationMs, attempts, elapsedMs } = value as TRecord;

  return (
    typeof at === 'string' &&
    typeof result === 'string' &&
    [durationMs, attempts, elapsedMs].every(isNumber)
  );
};

@Injectable()
export class RecordStore implements OnModuleDestroy {
  /* Its own connection, matching the other stores: BullMQ's client holds
     blocking reads and sharing it would stall a lookup. */
  private readonly client: IORedis;

  constructor(config: ConfigService<TEnv, true>) {
    this.client = createConnection(config.get('REDIS_URL', { infer: true }));
  }

  /* Newest first, so the page's "last rendered" is the head of the list and
     needs no sorting. */
  async history(artifact: TArtifact): Promise<TRecord[]> {
    const stored = await this.client.lrange(
      `${prefix}:${artifact}`,
      0,
      limit - 1,
    );

    return stored.map(parse).filter((record) => record !== null);
  }

  /* Pushed then trimmed, so the list cannot grow past the limit even if a
     render loop went wrong. Both in one pipeline: two round trips to Upstash
     for something written a couple of times a month is still two more than
     it needs. */
  async add(artifact: TArtifact, outcome: TOutcome): Promise<void> {
    const record: TRecord = { at: new Date().toISOString(), ...outcome };
    const key = `${prefix}:${artifact}`;

    await this.client
      .multi()
      .lpush(key, JSON.stringify(record))
      .ltrim(key, 0, limit - 1)
      .exec();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

/* Anything unreadable is dropped rather than thrown over. A status page is not
   worth failing for a value someone changed by hand, and one bad entry should
   not take the rest of the history with it. */
const parse = (stored: string): TRecord | null => {
  try {
    const value: unknown = JSON.parse(stored);

    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
};

export { prefix, limit, isRecord, parse };
export type { TRecord, TOutcome };
