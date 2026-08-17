import { Test } from '@nestjs/testing';

import { cvPdfJob, startupImagesJob } from '../render/render.constants';
import { StatusController } from './status.controller';
import { StatusService, type TStatus } from './status.service';

const status: TStatus = {
  artifacts: {
    [cvPdfJob]: [
      {
        at: '2026-08-17T12:00:00.000Z',
        result: 'https://artifacts.example.com/billy-watson-cv.pdf',
        durationMs: 14_000,
        attempts: 3,
        elapsedMs: 49_000,
      },
    ],
    [startupImagesJob]: [],
  },
  integrity: { [cvPdfJob]: null, [startupImagesJob]: null },
  queue: { waiting: 0, active: 0, delayed: 0, failed: 0 },
};

const setup = async () => {
  const read = vi.fn<() => Promise<TStatus>>().mockResolvedValue(status);

  const module = await Test.createTestingModule({
    controllers: [StatusController],
    providers: [{ provide: StatusService, useValue: { read } }],
  }).compile();

  return { controller: module.get(StatusController), read };
};

describe('StatusController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports what the service read', async () => {
    const { controller } = await setup();

    await expect(controller.read()).resolves.toEqual(status);
  });

  it('reads once per request', async () => {
    const { controller, read } = await setup();

    await controller.read();

    expect(read).toHaveBeenCalledTimes(1);
  });
});
