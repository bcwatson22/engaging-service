import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';

import type { TEnv } from '../config/env.schema';
import { createConnection } from '../redis/connection';
import type { TArtifact } from './render.constants';

const prefix = 'render-record';

/* What a render produced, kept so something other than the logs can answer
   "is the PDF current?". `result` is whatever the processor returned — a
   public URL for the PDF, a count for the startup images, which do not have
   a single URL between them. */
type TRecord = {
  at: string;
  result: string;
};

const isRecord = (value: unknown): value is TRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TRecord).at === 'string' &&
  typeof (value as TRecord).result === 'string';

@Injectable()
export class RecordStore implements OnModuleDestroy {
  /* Its own connection, matching the other stores: BullMQ's client holds
     blocking reads and sharing it would stall a lookup. */
  private readonly client: IORedis;

  constructor(config: ConfigService<TEnv, true>) {
    this.client = createConnection(config.get('REDIS_URL', { infer: true }));
  }

  async get(artifact: TArtifact): Promise<TRecord | null> {
    const stored = await this.client.get(`${prefix}:${artifact}`);

    if (!stored) return null;

    /* Anything unreadable is treated as nothing recorded. A status page is
       not worth failing over a value someone changed by hand, and the next
       render replaces it. */
    try {
      const parsed: unknown = JSON.parse(stored);

      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(artifact: TArtifact, result: string): Promise<void> {
    const record: TRecord = { at: new Date().toISOString(), result };

    await this.client.set(`${prefix}:${artifact}`, JSON.stringify(record));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { prefix, isRecord };
export type { TRecord };
