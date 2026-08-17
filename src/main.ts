import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { originsFor } from './config/cors';
import type { TEnv } from './config/env.schema';

/* 0.0.0.0 rather than the default localhost, so the process is reachable
   from outside its container — platform health checks hit the machine's
   own address, not loopback. */
const host = '0.0.0.0';

const bootstrap = async (): Promise<void> => {
  /* rawBody so the Hygraph signature can be verified against the exact
     bytes that were signed — a re-serialised body produces a different HMAC. */
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<TEnv, true>);

  app.enableCors({
    origin: originsFor(
      config.get('SITE_URL', { infer: true }),
      config.get('NODE_ENV', { infer: true }) === 'production',
    ),
  });

  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }), host);
};

void bootstrap();

export { bootstrap, host };
