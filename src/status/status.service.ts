import { Injectable } from '@nestjs/common';

import { CheckStore, type Check } from '../integrity/check.store';
import { SweepStore, type Sweep } from '../links/sweep.store';
import { RecordStore, type Render } from '../render/record.store';
import { artifacts, type Artifact } from '../render/render.constants';
import { StreamService, type Depth } from '../stream/stream.service';

/* The three counts a stream can answer, and the only ones worth reading here.
   `waiting` is work the worker has not been handed yet, `pending` is work it
   holds and has not acked, and `dead` is what it gave up on — the one number
   that means something is wrong rather than merely busy.

   BullMQ's active/delayed/paused have no equivalent and are not missed: a
   consumer group has no notion of a delayed job, because the worker's retry
   ladder runs in its own process rather than in Redis. */
type Queue = Depth;

/* History rather than a latest-plus-history pair. The newest entry is the
   head of the list, so a caller that only wants "when was this last
   rendered" takes the first element — and a response cannot contradict
   itself by carrying the same render twice in two shapes. */
type Status = {
  artifacts: Record<Artifact, Render[]>;
  /* What the last integrity check found, per artifact. Null where one has not
     run yet — the schedule is weekly, so that is the normal state for the
     first few days after a deploy. */
  integrity: Record<Artifact, Check | null>;
  /* What the last outbound-link sweep found. Null before one has run. */
  links: Sweep | null;
  queue: Queue;
};

@Injectable()
export class StatusService {
  constructor(
    private readonly records: RecordStore,
    private readonly checks: CheckStore,
    private readonly sweeps: SweepStore,
    private readonly stream: StreamService,
  ) {}

  /* Everything at once, in parallel — the page shows it together and one
     slow lookup should not serialise the rest. */
  async read(): Promise<Status> {
    const [records, checks, links, counts] = await Promise.all([
      Promise.all(
        artifacts.map(async (name) => await this.records.history(name)),
      ),
      Promise.all(artifacts.map(async (name) => await this.checks.get(name))),
      this.sweeps.get(),
      this.stream.depth(),
    ]);

    return {
      artifacts: Object.fromEntries(
        artifacts.map((name, index) => [name, records[index]]),
      ) as Record<Artifact, Render[]>,
      integrity: Object.fromEntries(
        artifacts.map((name, index) => [name, checks[index]]),
      ) as Record<Artifact, Check | null>,
      links,
      queue: counts,
    };
  }
}

export type { Status, Queue };
