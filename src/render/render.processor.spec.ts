import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";

import { StorageService } from "../storage/storage.service";
import { launch } from "./browser";
import { renderPdf } from "./pdf";
import { cvPdf } from "./render.constants";
import { RenderProcessor } from "./render.processor";

vi.mock("./browser", () => ({ launch: vi.fn<() => Promise<unknown>>() }));
vi.mock("./pdf", () => ({ renderPdf: vi.fn<() => Promise<Uint8Array>>() }));

const siteUrl = "https://www.engaging.engineering";
const uploadedUrl = "https://artifacts.example.com/billy-watson-cv.pdf";

const job = { id: "job-1" } as Job;

const setup = async () => {
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const upload = vi.fn<() => Promise<string>>().mockResolvedValue(uploadedUrl);
  const pdf = Buffer.from("pdf");

  vi.mocked(launch).mockResolvedValue({ close } as never);
  vi.mocked(renderPdf).mockResolvedValue(pdf);

  const module = await Test.createTestingModule({
    providers: [
      RenderProcessor,
      { provide: StorageService, useValue: { upload } },
      { provide: ConfigService, useValue: { get: () => siteUrl } },
    ],
  }).compile();

  return { processor: module.get(RenderProcessor), close, upload, pdf };
};

describe("RenderProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the CV page of the configured site", async () => {
    const { processor } = await setup();

    await processor.process(job);

    expect(renderPdf).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      `${siteUrl}${cvPdf.path}`,
    );
  });

  it("uploads the rendered document under its stable key", async () => {
    const { processor, upload, pdf } = await setup();

    await processor.process(job);

    expect(upload).toHaveBeenNthCalledWith(
      1,
      cvPdf.key,
      pdf,
      cvPdf.contentType,
    );
  });

  it("returns the public url of the uploaded document", async () => {
    const { processor } = await setup();

    await expect(processor.process(job)).resolves.toBe(uploadedUrl);
  });

  it("closes the browser once the render succeeds", async () => {
    const { processor, close } = await setup();

    await processor.process(job);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the browser when the render throws", async () => {
    const { processor, close } = await setup();

    vi.mocked(renderPdf).mockRejectedValue(new Error("chrome died"));

    await expect(processor.process(job)).rejects.toThrow("chrome died");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
