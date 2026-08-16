import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

import {
  artifacts,
  cvPdfJob,
  jobOptions,
  renderQueue,
  startupImagesJob,
} from './render.constants';
import { missingIdMessage, RenderService } from './render.service';

const setup = async (options: { withoutId?: boolean } = {}) => {
  let queued = 0;

  const add = vi
    .fn<() => Promise<{ id?: string }>>()
    .mockImplementation(async () =>
      options.withoutId ? {} : { id: `job-${++queued}` },
    );

  const module = await Test.createTestingModule({
    providers: [
      RenderService,
      { provide: getQueueToken(renderQueue), useValue: { add } },
    ],
  }).compile();

  return { service: module.get(RenderService), add };
};

describe('enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the queued job's id", async () => {
    const { service } = await setup();

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('job-1');
  });

  it("queues under the artifact's own job name", async () => {
    const { service, add } = await setup();

    await service.enqueue(startupImagesJob);

    expect(add).toHaveBeenNthCalledWith(
      1,
      startupImagesJob,
      { force: false },
      jobOptions,
    );
  });

  it('marks the job as forced when asked', async () => {
    const { service, add } = await setup();

    await service.enqueue(cvPdfJob, true);

    expect(add).toHaveBeenNthCalledWith(
      1,
      cvPdfJob,
      { force: true },
      jobOptions,
    );
  });

  it('throws when the queue accepts the job without an id', async () => {
    const { service } = await setup({ withoutId: true });

    await expect(service.enqueue(cvPdfJob)).rejects.toThrow(missingIdMessage);
  });
});

describe('enqueueAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues every artifact', async () => {
    const { service, add } = await setup();

    await service.enqueueAll();

    expect(add).toHaveBeenCalledTimes(artifacts.length);
  });

  it('returns an id per artifact', async () => {
    const { service } = await setup();

    await expect(service.enqueueAll()).resolves.toHaveLength(artifacts.length);
  });

  it('does not force, so each job waits for its content to change', async () => {
    const { service, add } = await setup();

    await service.enqueueAll();

    expect(add).toHaveBeenNthCalledWith(
      1,
      cvPdfJob,
      { force: false },
      jobOptions,
    );
  });
});
