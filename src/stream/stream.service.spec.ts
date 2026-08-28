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

/* XINFO over RESP2 is a flat key/value array, which is what ioredis hands back
   untouched. */
const group = (over: Record<string, unknown> = {}): unknown[] =>
  Object.entries({
    name: 'workers',
    consumers: 1,
    pending: 2,
    'last-delivered-id': '5-0',
    'entries-read': 5,
    lag: 4,
    ...over,
  }).flat();

const setup = async (
  options: {
    claimed?: boolean;
    previous?: string | null;
    xaddRejects?: Error;
    groups?: unknown[][];
    lastGenerated?: string;
    infoRejects?: Error;
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

  const call = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockImplementation(async (_cmd: unknown, sub: unknown) => {
      if (options.infoRejects) throw options.infoRejects;
      if (sub === 'GROUPS') return options.groups ?? [group()];

      return ['last-generated-id', options.lastGenerated ?? '9-0'];
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
      { provide: redisClient, useValue: { set, xadd, xlen, call } },
      { provide: HashStore, useValue: { get } },
      { provide: WorkerClient, useValue: { wake } },
    ],
  }).compile();

  return {
    service: module.get(StreamService),
    set,
    xadd,
    xlen,
    call,
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

  it('reports undelivered and held work from the consumer group', async () => {
    const { service } = await setup();

    await expect(service.depth()).resolves.toEqual({ waiting: 4, pending: 2 });
  });

  /* The bug this replaced: a stream keeps entries after they are acked, so
     XLEN never returns to zero and the backstop woke the worker every fifteen
     minutes forever — roughly 96 boots a day for no work at all. */
  it('reports nothing waiting once the work has been delivered and acked', async () => {
    const { service, xlen } = await setup({
      groups: [group({ lag: 0, pending: 0 })] as unknown[][],
    });
    xlen.mockResolvedValue(1); // the finished entry is still in the stream

    await expect(service.depth()).resolves.toEqual({ waiting: 0, pending: 0 });
  });

  /* No group means the worker has never started, so anything on the stream is
     genuinely undelivered. */
  it('falls back to the stream length when there is no group yet', async () => {
    const { service } = await setup({ groups: [] });

    await expect(service.depth()).resolves.toEqual({ waiting: 3, pending: 0 });
  });

  /* Defensive: XINFO has always reported it, but a missing count must read as
     nothing held rather than NaN, which would make the backstop wake forever. */
  it('treats an absent pending count as nothing held', async () => {
    const { service } = await setup({
      groups: [group({ pending: undefined })] as unknown[][],
    });

    await expect(service.depth()).resolves.toMatchObject({ pending: 0 });
  });

  it('treats a missing stream as nothing to do', async () => {
    const { service } = await setup({
      infoRejects: new Error('ERR no such key'),
    });

    await expect(service.depth()).resolves.toEqual({ waiting: 0, pending: 0 });
  });

  /* Redis reports lag as null once entries have been trimmed from under the
     group, so the ids answer the question instead. */
  describe('when lag cannot be calculated', () => {
    it('sees work the group has not reached', async () => {
      const { service } = await setup({
        groups: [
          group({ lag: null, 'last-delivered-id': '5-0' }),
        ] as unknown[][],
        lastGenerated: '9-0',
      });

      await expect(service.depth()).resolves.toMatchObject({ waiting: 1 });
    });

    it('sees nothing when the group has reached the end', async () => {
      const { service } = await setup({
        groups: [
          group({ lag: null, 'last-delivered-id': '9-0' }),
        ] as unknown[][],
        lastGenerated: '9-0',
      });

      await expect(service.depth()).resolves.toMatchObject({ waiting: 0 });
    });
  });
});
