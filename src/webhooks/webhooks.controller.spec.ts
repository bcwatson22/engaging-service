import { Test } from '@nestjs/testing';

import { RenderService } from '../render/render.service';
import { SignatureGuard } from './signature.guard';
import { WebhooksController } from './webhooks.controller';

const setup = async () => {
  const enqueueAll = vi
    .fn<() => Promise<string[]>>()
    .mockResolvedValue(['job-9', 'job-10']);

  const module = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [{ provide: RenderService, useValue: { enqueueAll } }],
  })
    .overrideGuard(SignatureGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: module.get(WebhooksController), enqueueAll };
};

describe('WebhooksController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an id for every queued artifact', async () => {
    const { controller } = await setup();

    await expect(controller.hygraph()).resolves.toEqual({
      jobIds: ['job-9', 'job-10'],
    });
  });

  it('does not force, so each job waits for its content to change', async () => {
    const { controller, enqueueAll } = await setup();

    await controller.hygraph();

    expect(enqueueAll).toHaveBeenNthCalledWith(1);
  });
});
