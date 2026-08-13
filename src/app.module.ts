import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

import type { TEnv } from "./config/env.schema";
import { validate } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { RenderModule } from "./render/render.module";

/* BullMQ workers issue blocking reads, which ioredis will otherwise abort
   after its default retry limit. null disables that ceiling, as BullMQ
   requires. */
const connectionOptions = { maxRetriesPerRequest: null };

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<TEnv, true>) => ({
        connection: new IORedis(
          config.get("REDIS_URL", { infer: true }),
          connectionOptions,
        ),
      }),
    }),
    HealthModule,
    RenderModule,
  ],
})
export class AppModule {}

export { connectionOptions };
