import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';

import type { TEnv } from '../config/env.schema';
import { createConnection } from '../redis/connection';

const prefix = 'contact-rate';

const windowSeconds = 60 * 60;

/* Two limits, because they fail differently. A single sender working through
   a proxy pool defeats the address limit but not the identity one; a bot
   rotating addresses from one host defeats the identity limit but not the
   address one. Neither number needs to be generous — a person who genuinely
   needs to write four times in an hour can reply to the first email. */
const maxPerAddress = 5;
const maxPerIdentity = 3;

@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  /* Its own connection, matching HashStore: BullMQ's client holds blocking
     reads and sharing it would stall a lookup that a visitor is waiting on. */
  private readonly client: IORedis;

  constructor(config: ConfigService<TEnv, true>) {
    this.client = createConnection(config.get('REDIS_URL', { infer: true }));
  }

  /* INCR then EXPIRE on first hit, so the window starts at the first request
     rather than sliding forward with each one — otherwise a steady trickle
     could hold the key alive indefinitely and never reset.

     Counted before the send is attempted, so a provider outage cannot be
     retried into an unbounded number of attempts. */
  private async hit(key: string, max: number): Promise<boolean> {
    const count = await this.client.incr(`${prefix}:${key}`);

    if (count === 1)
      await this.client.expire(`${prefix}:${key}`, windowSeconds);

    return count <= max;
  }

  async allows(address: string, identity: string): Promise<boolean> {
    /* Both are incremented even when the first has already failed, so a
       caller cannot discover which limit they are hitting by watching which
       one stops counting. */
    const [byAddress, byIdentity] = await Promise.all([
      this.hit(`ip:${address}`, maxPerAddress),
      this.hit(`email:${identity.toLowerCase()}`, maxPerIdentity),
    ]);

    return byAddress && byIdentity;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { prefix, windowSeconds, maxPerAddress, maxPerIdentity };
