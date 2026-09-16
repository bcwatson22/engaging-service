import { Test } from '@nestjs/testing';

import { cvPdfJob, startupImagesJob } from '../render/render.constants';
import { SecretGuard } from '../render/secret.guard';
import type { Outcome } from './check.store';
import { IntegrityController } from './integrity.controller';
import { IntegrityService } from './integrity.service';

const current: Outcome = {
  drifted: false,
  queued: false,
  stale: false,
  live: 'same',
};
const drifted: Outcome = {
  drifted: true,
  queued: true,
  stale: false,
  live: 'new',
};

const setup = async () => {
  const checkAll = vi
    .fn<() => Promise<Record<string, Outcome>>>()
    .mockResolvedValue({ [cvPdfJob]: drifted, [startupImagesJob]: current });

  const module = await Test.createTestingModule({
    controllers: [IntegrityController],
    providers: [{ provide: IntegrityService, useValue: { checkAll } }],
  })
    .overrideGuard(SecretGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: module.get(IntegrityController), checkAll };
};

describe('IntegrityController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks every artifact', async () => {
    const { controller, checkAll } = await setup();

    await controller.check();

    expect(checkAll).toHaveBeenCalledTimes(1);
  });

  /* So the deploy pipeline's log says whether anything was queued. */
  it('answers with what each check found', async () => {
    const { controller } = await setup();

    await expect(controller.check()).resolves.toEqual({
      checks: { [cvPdfJob]: drifted, [startupImagesJob]: current },
    });
  });
});
