import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { TEnv } from "../config/env.schema";

/* R2 is S3-compatible but not regional, and rejects a real region name. */
const region = "auto";

const endpointFor = (accountId: string): string =>
  `https://${accountId}.r2.cloudflarestorage.com`;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly client: S3Client;

  private readonly bucket: string;

  private readonly publicBase: string;

  constructor(config: ConfigService<TEnv, true>) {
    this.bucket = config.get("R2_BUCKET", { infer: true });
    this.publicBase = config.get("R2_PUBLIC_BASE", { infer: true });

    this.client = new S3Client({
      region,
      endpoint: endpointFor(config.get("R2_ACCOUNT_ID", { infer: true })),
      credentials: {
        accessKeyId: config.get("R2_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("R2_SECRET_ACCESS_KEY", { infer: true }),
      },
    });
  }

  /* Returns the public URL rather than a storage key, because every caller
     wants the thing the site will link to. */
  async upload(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    this.logger.log(`Uploaded ${key} (${body.byteLength} bytes)`);

    return `${this.publicBase}/${key}`;
  }
}

export { region, endpointFor };
