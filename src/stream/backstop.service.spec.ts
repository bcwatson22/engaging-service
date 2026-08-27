import { Test } from '@nestjs/testing';

import { BackstopService } from './backstop.service';
import { StreamService } from './stream.service';
import { WorkerClient } from './worker.client';

const setup = async (depth: { waiting: number; pending: number }) => {
  const wake = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const depthMock = vi
    .fn<() => Promise<typeof depth>>()
    .mockResolvedValue(depth);

  const module = await Test.createTestingModule({
    providers: [
      BackstopService,
      { provide: StreamService, useValue: { depth: depthMock } },
      { provide: WorkerClient, useValue: { wake } },
    ],
  }).compile();

  return { backstop: module.get(BackstopService), wake, depthMock };
};

describe('sweep', () => {
  beforeEach(() => vi.clearAllMocks());

  /* The machine costs money awake and does nothing useful with an empty
     stream. */
  it('leaves the worker asleep when there is nothing to do', async () => {
    const { backstop, wake } = await setup({ waiting: 0, pending: 0 });

    await backstop.sweep();

    expect(wake).not.toHaveBeenCalled();
  });

  /* The safety net for a wake that never landed — otherwise the job waits for
     the next CMS publish, which could be weeks. */
  it('wakes the worker when something is waiting', async () => {
    const { backstop, wake } = await setup({ waiting: 1, pending: 0 });

    await backstop.sweep();

    expect(wake).toHaveBeenCalledTimes(1);
  });

  /* Held-but-unacked work is what XAUTOCLAIM recovers, and orphan recovery is
     worthless if nothing is ever awake to perform it. */
  it('wakes the worker for work a crashed consumer still holds', async () => {
    const { backstop, wake } = await setup({ waiting: 0, pending: 1 });

    await backstop.sweep();

    expect(wake).toHaveBeenCalledTimes(1);
  });
});
