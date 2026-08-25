import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';

import type { TEnv } from '../config/env.schema';
import { createConnection } from './connection';

/* One client for every plain key/value store in the app.

   Each store used to open its own, which meant six sockets for work that is
   almost entirely idle: the rate limit sees a few writes a month, the render
   stores twice a month, the integrity and sweep stores once a week. Upstash
   closes connections that have been idle and ioredis reauthenticates on the
   next command, so each of those sockets sat in a churn cycle costing
   commands while doing nothing. Measured at ~565 commands an hour against a
   500,000/month allowance, with the machine otherwise doing no work at all.

   Still deliberately separate from BullMQ's connection. The queue holds
   blocking reads, and a blocking read on a shared client would stall every
   lookup behind it — including one a visitor is waiting on. Sharing among
   these stores is safe precisely because none of them block. */
const redisClient = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: redisClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<TEnv, true>): IORedis =>
        createConnection(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [redisClient],
})
export class RedisModule implements OnModuleDestroy {
  /* The module owns the lifecycle now that the stores no longer do. A raw
     ioredis instance has no Nest hook of its own, so the close has to hang
     off something Nest will call. */
  constructor(@Inject(redisClient) private readonly client: IORedis) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { redisClient };
