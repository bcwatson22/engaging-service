import { Test } from '@nestjs/testing';

import { redisClient } from '../redis/redis.module';
import { HashStore, prefix } from './hash.store';

const key = 'billy-watson-cv.pdf';

const setup = async (options: { stored?: string | null } = {}) => {
  const get = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(options.stored ?? null);
  const set = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  const module = await Test.createTestingModule({
    providers: [{ provide: redisClient, useValue: { get, set } }, HashStore],
  }).compile();

  return { store: module.get(HashStore), get, set };
};

describe('HashStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when nothing has been rendered yet', async () => {
    const { store } = await setup();

    await expect(store.get(key)).resolves.toBeNull();
  });

  it('returns the stored hash', async () => {
    const { store } = await setup({ stored: 'abc123' });

    await expect(store.get(key)).resolves.toBe('abc123');
  });

  it("namespaces keys so the queue's own keys cannot collide", async () => {
    const { store, set } = await setup();

    await store.set(key, 'abc123');

    expect(set).toHaveBeenNthCalledWith(1, `${prefix}:${key}`, 'abc123');
  });
});
