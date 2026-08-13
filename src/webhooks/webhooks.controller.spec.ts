import { Test } from "@nestjs/testing";

import { RenderService } from "../render/render.service";
import { SignatureGuard } from "./signature.guard";
import { WebhooksController } from "./webhooks.controller";

const setup = async () => {
  const enqueueCvPdf = vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("job-9");

  const module = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [{ provide: RenderService, useValue: { enqueueCvPdf } }],
  })
    .overrideGuard(SignatureGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: module.get(WebhooksController), enqueueCvPdf };
};

describe("WebhooksController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the id of the queued job", async () => {
    const { controller } = await setup();

    await expect(controller.hygraph()).resolves.toEqual({ jobId: "job-9" });
  });

  it("does not force the render, so the content check still applies", async () => {
    const { controller, enqueueCvPdf } = await setup();

    await controller.hygraph();

    expect(enqueueCvPdf).toHaveBeenNthCalledWith(1);
  });
});
