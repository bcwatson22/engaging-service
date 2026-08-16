import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RenderService } from '../render/render.service';
import { SignatureGuard } from './signature.guard';

type TAccepted = { jobIds: string[] };

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly render: RenderService) {}

  /* Every artifact, because a publish changes the content all of them are
     derived from. Not forced: each job waits for the site to finish
     revalidating before its pages are captured.

     Hygraph is configured to call this only for the CV model. */
  @Post('hygraph')
  @UseGuards(SignatureGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async hygraph(): Promise<TAccepted> {
    return { jobIds: await this.render.enqueueAll() };
  }
}

export type { TAccepted };
