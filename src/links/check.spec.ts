import { checkLink, method, noResponse, stateFor, userAgent } from './check';

const url = 'https://linkedin.com/in/someone';

const setup = ({ status = 200, rejects = false } = {}) => {
  const fetchMock = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() =>
      rejects
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve({ status } as Response),
    );

  vi.stubGlobal('fetch', fetchMock);

  return { fetch: fetchMock };
};

describe('checkLink', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => vi.unstubAllGlobals());

  /* The body is never wanted, and downloading a megabyte of somebody's
     homepage weekly to learn a status code would be rude. */
  it('asks for the headers only', async () => {
    const { fetch } = setup();

    await checkLink(url);

    expect(fetch.mock.calls[0][1]).toMatchObject({ method });
  });

  /* A default fetch user-agent gets refused by more hosts than it gets served
     by, which would report half the CV's links as broken. */
  it('identifies itself as something a host will serve', async () => {
    const { fetch } = setup();

    await checkLink(url);

    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      'user-agent': userAgent,
    });
  });

  it('gives up rather than hanging on a dead host', async () => {
    const { fetch } = setup();

    await checkLink(url);

    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a working link', async () => {
    setup();

    await expect(checkLink(url)).resolves.toEqual({
      url,
      status: 200,
      state: 'ok',
    });
  });

  it('reports a link that answered nothing at all', async () => {
    setup({ rejects: true });

    await expect(checkLink(url)).resolves.toEqual({
      url,
      status: noResponse,
      state: 'broken',
    });
  });
});

describe('stateFor', () => {
  it.each([200, 204, 301, 302, 308])('reads %i as working', (status) => {
    expect(stateFor(status)).toBe('ok');
  });

  /* A host refusing a bot says nothing about whether the link works for a
     person. Reporting LinkedIn's 999 as broken every week would train anyone
     reading this to ignore the whole report. */
  it.each([401, 403, 405, 429, 999])(
    'reads %i as the host refusing a robot, not a dead link',
    (status) => {
      expect(stateFor(status)).toBe('blocked');
    },
  );

  it.each([404, 410, 500, 503])('reads %i as broken', (status) => {
    expect(stateFor(status)).toBe('broken');
  });
});
