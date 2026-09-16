import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { TArtifact } from '../render/render.constants';
import { SecretGuard } from '../render/secret.guard';
import type { TOutcome } from './check.store';
import { IntegrityService } from './integrity.service';

type TChecked = { checks: Record<TArtifact, TOutcome> };

@Controller('integrity')
@UseGuards(SecretGuard)
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  /* For the site's deploy pipeline, once a production deploy is live. Not
     forced, unlike POST /render: it queues a render only for an artifact whose
     pages have actually changed, so a deploy that touches neither the home page
     nor the CV costs nothing but two page fetches.

     200 rather than 202: the checks are finished when this answers. Only the
     renders they queued are still to come. */
  @Post()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<TChecked> {
    return { checks: await this.integrity.checkAll() };
  }
}

export type { TChecked };
