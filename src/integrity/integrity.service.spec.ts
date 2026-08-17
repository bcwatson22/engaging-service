import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { fetchCombinedHash } from '../render/content-hash';
import { HashStore } from '../render/hash.store';
import {
  cvPdf,
  cvPdfJob,
  startupImages,
  startupImagesJob,
} from '../render/render.constants';
import { RenderService } from '../render/render.service';
import { CheckStore, type TCheck } from './check.store';
import { IntegrityService } from './integrity.service';

vi.mock('../render/content-hash', () => ({
  fetchCombinedHash: vi.fn<() => Promise<string>>(),
}));

const siteUrl = 'https://www.engaging.engineering';
const liveHash = 'live';

type TOptions = {
  live?: string;
  rendered?: string | null;
  previous?: TCheck | null;
};

const setup = async ({
  live = liveHash,
  rendered = liveHash,
  previous = null,
}: TOptions = {}) => {
  vi.mocked(fetchCombinedHash).mockResolvedValue(live);

  const hash = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(rendered);
  const getCheck = vi
    .fn<() => Promise<TCheck | null>>()
    .mockResolvedValue(previous);
  const setCheck = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const enqueue = vi.fn<() => Promise<string>>().mockResolvedValue('job-1');

  const module = await Test.createTestingModule({
    providers: [
      IntegrityService,
      { provide: HashStore, useValue: { get: hash } },
      { provide: CheckStore, useValue: { get: getCheck, set: setCheck } },
      { provide: RenderService, useValue: { enqueue } },
      { provide: ConfigService, useValue: { get: () => siteUrl } },
    ],
  }).compile();

  return {
    service: module.get(IntegrityService),
    hash,
    setCheck,
    enqueue,
  };
};

describe('IntegrityService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('what it compares', () => {
    it('hashes the page the CV is rendered from', async () => {
      const { service } = await setup();

      await service.check(cvPdfJob);

      expect(fetchCombinedHash).toHaveBeenNthCalledWith(1, [
        `${siteUrl}${cvPdf.path}`,
      ]);
    });

    /* The splash screens are captured from both pages, so either changing is
       drift. */
    it('hashes every page the splash screens are captured from', async () => {
      const { service } = await setup();

      await service.check(startupImagesJob);

      expect(fetchCombinedHash).toHaveBeenNthCalledWith(
        1,
        startupImages.paths.map((path) => `${siteUrl}${path}`),
      );
    });

    it('compares against the hash recorded for that artifact', async () => {
      const { service, hash } = await setup();

      await service.check(cvPdfJob);

      expect(hash).toHaveBeenNthCalledWith(1, cvPdf.key);
    });
  });

  describe('when the artifact is current', () => {
    it('reports no drift', async () => {
      const { service } = await setup();

      await expect(service.check(cvPdfJob)).resolves.toEqual({
        drifted: false,
        queued: false,
        stale: false,
      });
    });

    it('queues nothing', async () => {
      const { service, enqueue } = await setup();

      await service.check(cvPdfJob);

      expect(enqueue).not.toHaveBeenCalled();
    });

    it('still records the check, so the page can say when it last ran', async () => {
      const { service, setCheck } = await setup();

      await service.check(cvPdfJob);

      expect(setCheck).toHaveBeenNthCalledWith(1, cvPdfJob, {
        drifted: false,
        queued: false,
        stale: false,
      });
    });
  });

  /* There is no previous version for the page to have drifted from, and
     queueing here would fight whatever is meant to produce the first one. */
  describe('when nothing has been rendered yet', () => {
    it('does not call that drift', async () => {
      const { service } = await setup({ rendered: null });

      await expect(service.check(cvPdfJob)).resolves.toMatchObject({
        drifted: false,
      });
    });

    it('queues nothing', async () => {
      const { service, enqueue } = await setup({ rendered: null });

      await service.check(cvPdfJob);

      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('when the page has drifted', () => {
    const drifted = { live: 'new', rendered: 'old' };

    it('queues a render', async () => {
      const { service, enqueue } = await setup(drifted);

      await service.check(cvPdfJob);

      expect(enqueue).toHaveBeenNthCalledWith(1, cvPdfJob);
    });

    /* Not forced: the render's own content check is what makes it wait for
       the site, and skipping it here would defeat the retry ladder. */
    it('does not force the render past its own content check', async () => {
      const { service, enqueue } = await setup(drifted);

      await service.check(cvPdfJob);

      expect(enqueue.mock.calls[0]).toHaveLength(1);
    });

    it('records that it queued one', async () => {
      const { service } = await setup(drifted);

      await expect(service.check(cvPdfJob)).resolves.toEqual({
        drifted: true,
        queued: true,
        stale: false,
      });
    });
  });

  /* Queueing again every week would be a slow loop that never fixes anything
     and hides the problem in a normal-looking log line. */
  describe('when it has drifted despite a render already being queued', () => {
    const stuck = {
      live: 'new',
      rendered: 'old',
      previous: {
        at: '2026-08-10T12:00:00.000Z',
        drifted: true,
        queued: true,
        stale: false,
      },
    };

    it('does not queue another', async () => {
      const { service, enqueue } = await setup(stuck);

      await service.check(cvPdfJob);

      expect(enqueue).not.toHaveBeenCalled();
    });

    it('reports it as stale, so the status page can say so', async () => {
      const { service } = await setup(stuck);

      await expect(service.check(cvPdfJob)).resolves.toEqual({
        drifted: true,
        queued: false,
        stale: true,
      });
    });

    /* A previous check that found drift but never queued — because it was
       itself stale — should not block a fresh attempt forever. */
    it('queues again once a previous check stopped queueing', async () => {
      const { service, enqueue } = await setup({
        ...stuck,
        previous: { ...stuck.previous, queued: false, stale: true },
      });

      await service.check(cvPdfJob);

      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('on its schedule', () => {
    it('checks every artifact', async () => {
      const { service, setCheck } = await setup();

      await service.run();

      expect(setCheck).toHaveBeenNthCalledWith(1, cvPdfJob, expect.anything());
      expect(setCheck).toHaveBeenNthCalledWith(
        2,
        startupImagesJob,
        expect.anything(),
      );
    });
  });
});
