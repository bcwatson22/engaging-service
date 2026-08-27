import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { wakePath, WorkerClient } from './worker.client';

const base = 'http://engaging-worker.flycast';

const setup = async (
  options: { response?: Response; rejects?: Error } = {},
) => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (options.rejects) throw options.rejects;

    return options.response ?? new Response('{}', { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);

  const module = await Test.createTestingModule({
    providers: [
      WorkerClient,
      { provide: ConfigService, useValue: { get: () => base } },
    ],
  }).compile();

  return { client: module.get(WorkerClient), fetchMock };
};

describe('wake', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  /* Only proxy-routed traffic starts a stopped Fly machine, which is why this
     is the Flycast address and not `.internal`. */
  it('calls the worker over its configured address', async () => {
    const { client, fetchMock } = await setup();

    await expect(client.wake('a publish')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${base}${wakePath}`,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('reports a refusal without throwing', async () => {
    const { client } = await setup({
      response: new Response('', { status: 503 }),
    });

    await expect(client.wake('a publish')).resolves.toBe(false);
  });

  /* A failed wake means the render is late, not lost — the backstop sweep
     picks it up. A webhook that failed because of it would be worse. */
  it('swallows a network failure', async () => {
    const { client } = await setup({ rejects: new Error('timed out') });

    await expect(client.wake('a publish')).resolves.toBe(false);
  });
});
