import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TEnv } from '../config/env.schema';

/* Long enough to cover a cold boot. The image carries Chrome and was measured
   at 21.3 seconds from stopped to serving, and the Fly proxy holds the request
   open while the machine starts. */
const wakeTimeoutMs = 45_000;

const wakePath = '/health';

@Injectable()
export class WorkerClient {
  private readonly logger = new Logger(WorkerClient.name);

  private readonly base: string;

  constructor(config: ConfigService<TEnv, true>) {
    this.base = config.get('WORKER_URL', { infer: true });
  }

  /* Starts the worker machine if it is stopped.

     An XADD cannot do this: Fly only autostarts a machine on traffic through
     its proxy, so something has to make an HTTP request. It must be the
     Flycast address rather than `.internal` — 6PN bypasses the proxy entirely
     and the request fails instantly against a stopped machine, waking nothing.

     Deliberately not awaited by callers. A wake can take the machine's full
     boot time, and nothing on the enqueue path should wait for that; the queue
     is already durable by then. A failed wake means the render is late, not
     lost — the backstop sweep picks it up. */
  async wake(reason: string): Promise<boolean> {
    const url = `${this.base}${wakePath}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(wakeTimeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`Waking the worker returned ${response.status}`);

        return false;
      }

      this.logger.log(`Woke the worker (${reason})`);

      return true;
    } catch (error) {
      /* Never thrown onward: the caller has already made the job durable, and
         a webhook that fails because a wake failed would be a worse outcome
         than a late render. */
      this.logger.warn(
        `Could not wake the worker (${reason}): ${String(error)}`,
      );

      return false;
    }
  }
}

export { wakeTimeoutMs, wakePath };
