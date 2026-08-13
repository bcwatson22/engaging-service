import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";

import { RenderService } from "../render/render.service";
import { SignatureGuard } from "./signature.guard";

type TAccepted = { jobId: string };

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly render: RenderService) {}

  /* Not forced: a publish should wait for the site to finish revalidating
     before the page is captured. Hygraph is configured to call this only for
     the CV model. */
  @Post("hygraph")
  @UseGuards(SignatureGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async hygraph(): Promise<TAccepted> {
    return { jobId: await this.render.enqueueCvPdf() };
  }
}

export type { TAccepted };
