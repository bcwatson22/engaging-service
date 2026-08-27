import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { StreamService } from './stream.service';
import { WorkerClient } from './worker.client';

/* Every fifteen minutes, and the interval is a cost decision rather than a
   habit. Two commands a tick against a 500,000/month allowance:

     every minute      120/hr   ~87,600/mo   ~17.5%
     every 5 minutes    24/hr   ~17,500/mo    ~3.5%
     every 15 minutes    8/hr    ~5,800/mo    ~1.2%

   Nothing waits on a render, so fifteen minutes is defensible and a minute is
   not. This is also a poller, and a poller is what caused #24 — costing it
   before choosing it is the point. */
const schedule = '*/15 * * * *';

const idleMessage = 'Nothing waiting, worker left asleep';

@Injectable()
export class BackstopService {
  private readonly logger = new Logger(BackstopService.name);

  constructor(
    private readonly stream: StreamService,
    private readonly worker: WorkerClient,
  ) {}

  /* The safety net for a wake that never landed.

     A wake can fail — the request times out, or the worker crashed and left
     the machine stopped with a message still pending. Without this, that job
     waits for the next CMS publish, which could be weeks: an artifact silently
     stale with nothing to say so.

     It also gives XAUTOCLAIM something to run on. Orphan recovery is worthless
     if nothing is ever awake to perform it. */
  @Cron(schedule, { name: 'stream-backstop' })
  async sweep(): Promise<void> {
    const { waiting, pending } = await this.stream.depth();

    if (waiting === 0 && pending === 0) {
      this.logger.debug(idleMessage);

      return;
    }

    this.logger.warn(
      `Stream not empty (${waiting} waiting, ${pending} pending) — waking the worker`,
    );

    await this.worker.wake('backstop sweep');
  }
}

export { schedule, idleMessage };
