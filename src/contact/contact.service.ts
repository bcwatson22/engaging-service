import { Injectable, Logger } from '@nestjs/common';

import { looksAutomated, type TContact } from './contact.schema';
import { Mailer } from './mailer';
import { RateLimitStore } from './rate-limit.store';

/* Distinguished from a plain boolean so the controller can map each to a
   different status without re-deriving why. `discarded` is deliberately not an
   error: it is what a bot gets, and it must be indistinguishable from `sent`
   from the outside. */
type TOutcome = 'sent' | 'discarded' | 'limited';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly rateLimit: RateLimitStore,
  ) {}

  async submit(contact: TContact, address: string): Promise<TOutcome> {
    /* Timing is checked before the rate limit, so an obvious bot never gets to
       consume a counter that a person sharing its address might need. */
    if (looksAutomated(contact, Date.now())) {
      this.logger.log('Discarded a submission that failed the timing check');

      return 'discarded';
    }

    if (!(await this.rateLimit.allows(address, contact.email))) {
      this.logger.warn('Rate limit reached for a contact submission');

      return 'limited';
    }

    await this.mailer.send(contact);

    return 'sent';
  }
}

export type { TOutcome };
