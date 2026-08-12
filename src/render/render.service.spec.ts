import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";

import { cvPdfJob, jobOptions, renderQueue } from "./render.constants";
import { missingIdMessage, RenderService } from "./render.service";

const setup = async (options: { id?: string; withoutId?: boolean } = {}) => {
  const add = vi
    .fn<() => Promise<{ id?: string }>>()
    .mockResolvedValue(options.withoutId ? {} : { id: options.id ?? "job-1" });

  const module = await Test.createTestingModule({
    providers: [
      RenderService,
      { provide: getQueueToken(renderQueue), useValue: { add } },
    ],
  }).compile();

  return { service: module.get(RenderService), add };
};

describe("RenderService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the queued job's id", async () => {
    const { service } = await setup({ id: "job-42" });

    await expect(service.enqueueCvPdf()).resolves.toBe("job-42");
  });

  it("queues the job with the retry policy", async () => {
    const { service, add } = await setup();

    await service.enqueueCvPdf();

    expect(add).toHaveBeenNthCalledWith(1, cvPdfJob, {}, jobOptions);
  });

  it("throws when the queue accepts the job without an id", async () => {
    const { service } = await setup({ withoutId: true });

    await expect(service.enqueueCvPdf()).rejects.toThrow(missingIdMessage);
  });
});
