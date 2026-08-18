import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';

import type { TEnv } from '../config/env.schema';
import { createConnection } from '../redis/connection';
import type { TResult } from './check';

const key = 'link-sweep';

/* What the last sweep found.

   `checked` is the count; `problems` is only the links that were not fine.
   Storing every result would be storing "this link still works" a dozen times
   a week, which is a fact nobody reads and the count already implies. */
type TSweep = {
  at: string;
  checked: number;
  problems: TResult[];
};

const isResult = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;

  const { url, status, state } = value as TResult;

  return (
    typeof url === 'string' &&
    typeof status === 'number' &&
    ['ok', 'blocked', 'broken'].includes(state)
  );
};

const isSweep = (value: unknown): value is TSweep => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, checked, problems } = value as TSweep;

  return (
    typeof at === 'string' &&
    typeof checked === 'number' &&
    Array.isArray(problems) &&
    problems.every(isResult)
  );
};

@Injectable()
export class SweepStore implements OnModuleDestroy {
  private readonly client: IORedis;

  constructor(config: ConfigService<TEnv, true>) {
    this.client = createConnection(config.get('REDIS_URL', { infer: true }));
  }

  async get(): Promise<TSweep | null> {
    const stored = await this.client.get(key);

    if (!stored) return null;

    try {
      const value: unknown = JSON.parse(stored);

      return isSweep(value) ? value : null;
    } catch {
      return null;
    }
  }

  async set(checked: number, problems: TResult[]): Promise<void> {
    const sweep: TSweep = {
      at: new Date().toISOString(),
      checked,
      problems,
    };

    await this.client.set(key, JSON.stringify(sweep));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { key, isSweep, isResult };
export type { TSweep };
