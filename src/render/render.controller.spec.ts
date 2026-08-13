import { Test } from "@nestjs/testing";

import { RenderController } from "./render.controller";
import { RenderService } from "./render.service";
import { SecretGuard } from "./secret.guard";

const setup = async () => {
  const enqueueCvPdf = vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("job-7");

  const module = await Test.createTestingModule({
    controllers: [RenderController],
    providers: [{ provide: RenderService, useValue: { enqueueCvPdf } }],
  })
    .overrideGuard(SecretGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: module.get(RenderController), enqueueCvPdf };
};

describe("RenderController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the id of the queued job", async () => {
    const { controller } = await setup();

    await expect(controller.trigger()).resolves.toEqual({ jobId: "job-7" });
  });

  it("forces the render, since a manual trigger may follow a change the CMS does not know about", async () => {
    const { controller, enqueueCvPdf } = await setup();

    await controller.trigger();

    expect(enqueueCvPdf).toHaveBeenNthCalledWith(1, true);
  });
});
