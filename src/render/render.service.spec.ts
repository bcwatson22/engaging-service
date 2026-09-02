import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { StreamService } from '../stream/stream.service';
import {
  artifacts,
  cvPdfJob,
  jobOptions,
  renderQueue,
  startupImagesJob,
} from './render.constants';
import { missingIdMessage, RenderService, skipped } from './render.service';

/* Owned mirrors production: the Go worker has the CV PDF, this service still
   has the startup images. Tests of the BullMQ path therefore use the artifact
   this service actually still renders. */
const setup = async (
  options: { withoutId?: boolean; owned?: string[] } = {},
) => {
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
      {
        provide: ConfigService,
        useValue: { get: () => options.owned ?? [cvPdfJob] },
      },
    ],
  }).compile();

  return { service: module.get(RenderService), add, streamed };
};

describe('enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the queued job's id", async () => {
    const { service } = await setup();

    await expect(service.enqueue(startupImagesJob)).resolves.toBe('job-1');
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

    await service.enqueue(startupImagesJob, true);

    expect(add).toHaveBeenNthCalledWith(
      1,
      startupImagesJob,
      { force: true },
      jobOptions,
    );
  });

  it('throws when the queue accepts the job without an id', async () => {
    const { service } = await setup({ withoutId: true });

    await expect(service.enqueue(startupImagesJob)).rejects.toThrow(
      missingIdMessage,
    );
  });
});

describe('an artifact the worker owns', () => {
  beforeEach(() => vi.clearAllMocks());

  /* Cut over: running both would have the two services race to overwrite the
     same object, and hide a broken worker behind a working fallback. */
  it('goes to the stream and not to BullMQ', async () => {
    const { service, add, streamed } = await setup();

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('1-0');

    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, false);
    expect(add).not.toHaveBeenCalled();
  });

  it('passes force through to the stream', async () => {
    const { service, streamed } = await setup();

    await service.enqueue(cvPdfJob, true);

    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, true);
  });

  /* A duplicate collapsed by the stream is a correct outcome, so the webhook
     should not fail because of it. */
  it('reports a skipped job rather than failing', async () => {
    const { service, streamed } = await setup();
    streamed.mockResolvedValue(null);

    await expect(service.enqueue(cvPdfJob)).resolves.toBe(skipped);
  });

  /* The revert path: taking an artifact out of WORKER_ARTIFACTS hands it back
     to this service, whose render code is still here. */
  it('comes back to BullMQ when it is no longer owned', async () => {
    const { service, add, streamed } = await setup({ owned: [] });

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('job-1');

    expect(add).toHaveBeenCalledTimes(1);
    expect(streamed).not.toHaveBeenCalled();
  });
});

describe('enqueueAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues every artifact, wherever it belongs', async () => {
    const { service, add, streamed } = await setup();

    await service.enqueueAll();

    expect(add).toHaveBeenCalledTimes(1);
    expect(streamed).toHaveBeenCalledTimes(1);
  });

  it('returns an id per artifact', async () => {
    const { service } = await setup();

    await expect(service.enqueueAll()).resolves.toHaveLength(artifacts.length);
  });

  it('does not force, so each job waits for its content to change', async () => {
    const { service, streamed } = await setup();

    await service.enqueueAll();

    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, false);
  });
});
