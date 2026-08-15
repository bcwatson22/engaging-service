import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { endpointFor, region, StorageService } from "./storage.service";

const headers = {
  contentType: "application/pdf",
  cacheControl: "public, max-age=600",
};

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn<(config: unknown) => unknown>(),
  PutObjectCommand: vi.fn<(input: unknown) => unknown>(),
}));

const env = {
  R2_BUCKET: "engaging-artifacts",
  R2_PUBLIC_BASE: "https://artifacts.example.com",
  R2_ACCOUNT_ID: "account-id",
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret",
} as const;

const setup = async () => {
  const send = vi.fn<() => Promise<unknown>>().mockResolvedValue({});

  /* A function, not an arrow — the service calls `new S3Client(...)`, and
     arrows are not constructible. */
  (S3Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function () {
      return { send };
    },
  );

  const module = await Test.createTestingModule({
    providers: [
      StorageService,
      {
        provide: ConfigService,
        useValue: { get: (key: keyof typeof env) => env[key] },
      },
    ],
  }).compile();

  return { service: module.get(StorageService), send };
};

describe("endpointFor", () => {
  it("builds the account's R2 endpoint", () => {
    expect(endpointFor("abc")).toBe("https://abc.r2.cloudflarestorage.com");
  });
});

describe("StorageService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("points the client at the account's R2 endpoint", async () => {
    await setup();

    expect(S3Client).toHaveBeenNthCalledWith(1, {
      region,
      endpoint: endpointFor(env.R2_ACCOUNT_ID),
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  });

  it("puts the object in the configured bucket", async () => {
    const { service } = await setup();
    const body = Buffer.from("pdf");

    await service.upload("billy-watson-cv.pdf", body, headers);

    expect(PutObjectCommand).toHaveBeenNthCalledWith(1, {
      Bucket: env.R2_BUCKET,
      Key: "billy-watson-cv.pdf",
      Body: body,
      ContentType: headers.contentType,
      CacheControl: headers.cacheControl,
    });
  });

  it("returns the public url of the uploaded object", async () => {
    const { service } = await setup();

    await expect(
      service.upload("billy-watson-cv.pdf", Buffer.from("pdf"), headers),
    ).resolves.toBe(`${env.R2_PUBLIC_BASE}/billy-watson-cv.pdf`);
  });

  it("propagates an upload failure rather than swallowing it", async () => {
    const { service, send } = await setup();

    send.mockRejectedValue(new Error("no bucket"));

    await expect(
      service.upload("a.pdf", Buffer.from("pdf"), headers),
    ).rejects.toThrow("no bucket");
  });
});
