import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';

import { redisClient } from '../redis/redis.module';
import type { Result } from './check';

const key = 'link-sweep';

/* What the last sweep found.

   `checked` is the count; `problems` is only the links that were not fine.
   Storing every result would be storing "this link still works" a dozen times
   a week, which is a fact nobody reads and the count already implies. */
type Sweep = {
  at: string;
  checked: number;
  problems: Result[];
};

const isResult = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;

  const { url, status, state } = value as Result;

  return (
    typeof url === 'string' &&
    typeof status === 'number' &&
    ['ok', 'blocked', 'broken'].includes(state)
  );
};

const isSweep = (value: unknown): value is Sweep => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, checked, problems } = value as Sweep;

  return (
    typeof at === 'string' &&
    typeof checked === 'number' &&
    Array.isArray(problems) &&
    problems.every(isResult)
  );
};

@Injectable()
export class SweepStore {
  constructor(@Inject(redisClient) private readonly client: IORedis) {}

  async get(): Promise<Sweep | null> {
    const stored = await this.client.get(key);

    if (!stored) return null;

    try {
      const value: unknown = JSON.parse(stored);

      return isSweep(value) ? value : null;
    } catch {
      return null;
    }
  }

  async set(checked: number, problems: Result[]): Promise<void> {
    const sweep: Sweep = {
      at: new Date().toISOString(),
      checked,
      problems,
    };

    await this.client.set(key, JSON.stringify(sweep));
  }
}

export { key, isSweep, isResult };
export type { Sweep };
