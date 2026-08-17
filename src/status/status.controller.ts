import { Controller, Get, Header } from '@nestjs/common';

import { StatusService, type TStatus } from './status.service';

/* A minute. Long enough that hitting this repeatedly cannot be used to probe
   the service or keep the machine awake, short enough that someone watching a
   render land does not think it has stalled. */
const cacheControl = 'public, max-age=60';

/* Deliberately unguarded: this exists to be looked at, and the site's own
   status page is only its first reader.

   Deliberately boring, too — render times, what each render produced, and how
   many jobs are in the queue. No environment values, no error text, no
   internal hostnames. Nothing here should tell anybody something they could
   not learn by watching the site. */
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  @Header('cache-control', cacheControl)
  async read(): Promise<TStatus> {
    return await this.status.read();
  }
}

export { cacheControl };
