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

  /* 202, not 200: the work has been accepted, not done. The Hygraph webhook
     replaces this as the trigger; it stays for manual re-renders. */
  @Post()
  @UseGuards(SecretGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(): Promise<TAccepted> {
    return { jobId: await this.render.enqueueCvPdf() };
  }
}

export type { TAccepted };
