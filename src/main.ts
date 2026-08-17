import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
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

  /* Only the site, and only the one verb the browser uses. Everything else
     here is called server-to-server — Hygraph's webhook and the manual render
     trigger — and none of those are subject to CORS at all, so widening this
     would grant access to nothing that needs it.

     SITE_URL rather than a second variable: the origin the renderer navigates
     to and the origin allowed to post a contact form are the same site, and
     two variables that must agree is a way for them to disagree. */
  app.enableCors({ origin: config.get('SITE_URL', { infer: true }) });

  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }), host);
};

void bootstrap();

export { bootstrap, host };
