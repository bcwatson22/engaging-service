import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";

import { RenderService } from "./render.service";
import { SecretGuard } from "./secret.guard";

type TAccepted = { jobId: string };

@Controller("render")
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /* 202, not 200: the work has been accepted, not done.

     Forced, because this exists for re-rendering after a change the CMS knows
     nothing about — a print-stylesheet tweak. Without it the unchanged-content
     check would reject every manual trigger. */
  @Post()
  @UseGuards(SecretGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(): Promise<TAccepted> {
    return { jobId: await this.render.enqueueCvPdf(true) };
  }
}

export type { TAccepted };
