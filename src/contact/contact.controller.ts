import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';

import { contactSchema } from './contact.schema';
import { ContactService } from './contact.service';

/* Only the headers are needed, so this is declared locally rather than
   pulling in @types/express — matching SecretGuard. */
type TRequest = { headers: Record<string, string | string[] | undefined> };

/* Fly terminates TLS at its proxy, so the socket address is the proxy's. This
   header carries the real client, and it is set by the proxy rather than
   forwarded from the request, so it cannot be spoofed by a caller. */
const addressHeader = 'fly-client-ip';

/* Unattributable requests share one bucket rather than bypassing the limit.
   In practice this only happens off-platform, since Fly always sets the
   header — a local curl, or a future move to another host. */
const unknownAddress = 'unknown';

type TAccepted = { received: true };

const accepted: TAccepted = { received: true };

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /* 202 for a message that was sent and for one that was silently discarded.
     A bot must not be able to tell which it got, so the response body and
     status are identical — the difference is only in the log.

     Not 200: the work the visitor cares about is a reply from a person, and
     that has not happened. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(
    @Body() body: unknown,
    @Req() request: TRequest,
  ): Promise<TAccepted> {
    const result = contactSchema.safeParse(body);

    /* Field paths, not messages: enough for the form to mark the offending
       inputs, without echoing submitted content back into a response. */
    if (!result.success) {
      throw new BadRequestException({
        fields: result.error.issues.map(({ path }) => path.join('.')),
      });
    }

    const address = request.headers[addressHeader];

    const outcome = await this.contact.submit(
      result.data,
      typeof address === 'string' ? address : unknownAddress,
    );

    if (outcome === 'limited') {
      throw new HttpException(
        'Too many messages from here recently. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return accepted;
  }
}

export { addressHeader, unknownAddress, accepted };
export type { TAccepted };
