import { generateWebhookSignature } from '@hygraph/utils';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SignatureGuard, signatureHeader } from './signature.guard';

const secret = 'hygraph-secret';
const payload = JSON.stringify({ operation: 'publish', data: { id: '1' } });

/* Signatures are produced by Hygraph's own generator rather than reimplemented
   here, so these assert conformance with the real format rather than merely
   agreeing with themselves. */
const sign = (body: string, withSecret = secret): string =>
  generateWebhookSignature({ rawPayload: body, secret: withSecret });

const contextFor = (
  headers: Record<string, string>,
  rawBody?: Buffer,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, rawBody }) }),
  }) as ExecutionContext;

const setup = async () => {
  const module = await Test.createTestingModule({
    providers: [
      SignatureGuard,
      { provide: ConfigService, useValue: { get: () => secret } },
    ],
  }).compile();

  return { guard: module.get(SignatureGuard) };
};

describe('SignatureGuard', () => {
  it('allows a payload signed with the shared secret', async () => {
    const { guard } = await setup();

    const context = contextFor(
      { [signatureHeader]: sign(payload) },
      Buffer.from(payload),
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a payload signed with a different secret', async () => {
    const { guard } = await setup();

    const context = contextFor(
      { [signatureHeader]: sign(payload, 'wrong-secret') },
      Buffer.from(payload),
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a body that was altered after signing', async () => {
    const { guard } = await setup();

    const context = contextFor(
      { [signatureHeader]: sign(payload) },
      Buffer.from(`${payload} tampered`),
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with no signature header', async () => {
    const { guard } = await setup();

    expect(() =>
      guard.canActivate(contextFor({}, Buffer.from(payload))),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a request with no raw body to verify against', async () => {
    const { guard } = await setup();

    const context = contextFor({ [signatureHeader]: sign(payload) });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a malformed signature header rather than erroring', async () => {
    const { guard } = await setup();

    const context = contextFor(
      { [signatureHeader]: 'nonsense' },
      Buffer.from(payload),
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
