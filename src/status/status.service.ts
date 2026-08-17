import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { CheckStore, type TCheck } from '../integrity/check.store';
import { RecordStore, type TRecord } from '../render/record.store';
import {
  artifacts,
  renderQueue,
  type TArtifact,
} from '../render/render.constants';

/* Only the counts worth reading on a status page. BullMQ reports several more
   — paused, prioritised, waiting-children — none of which this queue can
   reach, and every one of them would be a number nobody could interpret. */
type TQueue = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

/* History rather than a latest-plus-history pair. The newest entry is the
   head of the list, so a caller that only wants "when was this last
   rendered" takes the first element — and a response cannot contradict
   itself by carrying the same render twice in two shapes. */
type TStatus = {
  artifacts: Record<TArtifact, TRecord[]>;
  /* What the last integrity check found, per artifact. Null where one has not
     run yet — the schedule is weekly, so that is the normal state for the
     first few days after a deploy. */
  integrity: Record<TArtifact, TCheck | null>;
  queue: TQueue;
};

@Injectable()
export class StatusService {
  constructor(
    private readonly records: RecordStore,
    private readonly checks: CheckStore,
    @InjectQueue(renderQueue) private readonly queue: Queue,
  ) {}

  /* Everything at once, in parallel — the page shows it together and one
     slow lookup should not serialise the rest. */
  async read(): Promise<TStatus> {
    const [records, checks, counts] = await Promise.all([
      Promise.all(
        artifacts.map(async (name) => await this.records.history(name)),
      ),
      Promise.all(artifacts.map(async (name) => await this.checks.get(name))),
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    ]);

    return {
      artifacts: Object.fromEntries(
        artifacts.map((name, index) => [name, records[index]]),
      ) as Record<TArtifact, TRecord[]>,
      integrity: Object.fromEntries(
        artifacts.map((name, index) => [name, checks[index]]),
      ) as Record<TArtifact, TCheck | null>,
      queue: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  }
}

export type { TStatus, TQueue };
