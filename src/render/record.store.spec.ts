import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createConnection } from '../redis/connection';
import { isRecord, prefix, RecordStore } from './record.store';
import { cvPdfJob } from './render.constants';

vi.mock('../redis/connection', () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = 'redis://127.0.0.1:6379';
const publicUrl = 'https://artifacts.example.com/billy-watson-cv.pdf';

const setup = async (options: { stored?: string | null } = {}) => {
  const get = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(options.stored ?? null);
  const set = vi
    .fn<(key: string, value: string) => Promise<'OK'>>()
    .mockResolvedValue('OK');
  const quit = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  vi.mocked(createConnection).mockReturnValue({ get, set, quit } as never);

  const module = await Test.createTestingModule({
    providers: [
      RecordStore,
      { provide: ConfigService, useValue: { get: () => url } },
    ],
  }).compile();

  return { store: module.get(RecordStore), get, set, quit };
};

describe('RecordStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects through the shared factory, so it gets the same resilience settings', async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  it('returns nothing when an artifact has never been rendered', async () => {
    const { store } = await setup();

    await expect(store.get(cvPdfJob)).resolves.toBeNull();
  });

  it('returns what the last render produced', async () => {
    const stored = JSON.stringify({
      at: '2026-08-17T12:00:00.000Z',
      result: publicUrl,
    });
    const { store } = await setup({ stored });

    await expect(store.get(cvPdfJob)).resolves.toEqual({
      at: '2026-08-17T12:00:00.000Z',
      result: publicUrl,
    });
  });

  /* A status page is not worth failing over a value someone edited by hand,
     and the next render replaces it. */
  it('treats unparseable stored data as nothing recorded', async () => {
    const { store } = await setup({ stored: 'not json' });

    await expect(store.get(cvPdfJob)).resolves.toBeNull();
  });

  it('treats a stored value of the wrong shape as nothing recorded', async () => {
    const { store } = await setup({ stored: JSON.stringify({ at: 1 }) });

    await expect(store.get(cvPdfJob)).resolves.toBeNull();
  });

  it("namespaces keys so the queue's own keys cannot collide", async () => {
    const { store, set } = await setup();

    await store.set(cvPdfJob, publicUrl);

    expect(set).toHaveBeenNthCalledWith(
      1,
      `${prefix}:${cvPdfJob}`,
      expect.stringContaining(publicUrl),
    );
  });

  it('stamps the time the render finished', async () => {
    const { store, set } = await setup();

    await store.set(cvPdfJob, publicUrl);

    const [, written] = set.mock.calls[0];
    const { at } = JSON.parse(written) as { at: string };

    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });

  it('closes the connection on shutdown', async () => {
    const { store, quit } = await setup();

    await store.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});

describe('isRecord', () => {
  it.each([['a full record', { at: 'now', result: 'url' }]])(
    'accepts %s',
    (_label, value) => {
      expect(isRecord(value)).toBe(true);
    },
  );

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a record with no time', { result: 'url' }],
    ['a record with no result', { at: 'now' }],
    ['a record with the wrong types', { at: 1, result: 2 }],
  ])('rejects %s', (_label, value) => {
    expect(isRecord(value)).toBe(false);
  });
});
