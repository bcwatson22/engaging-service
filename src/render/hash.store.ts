import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';

import { redisClient } from '../redis/redis.module';

const prefix = 'content-hash';

@Injectable()
export class HashStore {
  constructor(@Inject(redisClient) private readonly client: IORedis) {}

  async get(key: string): Promise<string | null> {
    return await this.client.get(`${prefix}:${key}`);
  }

  async set(key: string, hash: string): Promise<void> {
    await this.client.set(`${prefix}:${key}`, hash);
  }
}

export { prefix };
