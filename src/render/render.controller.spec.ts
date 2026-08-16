import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { cvPdfJob, startupImagesJob } from './render.constants';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { SecretGuard } from './secret.guard';

const setup = async () => {
  const enqueue = vi.fn<() => Promise<string>>().mockResolvedValue('job-7');

  const module = await Test.createTestingModule({
    controllers: [RenderController],
    providers: [{ provide: RenderService, useValue: { enqueue } }],
  })
    .overrideGuard(SecretGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: module.get(RenderController), enqueue };
};

describe('RenderController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the id of the queued job', async () => {
    const { controller } = await setup();

    await expect(controller.trigger(cvPdfJob)).resolves.toEqual({
      jobId: 'job-7',
    });
  });

  it('forces the render, since a manual trigger may follow a change the CMS does not know about', async () => {
    const { controller, enqueue } = await setup();

    await controller.trigger(startupImagesJob);

    expect(enqueue).toHaveBeenNthCalledWith(1, startupImagesJob, true);
  });

  it('rejects an artifact it does not produce', async () => {
    const { controller } = await setup();

    await expect(controller.trigger('favicon')).rejects.toThrow(
      NotFoundException,
    );
  });
});
