import { verifyWebhookSignature } from "@hygraph/utils";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { TEnv } from "../config/env.schema";

const signatureHeader = "gcms-signature";

/* rawBody is populated because the app is created with `rawBody: true`.
   Verification must use the bytes Hygraph signed — a parsed and re-serialised
   body will not reproduce the same HMAC. */
type TSignedRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
};

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService<TEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const { headers, rawBody } = context
      .switchToHttp()
      .getRequest<TSignedRequest>();

    const signature = headers[signatureHeader];

    if (typeof signature !== "string" || !rawBody) {
      throw new UnauthorizedException();
    }

    if (!this.isValid(signature, rawBody)) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private isValid(signature: string, rawBody: Buffer): boolean {
    try {
      return verifyWebhookSignature({
        signature,
        secret: this.config.get("HYGRAPH_WEBHOOK_SECRET", { infer: true }),
        rawPayload: rawBody.toString("utf8"),
      });
      /* A malformed header makes the verifier throw while splitting it, which
         is a rejection rather than a server error. */
    } catch {
      return false;
    }
  }
}

export { signatureHeader };
