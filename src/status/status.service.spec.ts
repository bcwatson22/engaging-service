import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

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
};

type TOptions = {
  records?: Record<string, TRecord | null>;
  counts?: Record<string, number>;
};

const setup = async ({ records = {}, counts }: TOptions = {}) => {
  const get = vi
    .fn<(artifact: string) => Promise<TRecord | null>>()
    .mockImplementation((artifact) =>
      Promise.resolve(records[artifact] ?? null),
    );

  const getJobCounts = vi
    .fn<() => Promise<Record<string, number>>>()
    .mockResolvedValue(
      counts ?? { waiting: 2, active: 1, delayed: 0, failed: 3 },
    );

  const module = await Test.createTestingModule({
    providers: [
      StatusService,
      { provide: RecordStore, useValue: { get } },
      { provide: getQueueToken(renderQueue), useValue: { getJobCounts } },
    ],
  }).compile();

  return { service: module.get(StatusService), get, getJobCounts };
};

describe('StatusService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports every artifact, rendered or not', async () => {
    const { service } = await setup({ records: { [cvPdfJob]: record } });

    await expect(service.read()).resolves.toMatchObject({
      artifacts: { [cvPdfJob]: record, [startupImagesJob]: null },
    });
  });

  it('asks for each artifact by name', async () => {
    const { service, get } = await setup();

    await service.read();

    expect(get).toHaveBeenNthCalledWith(1, cvPdfJob);
    expect(get).toHaveBeenNthCalledWith(2, startupImagesJob);
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
