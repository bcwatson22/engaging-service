import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createConnection } from './connection';
import { redisClient, RedisModule } from './redis.module';

vi.mock('./connection', () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = 'redis://127.0.0.1:6379';

/* ConfigModule is registered globally by AppModule, so RedisModule never
   imports it. Standing in a global module here matches that, rather than
   changing the module under test to suit the test. */
@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: { get: () => url } }],
  exports: [ConfigService],
})
class TestConfigModule {}

const setup = async () => {
  const quit = vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK');

  vi.mocked(createConnection).mockReturnValue({ quit } as never);

  const module = await Test.createTestingModule({
    imports: [TestConfigModule, RedisModule],
  }).compile();

  return { module, quit };
};

describe('RedisModule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects through the shared factory, so it gets the same resilience settings', async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  /* The point of the module: six stores that used to hold a socket each now
     share one, so an idle app is not paying to keep five more alive. */
  it('opens exactly one connection for every store to share', async () => {
    await setup();

    expect(createConnection).toHaveBeenCalledTimes(1);
  });

  it('hands the same client to anything that asks for it', async () => {
    const { module } = await setup();

    expect(module.get(redisClient)).toBe(module.get(redisClient));
  });

  it('closes the connection on shutdown', async () => {
    const { module, quit } = await setup();

    await module.close();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});
