import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createConnection } from '../redis/connection';
import {
  isRecord,
  limit,
  prefix,
  RecordStore,
  type TOutcome,
  type TRecord,
} from './record.store';
import { cvPdfJob } from './render.constants';

vi.mock('../redis/connection', () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = 'redis://127.0.0.1:6379';
const publicUrl = 'https://artifacts.example.com/billy-watson-cv.pdf';

const outcome: TOutcome = {
  result: publicUrl,
  durationMs: 14_000,
  attempts: 3,
  elapsedMs: 49_000,
};

const record: TRecord = { at: '2026-08-17T12:00:00.000Z', ...outcome };

const setup = async ({ stored = [] as string[] } = {}) => {
  const lrange = vi.fn<() => Promise<string[]>>().mockResolvedValue(stored);
  const lpush = vi.fn<(key: string, value: string) => unknown>();
  const ltrim = vi.fn<(key: string, start: number, stop: number) => unknown>();
  const exec = vi.fn<() => Promise<unknown>>().mockResolvedValue([]);
  const quit = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  /* Chained, the way ioredis returns the pipeline from each call. */
  const chain = { lpush, ltrim, exec };
  lpush.mockReturnValue(chain);
  ltrim.mockReturnValue(chain);

  const multi = vi.fn<() => typeof chain>().mockReturnValue(chain);

  vi.mocked(createConnection).mockReturnValue({
    lrange,
    multi,
    quit,
  } as never);

  const module = await Test.createTestingModule({
    providers: [
      RecordStore,
      { provide: ConfigService, useValue: { get: () => url } },
    ],
  }).compile();

  return { store: module.get(RecordStore), lrange, lpush, ltrim, multi, quit };
};

describe('RecordStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects through the shared factory, so it gets the same resilience settings', async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  describe('history', () => {
    it('is empty for an artifact never rendered', async () => {
      const { store } = await setup();

      await expect(store.history(cvPdfJob)).resolves.toEqual([]);
    });

    it('returns what was recorded', async () => {
      const { store } = await setup({ stored: [JSON.stringify(record)] });

      await expect(store.history(cvPdfJob)).resolves.toEqual([record]);
    });

    it('reads no more than it keeps', async () => {
      const { store, lrange } = await setup();

      await store.history(cvPdfJob);

      expect(lrange).toHaveBeenNthCalledWith(
        1,
        `${prefix}:${cvPdfJob}`,
        0,
        limit - 1,
      );
    });

    /* One bad entry should not take the rest of the history with it. */
    it('drops an unreadable entry and keeps the others', async () => {
      const { store } = await setup({
        stored: ['not json', JSON.stringify(record)],
      });

      await expect(store.history(cvPdfJob)).resolves.toEqual([record]);
    });

    it('drops an entry of the wrong shape', async () => {
      const { store } = await setup({
        stored: [JSON.stringify({ at: 'now' }), JSON.stringify(record)],
      });

      await expect(store.history(cvPdfJob)).resolves.toEqual([record]);
    });
  });

  describe('add', () => {
    it('pushes onto the front, so the newest render reads first', async () => {
      const { store, lpush } = await setup();

      await store.add(cvPdfJob, outcome);

      expect(lpush).toHaveBeenNthCalledWith(
        1,
        `${prefix}:${cvPdfJob}`,
        expect.stringContaining(publicUrl),
      );
    });

    it('trims to the limit, so a render loop cannot grow the list', async () => {
      const { store, ltrim } = await setup();

      await store.add(cvPdfJob, outcome);

      expect(ltrim).toHaveBeenNthCalledWith(
        1,
        `${prefix}:${cvPdfJob}`,
        0,
        limit - 1,
      );
    });

    it('writes both in one round trip', async () => {
      const { store, multi } = await setup();

      await store.add(cvPdfJob, outcome);

      expect(multi).toHaveBeenCalledTimes(1);
    });

    it('keeps what the render cost', async () => {
      const { store, lpush } = await setup();

      await store.add(cvPdfJob, outcome);

      const [, written] = lpush.mock.calls[0];

      expect(JSON.parse(written) as TRecord).toMatchObject(outcome);
    });

    /* Stamped here, so a caller cannot record a render as having happened at
       a time of its choosing. */
    it('stamps the time itself', async () => {
      const { store, lpush } = await setup();

      await store.add(cvPdfJob, outcome);

      const [, written] = lpush.mock.calls[0];
      const { at } = JSON.parse(written) as TRecord;

      expect(Number.isNaN(Date.parse(at))).toBe(false);
    });
  });

  it('closes the connection on shutdown', async () => {
    const { store, quit } = await setup();

    await store.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});

describe('isRecord', () => {
  it('accepts a full record', () => {
    expect(isRecord(record)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no time', { ...record, at: undefined }],
    ['no result', { ...record, result: undefined }],
    ['a duration that is not a number', { ...record, durationMs: 'ages' }],
    ['no attempts', { ...record, attempts: undefined }],
    ['no elapsed time', { ...record, elapsedMs: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(isRecord(value)).toBe(false);
  });
});
