import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { validate } from './config/env.schema';
import { ContactModule } from './contact/contact.module';
import { HealthModule } from './health/health.module';
import { IntegrityModule } from './integrity/integrity.module';
import { LinksModule } from './links/links.module';
import { RedisModule } from './redis/redis.module';
import { RenderModule } from './render/render.module';
import { StatusModule } from './status/status.module';
import { StreamModule } from './stream/stream.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
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
    StreamModule,
    WebhooksModule,
  ],
})
export class AppModule {}
