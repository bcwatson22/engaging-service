import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { isArtifact } from './render.constants';
import { RenderService } from './render.service';
import { SecretGuard } from './secret.guard';

type TAccepted = { jobId: string };

@Controller('render')
@UseGuards(SecretGuard)
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /* 202, not 200: the work has been accepted, not done.

     Forced, because this exists for re-rendering after a change the CMS knows
     nothing about — a print-stylesheet tweak. Without it the unchanged-content
     check would reject every manual trigger.

     Per-artifact rather than all-at-once, so a PDF tweak does not also spend
     two minutes recapturing twenty-two screenshots. */
  @Post(':artifact')
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(@Param('artifact') artifact: string): Promise<TAccepted> {
    if (!isArtifact(artifact)) throw new NotFoundException();

    return { jobId: await this.render.enqueue(artifact, true) };
  }
}

export type { TAccepted };
