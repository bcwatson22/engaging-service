import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { SecretGuard, secretHeader } from "./secret.guard";

const secret = "correct-horse-battery-staple";

const contextFor = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as ExecutionContext;

const setup = async () => {
  const module = await Test.createTestingModule({
    providers: [
      SecretGuard,
      { provide: ConfigService, useValue: { get: () => secret } },
    ],
  }).compile();

  return { guard: module.get(SecretGuard) };
};

describe("SecretGuard", () => {
  it("allows a request carrying the shared secret", async () => {
    const { guard } = await setup();

    expect(guard.canActivate(contextFor({ [secretHeader]: secret }))).toBe(
      true,
    );
  });

  it("rejects a request with the wrong secret", async () => {
    const { guard } = await setup();

    expect(() =>
      guard.canActivate(contextFor({ [secretHeader]: "guess" })),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a request with no secret at all", async () => {
    const { guard } = await setup();

    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });
});
