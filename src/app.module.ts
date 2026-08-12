import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { validate } from "./config/env.schema";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate }), HealthModule],
})
export class AppModule {}
