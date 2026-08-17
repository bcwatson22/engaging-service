import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TEnv } from '../config/env.schema';
import type { TContact } from './contact.schema';

const endpoint = 'https://api.resend.com/emails';

/* Resend's REST body is snake_case, unlike their SDK's camelCase. Using fetch
   rather than the SDK keeps a dependency out of the image for one POST, and
   makes this trivially stubbable in a test. */
type TResendBody = {
  from: string;
  to: string;
  subject: string;
  text: string;
  reply_to: string;
};

/* The sender's address goes in reply_to, never in from: from must stay on the
   verified domain or Resend refuses to send, and spoofing the visitor's
   address there would fail their domain's DMARC anyway. Replying in a mail
   client then goes to the person who wrote, which is the whole point. */
const bodyFor = (
  { name, email, message }: TContact,
  from: string,
  to: string,
): TResendBody => ({
  from,
  to,
  subject: `Contact form — ${name}`,
  text: `${name} <${email}> wrote:\n\n${message}`,
  reply_to: email,
});

@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);

  constructor(private readonly config: ConfigService<TEnv, true>) {}

  /* Throws on failure rather than returning a flag, so the controller cannot
     accidentally answer 202 to a message that was never sent. The response
     body is logged but never returned to the caller — it can carry provider
     detail that is useful here and useless to a visitor. */
  async send(contact: TContact): Promise<void> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        bodyFor(
          contact,
          this.config.get('CONTACT_FROM', { infer: true }),
          this.config.get('CONTACT_TO', { infer: true }),
        ),
      ),
    });

    if (!response.ok) {
      this.logger.error(
        `Resend rejected the message: ${response.status} ${await response.text()}`,
      );

      throw new Error(`Resend responded ${response.status}`);
    }
  }
}

export { endpoint, bodyFor };
export type { TResendBody };
