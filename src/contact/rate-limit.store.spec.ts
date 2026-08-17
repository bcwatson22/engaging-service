import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createConnection } from '../redis/connection';
import {
  maxPerAddress,
  maxPerIdentity,
  prefix,
  RateLimitStore,
  windowSeconds,
} from './rate-limit.store';

vi.mock('../redis/connection', () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = 'redis://127.0.0.1:6379';
const address = '81.2.69.142';
const identity = 'tom@example.com';

/* incr resolves the next count in the queue, so a test can describe a key's
   history as a list rather than by stubbing per-call. */
const setup = async (counts: number[] = [1, 1]) => {
  const queued = [...counts];

  const incr = vi
    .fn<() => Promise<number>>()
    .mockImplementation(() => Promise.resolve(queued.shift() ?? 1));
  const expire = vi.fn<() => Promise<number>>().mockResolvedValue(1);
  const quit = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  vi.mocked(createConnection).mockReturnValue({
    incr,
    expire,
    quit,
  } as never);

  const module = await Test.createTestingModule({
    providers: [
      RateLimitStore,
      { provide: ConfigService, useValue: { get: () => url } },
    ],
  }).compile();

  return { store: module.get(RateLimitStore), incr, expire, quit };
};

describe('RateLimitStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects through the shared factory, so it gets the same resilience settings', async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  it('allows a first submission', async () => {
    const { store } = await setup();

    await expect(store.allows(address, identity)).resolves.toBe(true);
  });

  it('counts the address and the identity separately', async () => {
    const { store, incr } = await setup();

    await store.allows(address, identity);

    expect(incr).toHaveBeenNthCalledWith(1, `${prefix}:ip:${address}`);
    expect(incr).toHaveBeenNthCalledWith(2, `${prefix}:email:${identity}`);
  });

  it('lower-cases the identity, so casing cannot buy a fresh allowance', async () => {
    const { store, incr } = await setup();

    await store.allows(address, 'Tom@Example.com');

    expect(incr).toHaveBeenNthCalledWith(2, `${prefix}:email:${identity}`);
  });

  it('expires the window on the first hit only, so it cannot be held open', async () => {
    const { store, expire } = await setup([1, 2]);

    await store.allows(address, identity);

    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenNthCalledWith(
      1,
      `${prefix}:ip:${address}`,
      windowSeconds,
    );
  });

  it('refuses once one address has sent too many', async () => {
    const { store } = await setup([maxPerAddress + 1, 1]);

    await expect(store.allows(address, identity)).resolves.toBe(false);
  });

  it('refuses once one identity has sent too many, whatever the address', async () => {
    const { store } = await setup([1, maxPerIdentity + 1]);

    await expect(store.allows(address, identity)).resolves.toBe(false);
  });

  it('counts both even when the first has already failed, so which limit was hit stays hidden', async () => {
    const { store, incr } = await setup([maxPerAddress + 1, 1]);

    await store.allows(address, identity);

    expect(incr).toHaveBeenCalledTimes(2);
  });

  it('closes the connection on shutdown', async () => {
    const { store, quit } = await setup();

    await store.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});
