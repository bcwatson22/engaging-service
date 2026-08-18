import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { cvPdf } from '../render/render.constants';
import { checkLink, type TResult } from './check';
import { LinksService } from './links.service';
import { SweepStore } from './sweep.store';

vi.mock('./check', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkLink: vi.fn<(url: string) => Promise<TResult>>(),
}));

const siteUrl = 'https://www.engaging.engineering';

const page = `
  <a href="https://linkedin.com/in/someone">LinkedIn</a>
  <a href="https://github.com/someone">Github</a>
  <a href="/cv">CV</a>
`;

const ok = (url: string): TResult => ({ url, status: 200, state: 'ok' });

type TOptions = {
  html?: string;
  pageOk?: boolean;
  results?: Record<string, TResult>;
};

const setup = async ({
  html = page,
  pageOk = true,
  results,
}: TOptions = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>().mockResolvedValue({
      ok: pageOk,
      status: pageOk ? 200 : 500,
      text: () => Promise.resolve(html),
    } as Response),
  );

  vi.mocked(checkLink).mockImplementation((url) =>
    Promise.resolve(results?.[url] ?? ok(url)),
  );

  const set = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const module = await Test.createTestingModule({
    providers: [
      LinksService,
      { provide: SweepStore, useValue: { set } },
      { provide: ConfigService, useValue: { get: () => siteUrl } },
    ],
  }).compile();

  return { service: module.get(LinksService), set };
};

describe('LinksService', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => vi.unstubAllGlobals());

  it('reads the CV page, which is where the links are', async () => {
    await (await setup()).service.sweep();

    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      `${siteUrl}${cvPdf.path}`,
    );
  });

  it('checks every outbound link it found', async () => {
    const { service } = await setup();

    await service.sweep();

    expect(checkLink).toHaveBeenNthCalledWith(
      1,
      'https://linkedin.com/in/someone',
    );
    expect(checkLink).toHaveBeenNthCalledWith(2, 'https://github.com/someone');
    expect(checkLink).toHaveBeenCalledTimes(2);
  });

  it('records how many it checked', async () => {
    const { service, set } = await setup();

    await service.sweep();

    expect(set).toHaveBeenNthCalledWith(1, 2, []);
  });

  /* Storing "this link still works" a dozen times a week is a fact nobody
     reads, and the count already implies it. */
  it('records only the links worth looking at', async () => {
    const dead = {
      url: 'https://github.com/someone',
      status: 404,
      state: 'broken' as const,
    };

    const { service, set } = await setup({
      results: { 'https://github.com/someone': dead },
    });

    await service.sweep();

    expect(set).toHaveBeenNthCalledWith(1, 2, [dead]);
  });

  it('counts a blocked host as worth a look without calling it broken', async () => {
    const blocked = {
      url: 'https://linkedin.com/in/someone',
      status: 999,
      state: 'blocked' as const,
    };

    const { service, set } = await setup({
      results: { 'https://linkedin.com/in/someone': blocked },
    });

    await service.sweep();

    expect(set).toHaveBeenNthCalledWith(1, 2, [blocked]);
  });

  it('returns what it found, so a manual run says something', async () => {
    const { service } = await setup();

    await expect(service.sweep()).resolves.toEqual([]);
  });

  /* If the page cannot be read there are no links to judge, and recording an
     empty sweep would look like a page with no links rather than a page that
     could not be fetched. */
  describe('when the page cannot be read', () => {
    it('records nothing', async () => {
      const { service, set } = await setup({ pageOk: false });

      await service.sweep();

      expect(set).not.toHaveBeenCalled();
    });

    it('checks nothing', async () => {
      const { service } = await setup({ pageOk: false });

      await service.sweep();

      expect(checkLink).not.toHaveBeenCalled();
    });
  });

  it('sweeps on its schedule', async () => {
    const { service, set } = await setup();

    await service.run();

    expect(set).toHaveBeenCalledTimes(1);
  });
});
