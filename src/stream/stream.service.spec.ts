import { Test } from '@nestjs/testing';

import { redisClient } from '../redis/redis.module';
import { HashStore } from '../render/hash.store';
import { cvPdfJob } from '../render/render.constants';
import {
  payloadField,
  renderStream,
  streamVersion,
  type TStreamJob,
} from './stream.constants';
import { StreamService } from './stream.service';
import { WorkerClient } from './worker.client';

const setup = async (
  options: {
    claimed?: boolean;
    previous?: string | null;
    xaddRejects?: Error;
    pending?: unknown;
    pendingRejects?: Error;
  } = {},
) => {
  const set = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(options.claimed === false ? null : 'OK');

  const xadd = vi
    .fn<(...args: unknown[]) => Promise<string>>()
    .mockImplementation(async () => {
      if (options.xaddRejects) throw options.xaddRejects;

      return '1787-0';
    });

  const xlen = vi.fn<() => Promise<number>>().mockResolvedValue(3);

  const xpending = vi
    .fn<() => Promise<unknown>>()
    .mockImplementation(async () => {
      if (options.pendingRejects) throw options.pendingRejects;

      return 'pending' in options ? options.pending : [2, '1-0', '2-0', []];
    });

  const wake = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const get = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(
      'previous' in options ? options.previous! : 'previoushash',
    );

  const module = await Test.createTestingModule({
    providers: [
      StreamService,
      { provide: redisClient, useValue: { set, xadd, xlen, xpending } },
      { provide: HashStore, useValue: { get } },
      { provide: WorkerClient, useValue: { wake } },
    ],
  }).compile();

  return {
    service: module.get(StreamService),
    set,
    xadd,
    xlen,
    xpending,
    wake,
    get,
  };
};

const payloadOf = (xadd: ReturnType<typeof vi.fn>): TStreamJob =>
  JSON.parse(xadd.mock.calls[0].at(-1) as string) as TStreamJob;

describe('enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a versioned payload the worker can read', async () => {
    const { service, xadd } = await setup();

    await expect(service.enqueue(cvPdfJob)).resolves.toBe('1787-0');

    const [stream, maxlen, approx, , , field] = xadd.mock.calls[0];
    expect(stream).toBe(renderStream);
    expect(maxlen).toBe('MAXLEN');
    expect(approx).toBe('~');
    expect(field).toBe(payloadField);

    expect(payloadOf(xadd)).toMatchObject({
      v: streamVersion,
      job: cvPdfJob,
      force: false,
    });
  });

  /* Not the live hash: reading the page here would put a network fetch on the
     webhook path for a value the worker recomputes anyway. */
  it('records the hash the job is meant to supersede', async () => {
    const { service, xadd } = await setup({ previous: 'abc123' });

    await service.enqueue(cvPdfJob);

    expect(payloadOf(xadd).contentHash).toBe('abc123');
  });

  it('copes with nothing having been rendered yet', async () => {
    const { service, xadd } = await setup({ previous: null });

    await service.enqueue(cvPdfJob);

    expect(payloadOf(xadd).contentHash).toBe('');
  });

  it('passes force through', async () => {
    const { service, xadd } = await setup();

    await service.enqueue(cvPdfJob, true);

    expect(payloadOf(xadd).force).toBe(true);
  });

  /* An XADD cannot start a stopped machine: Fly only autostarts on traffic
     through its proxy. */
  it('wakes the worker after the job is durable', async () => {
    const { service, wake, xadd } = await setup();

    await service.enqueue(cvPdfJob);

    expect(xadd).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  /* A stream id cannot carry the idempotency — Redis ids must be <ms>-<seq>
     and a hash is rejected outright — so the collapse lives in a key beside
     the stream. */
  it('collapses a duplicate rather than queueing it twice', async () => {
    const { service, xadd, wake } = await setup({ claimed: false });

    await expect(service.enqueue(cvPdfJob)).resolves.toBeNull();
    expect(xadd).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });

  /* This path does not yet do the work, so it must never be the reason the
     path that does fails. */
  it('reports a failure as null rather than throwing', async () => {
    const { service } = await setup({ xaddRejects: new Error('READONLY') });

    await expect(service.enqueue(cvPdfJob)).resolves.toBeNull();
  });
});

describe('depth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports what is waiting and what is held', async () => {
    const { service } = await setup();

    await expect(service.depth()).resolves.toEqual({ waiting: 3, pending: 2 });
  });

  /* No group yet means the worker has never started, which is not an error. */
  it('treats a missing consumer group as nothing pending', async () => {
    const { service } = await setup({
      pendingRejects: new Error('NOGROUP No such consumer group'),
    });

    await expect(service.depth()).resolves.toEqual({ waiting: 3, pending: 0 });
  });

  it('copes with an empty pending summary', async () => {
    const { service } = await setup({ pending: null });

    await expect(service.depth()).resolves.toEqual({ waiting: 3, pending: 0 });
  });
});
