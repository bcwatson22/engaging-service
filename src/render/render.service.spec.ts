import { Test } from '@nestjs/testing';

import { StreamService } from '../stream/stream.service';
import { artifacts, cvPdfJob, startupImagesJob } from './render.constants';
import { RenderService, skipped } from './render.service';

const setup = async (options: { collapsed?: boolean } = {}) => {
  let queued = 0;

  const streamed = vi
    .fn<() => Promise<string | null>>()
    .mockImplementation(async () =>
      options.collapsed ? null : `178-${++queued}`,
    );

  const module = await Test.createTestingModule({
    providers: [
      RenderService,
      { provide: StreamService, useValue: { enqueue: streamed } },
    ],
  }).compile();

  return { service: module.get(RenderService), streamed };
};

describe('enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stream's message id", async () => {
    const { service } = await setup();

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('178-1');
  });

  it('asks for the artifact by the name the worker maps', async () => {
    const { service, streamed } = await setup();

    await service.enqueue(startupImagesJob);

    expect(streamed).toHaveBeenNthCalledWith(1, startupImagesJob, false);
  });

  /* A manual re-render exists for changes the CMS knows nothing about — a
     print stylesheet, a font — which the content check would otherwise
     reject. */
  it('marks the job as forced when asked', async () => {
    const { service, streamed } = await setup();

    await service.enqueue(cvPdfJob, true);

    expect(streamed).toHaveBeenNthCalledWith(1, cvPdfJob, true);
  });

  /* A duplicate collapsed by the stream is a correct outcome, so the webhook
     should not fail because of it. */
  it('reports a collapsed duplicate rather than failing', async () => {
    const { service } = await setup({ collapsed: true });

    await expect(service.enqueue(cvPdfJob)).resolves.toBe(skipped);
  });
});

describe('enqueueAll', () => {
  beforeEach(() => vi.clearAllMocks());

  /* A publish changes the content every artifact is derived from, so all of
     them are re-made rather than only the CV PDF. */
  it('asks for every artifact', async () => {
    const { service, streamed } = await setup();

    await service.enqueueAll();

    expect(streamed).toHaveBeenCalledTimes(artifacts.length);
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
