import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

import type { TEnv } from "../config/env.schema";

const prefix = "content-hash";

@Injectable()
export class HashStore implements OnModuleDestroy {
  /* Its own connection rather than BullMQ's: the queue holds blocking reads,
     and sharing a client with them would stall these lookups. */
  private readonly client: IORedis;

  constructor(config: ConfigService<TEnv, true>) {
    this.client = new IORedis(config.get("REDIS_URL", { infer: true }));
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(`${prefix}:${key}`);
  }

  async set(key: string, hash: string): Promise<void> {
    await this.client.set(`${prefix}:${key}`, hash);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { prefix };
