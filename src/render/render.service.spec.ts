import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

import { StreamService } from '../stream/stream.service';
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

  const streamed = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue('1-0');

  const module = await Test.createTestingModule({
    providers: [
      RenderService,
      { provide: getQueueToken(renderQueue), useValue: { add } },
      { provide: StreamService, useValue: { enqueue: streamed } },
    ],
  }).compile();

  return { service: module.get(RenderService), add, streamed };
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

describe('the stream path', () => {
  beforeEach(() => vi.clearAllMocks());

  /* Both paths run until the Go worker's output has been compared against this
     one over real publishes. */
  it('queues on the stream as well as on BullMQ', async () => {
    const { service, add, streamed } = await setup();

    await service.enqueue(cvPdfJob);

    expect(add).toHaveBeenCalledTimes(1);
    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, false);
  });

  it('passes force through to the stream', async () => {
    const { service, streamed } = await setup();

    await service.enqueue(cvPdfJob, true);

    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, true);
  });

  /* The stream is the path that does not yet do the work, so it must never be
     the reason the working one fails. */
  it('still returns the BullMQ id when the stream is unavailable', async () => {
    const { service, streamed } = await setup();
    streamed.mockResolvedValue(null);

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('job-1');
  });
});
