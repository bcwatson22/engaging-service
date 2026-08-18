import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

import { CheckStore, type TCheck } from '../integrity/check.store';
import { SweepStore, type TSweep } from '../links/sweep.store';
import { RecordStore, type TRecord } from '../render/record.store';
import {
  cvPdfJob,
  renderQueue,
  startupImagesJob,
} from '../render/render.constants';
import { StatusService } from './status.service';

const record: TRecord = {
  at: '2026-08-17T12:00:00.000Z',
  result: 'https://artifacts.example.com/billy-watson-cv.pdf',
  durationMs: 14_000,
  attempts: 3,
  elapsedMs: 49_000,
};

const check: TCheck = {
  at: '2026-08-17T12:00:00.000Z',
  drifted: false,
  queued: false,
  stale: false,
};

const sweep: TSweep = {
  at: '2026-08-17T12:00:00.000Z',
  checked: 12,
  problems: [],
};

type TOptions = {
  links?: TSweep | null;
  records?: Record<string, TRecord[]>;
  checks?: Record<string, TCheck | null>;
  counts?: Record<string, number>;
};

const setup = async ({
  records = {},
  checks = {},
  links = null,
  counts,
}: TOptions = {}) => {
  const history = vi
    .fn<(artifact: string) => Promise<TRecord[]>>()
    .mockImplementation((artifact) => Promise.resolve(records[artifact] ?? []));

  const getJobCounts = vi
    .fn<() => Promise<Record<string, number>>>()
    .mockResolvedValue(
      counts ?? { waiting: 2, active: 1, delayed: 0, failed: 3 },
    );

  const getCheck = vi
    .fn<(artifact: string) => Promise<TCheck | null>>()
    .mockImplementation((artifact) =>
      Promise.resolve(checks[artifact] ?? null),
    );

  const module = await Test.createTestingModule({
    providers: [
      StatusService,
      { provide: RecordStore, useValue: { history } },
      { provide: CheckStore, useValue: { get: getCheck } },
      {
        provide: SweepStore,
        useValue: {
          get: vi.fn<() => Promise<TSweep | null>>().mockResolvedValue(links),
        },
      },
      { provide: getQueueToken(renderQueue), useValue: { getJobCounts } },
    ],
  }).compile();

  return {
    service: module.get(StatusService),
    history,
    getCheck,
    getJobCounts,
  };
};

describe('StatusService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports every artifact, rendered or not', async () => {
    const { service } = await setup({ records: { [cvPdfJob]: [record] } });

    await expect(service.read()).resolves.toMatchObject({
      artifacts: { [cvPdfJob]: [record], [startupImagesJob]: [] },
    });
  });

  it('asks for each artifact by name', async () => {
    const { service, history } = await setup();

    await service.read();

    expect(history).toHaveBeenNthCalledWith(1, cvPdfJob);
    expect(history).toHaveBeenNthCalledWith(2, startupImagesJob);
  });

  it('reports what the last integrity check found', async () => {
    const { service } = await setup({ checks: { [cvPdfJob]: check } });

    await expect(service.read()).resolves.toMatchObject({
      integrity: { [cvPdfJob]: check, [startupImagesJob]: null },
    });
  });

  it('reports what the last link sweep found', async () => {
    const { service } = await setup({ links: sweep });

    await expect(service.read()).resolves.toMatchObject({ links: sweep });
  });

  it('reports no sweep before one has run', async () => {
    const { service } = await setup();

    await expect(service.read()).resolves.toMatchObject({ links: null });
  });

  it('reports the queue depth', async () => {
    const { service } = await setup();

    await expect(service.read()).resolves.toMatchObject({
      queue: { waiting: 2, active: 1, delayed: 0, failed: 3 },
    });
  });

  /* Only the counts a reader can interpret — BullMQ offers several this queue
     can never reach. */
  it('asks only for the counts it reports', async () => {
    const { service, getJobCounts } = await setup();

    await service.read();

    expect(getJobCounts).toHaveBeenNthCalledWith(
      1,
      'waiting',
      'active',
      'delayed',
      'failed',
    );
  });

  it('reports zero for a count the queue omits', async () => {
    const { service } = await setup({ counts: {} });

    await expect(service.read()).resolves.toMatchObject({
      queue: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    });
  });
});
