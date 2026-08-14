import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";

import { StorageService } from "../storage/storage.service";
import { launch } from "./browser";
import { fetchCombinedHash } from "./content-hash";
import { HashStore } from "./hash.store";
import { renderPdf } from "./pdf";
import {
  cvPdf,
  cvPdfJob,
  startupImages,
  startupImagesJob,
  type TRenderJob,
} from "./render.constants";
import { RenderProcessor, unchangedMessage } from "./render.processor";
import { captureStartupImages, contentType } from "./startup-images";

vi.mock("./browser", () => ({ launch: vi.fn<() => Promise<unknown>>() }));
vi.mock("./pdf", () => ({ renderPdf: vi.fn<() => Promise<Uint8Array>>() }));
vi.mock("./content-hash", () => ({
  fetchCombinedHash: vi.fn<() => Promise<string>>(),
}));
vi.mock("./startup-images", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  captureStartupImages: vi.fn<() => Promise<unknown[]>>(),
}));

const siteUrl = "https://www.engaging.engineering";
const uploadedUrl = "https://artifacts.example.com/billy-watson-cv.pdf";
const freshHash = "fresh";

const jobFor = (force = false, name: string = cvPdfJob) =>
  ({ id: "job-1", name, data: { force } }) as Job<TRenderJob>;

const captured = [
  { key: "startup-home-1320x2868.png", image: Buffer.from("a") },
  { key: "startup-cv-1320x2868.png", image: Buffer.from("b") },
];

const setup = async (
  options: { stored?: string | null; hash?: string } = {},
) => {
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const upload = vi.fn<() => Promise<string>>().mockResolvedValue(uploadedUrl);
  const get = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(options.stored ?? null);
  const set = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const pdf = Buffer.from("pdf");

  vi.mocked(launch).mockResolvedValue({ close } as never);
  vi.mocked(renderPdf).mockResolvedValue(pdf);
  vi.mocked(fetchCombinedHash).mockResolvedValue(options.hash ?? freshHash);
  vi.mocked(captureStartupImages).mockResolvedValue(captured);

  const module = await Test.createTestingModule({
    providers: [
      RenderProcessor,
      { provide: StorageService, useValue: { upload } },
      { provide: HashStore, useValue: { get, set } },
      { provide: ConfigService, useValue: { get: () => siteUrl } },
    ],
  }).compile();

  return { processor: module.get(RenderProcessor), close, upload, set, pdf };
};

describe("RenderProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the CV page of the configured site", async () => {
    const { processor } = await setup();

    await processor.process(jobFor());

    expect(renderPdf).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      `${siteUrl}${cvPdf.path}`,
    );
  });

  it("uploads the rendered document under its stable key", async () => {
    const { processor, upload, pdf } = await setup();

    await processor.process(jobFor());

    expect(upload).toHaveBeenNthCalledWith(
      1,
      cvPdf.key,
      pdf,
      cvPdf.contentType,
    );
  });

  it("returns the public url of the uploaded document", async () => {
    const { processor } = await setup();

    await expect(processor.process(jobFor())).resolves.toBe(uploadedUrl);
  });

  it("records the hash only after a successful upload", async () => {
    const { processor, set } = await setup();

    await processor.process(jobFor());

    expect(set).toHaveBeenNthCalledWith(1, cvPdf.key, freshHash);
  });

  it("renders when nothing has been rendered before", async () => {
    const { processor, upload } = await setup({ stored: null });

    await processor.process(jobFor());

    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("refuses to render while the page still serves the previous content", async () => {
    const { processor } = await setup({ stored: freshHash });

    await expect(processor.process(jobFor())).rejects.toThrow(unchangedMessage);
  });

  it("does not launch a browser when the content has not changed", async () => {
    const { processor } = await setup({ stored: freshHash });

    await expect(processor.process(jobFor())).rejects.toThrow(unchangedMessage);
    expect(launch).not.toHaveBeenCalled();
  });

  it("renders unchanged content when the job is forced", async () => {
    const { processor, upload } = await setup({ stored: freshHash });

    await processor.process(jobFor(true));

    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("closes the browser once the render succeeds", async () => {
    const { processor, close } = await setup();

    await processor.process(jobFor());

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the browser when the render throws", async () => {
    const { processor, close } = await setup();

    vi.mocked(renderPdf).mockRejectedValue(new Error("chrome died"));

    await expect(processor.process(jobFor())).rejects.toThrow("chrome died");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the previous hash in place when the upload fails", async () => {
    const { processor, upload, set } = await setup();

    upload.mockRejectedValue(new Error("no bucket"));

    await expect(processor.process(jobFor())).rejects.toThrow("no bucket");
    expect(set).not.toHaveBeenCalled();
  });

  it("captures startup images when that is the job", async () => {
    const { processor } = await setup();

    await processor.process(jobFor(false, startupImagesJob));

    expect(captureStartupImages).toHaveBeenCalledTimes(1);
  });

  it("uploads every captured startup image", async () => {
    const { processor, upload } = await setup();

    await processor.process(jobFor(false, startupImagesJob));

    expect(upload).toHaveBeenNthCalledWith(
      1,
      captured[0].key,
      captured[0].image,
      contentType,
    );
    expect(upload).toHaveBeenCalledTimes(captured.length);
  });

  it("reports how many startup images were produced", async () => {
    const { processor } = await setup();

    await expect(
      processor.process(jobFor(false, startupImagesJob)),
    ).resolves.toBe(`${captured.length} startup images`);
  });

  it("records the startup images under their own hash key", async () => {
    const { processor, set } = await setup();

    await processor.process(jobFor(false, startupImagesJob));

    expect(set).toHaveBeenNthCalledWith(1, startupImages.key, freshHash);
  });

  it("does not capture startup images while the pages are unchanged", async () => {
    const { processor } = await setup({ stored: freshHash });

    await expect(
      processor.process(jobFor(false, startupImagesJob)),
    ).rejects.toThrow(unchangedMessage);

    expect(captureStartupImages).not.toHaveBeenCalled();
  });
});
