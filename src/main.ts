import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import type { TEnv } from "./config/env.schema";

/* 0.0.0.0 rather than the default localhost, so the process is reachable
   from outside its container — platform health checks hit the machine's
   own address, not loopback. */
const host = "0.0.0.0";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<TEnv, true>);

  app.enableShutdownHooks();

  await app.listen(config.get("PORT", { infer: true }), host);
};

void bootstrap();

export { bootstrap, host };
