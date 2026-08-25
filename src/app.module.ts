import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import type { TEnv } from './config/env.schema';
import { validate } from './config/env.schema';
import { ContactModule } from './contact/contact.module';
import { HealthModule } from './health/health.module';
import { IntegrityModule } from './integrity/integrity.module';
import { LinksModule } from './links/links.module';
import { createConnection } from './redis/connection';
import { RedisModule } from './redis/redis.module';
import { RenderModule } from './render/render.module';
import { StatusModule } from './status/status.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      /* Its own connection, not the shared one. A worker's blocking read
         would stall every other command queued behind it on the same client. */
      useFactory: (config: ConfigService<TEnv, true>) => ({
        connection: createConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    /* Registered once here; the @Cron decorators are discovered from it. Only
       useful because the machine no longer sleeps — a timer in a stopped
       container never fires. */
    ScheduleModule.forRoot(),
    RedisModule,
    ContactModule,
    HealthModule,
    IntegrityModule,
    LinksModule,
    RenderModule,
    StatusModule,
    WebhooksModule,
  ],
})
export class AppModule {}
