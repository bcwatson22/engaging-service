import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { TEnv } from './config/env.schema';
import { validate } from './config/env.schema';
import { ContactModule } from './contact/contact.module';
import { HealthModule } from './health/health.module';
import { createConnection } from './redis/connection';
import { RenderModule } from './render/render.module';
import { StatusModule } from './status/status.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<TEnv, true>) => ({
        connection: createConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    ContactModule,
    HealthModule,
    RenderModule,
    StatusModule,
    WebhooksModule,
  ],
})
export class AppModule {}
