import { type HealthCheckResult, HealthCheckService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";

import { HealthController } from "./health.controller";

const okResult = {
  status: "ok",
  info: {},
  error: {},
  details: {},
} as HealthCheckResult;

const setup = async (options: { result?: HealthCheckResult } = {}) => {
  const check = vi
    .fn<HealthCheckService["check"]>()
    .mockResolvedValue(options.result ?? okResult);

  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthCheckService, useValue: { check } }],
  }).compile();

  return { controller: module.get(HealthController), check };
};

describe("HealthController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the health check result", async () => {
    const { controller } = await setup();

    await expect(controller.check()).resolves.toBe(okResult);
  });

  it("runs the check with no indicators registered yet", async () => {
    const { controller, check } = await setup();

    await controller.check();

    expect(check).toHaveBeenNthCalledWith(1, []);
  });
});
