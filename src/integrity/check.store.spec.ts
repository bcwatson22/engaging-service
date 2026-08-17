import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createConnection } from '../redis/connection';
import { cvPdfJob } from '../render/render.constants';
import { CheckStore, isCheck, prefix, type TCheck } from './check.store';

vi.mock('../redis/connection', () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = 'redis://127.0.0.1:6379';

const check: TCheck = {
  at: '2026-08-17T12:00:00.000Z',
  drifted: true,
  queued: true,
  stale: false,
};

const setup = async ({ stored = null as string | null } = {}) => {
  const get = vi.fn<() => Promise<string | null>>().mockResolvedValue(stored);
  const set = vi
    .fn<(key: string, value: string) => Promise<'OK'>>()
    .mockResolvedValue('OK');
  const quit = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  vi.mocked(createConnection).mockReturnValue({ get, set, quit } as never);

  const module = await Test.createTestingModule({
    providers: [
      CheckStore,
      { provide: ConfigService, useValue: { get: () => url } },
    ],
  }).compile();

  return { store: module.get(CheckStore), get, set, quit };
};

describe('CheckStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects through the shared factory, so it gets the same resilience settings', async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  it('returns nothing before a check has run', async () => {
    const { store } = await setup();

    await expect(store.get(cvPdfJob)).resolves.toBeNull();
  });

  it('returns what the last check found', async () => {
    const { store } = await setup({ stored: JSON.stringify(check) });

    await expect(store.get(cvPdfJob)).resolves.toEqual(check);
  });

  /* Unreadable reads as never checked, which makes the next check behave as a
     first one — it queues a render if the artifact has drifted, which is the
     safe direction to be wrong in. */
  it.each([
    ['unparseable', 'not json'],
    ['the wrong shape', JSON.stringify({ at: 'now' })],
  ])('treats %s stored data as never checked', async (_label, stored) => {
    const { store } = await setup({ stored });

    await expect(store.get(cvPdfJob)).resolves.toBeNull();
  });

  it("namespaces keys so the queue's own keys cannot collide", async () => {
    const { store, set } = await setup();

    await store.set(cvPdfJob, { drifted: false, queued: false, stale: false });

    expect(set.mock.calls[0][0]).toBe(`${prefix}:${cvPdfJob}`);
  });

  it('keeps what the check decided', async () => {
    const { store, set } = await setup();

    await store.set(cvPdfJob, { drifted: true, queued: false, stale: true });

    expect(JSON.parse(set.mock.calls[0][1]) as TCheck).toMatchObject({
      drifted: true,
      queued: false,
      stale: true,
    });
  });

  it('stamps the time itself', async () => {
    const { store, set } = await setup();

    await store.set(cvPdfJob, { drifted: false, queued: false, stale: false });

    const { at } = JSON.parse(set.mock.calls[0][1]) as TCheck;

    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });

  it('closes the connection on shutdown', async () => {
    const { store, quit } = await setup();

    await store.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});

describe('isCheck', () => {
  it('accepts a full check', () => {
    expect(isCheck(check)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no time', { ...check, at: undefined }],
    ['a flag that is not a boolean', { ...check, drifted: 'yes' }],
    ['a missing flag', { ...check, stale: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(isCheck(value)).toBe(false);
  });
});
