import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { TEnv } from '../config/env.schema';
import { fetchCombinedHash } from '../render/content-hash';
import { HashStore } from '../render/hash.store';
import {
  artifacts,
  sourcesFor,
  type TArtifact,
} from '../render/render.constants';
import { RenderService } from '../render/render.service';
import { CheckStore, type TOutcome } from './check.store';

/* The hole this fills: artifacts are only ever re-made when the CMS publishes.
   A change shipped from the site's own repo — a print stylesheet, a font, a
   layout fix, a component rendering an address differently — changes the page
   without touching Hygraph, so the PDF and the splash screens quietly drift
   from what they are supposed to depict.

   Run two ways. The site's pipeline calls POST /integrity once each production
   deploy is live, which is where this drift actually arrives, so a merged
   change reaches the PDF within minutes. The weekly schedule stays as the
   backstop for a deploy whose call did not land.

   It only runs at all because the machine stopped sleeping — a timer in a
   stopped container does not fire. */
const schedule = CronExpression.EVERY_WEEK;

@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  constructor(
    private readonly hashes: HashStore,
    private readonly checks: CheckStore,
    private readonly render: RenderService,
    private readonly config: ConfigService<TEnv, true>,
  ) {}

  @Cron(schedule, { name: 'integrity' })
  async run(): Promise<void> {
    await this.checkAll();
  }

  /* One artifact at a time, so two renders are not queued in the same breath
     as their hashes are fetched. */
  async checkAll(): Promise<Record<TArtifact, TOutcome>> {
    const outcomes = {} as Record<TArtifact, TOutcome>;

    for (const artifact of artifacts)
      outcomes[artifact] = await this.check(artifact);

    return outcomes;
  }

  /* Public so it can be run deliberately as well as on the schedule, and so
     the decision can be tested without waiting a week. */
  async check(artifact: TArtifact): Promise<TOutcome> {
    const { paths, key } = sourcesFor(artifact);
    const siteUrl = this.config.get('SITE_URL', { infer: true });

    const live = await fetchCombinedHash(
      paths.map((path) => `${siteUrl}${path}`),
    );
    const rendered = await this.hashes.get(key);

    const outcome = await this.decide(artifact, live, rendered);

    await this.checks.set(artifact, outcome);

    return outcome;
  }

  private async decide(
    artifact: TArtifact,
    live: string,
    rendered: string | null,
  ): Promise<TOutcome> {
    /* Nothing rendered yet is not drift. There is no previous version for the
       page to have drifted from, and queueing a render here would fight with
       whatever is already meant to produce the first one. */
    if (rendered === null) {
      this.logger.log(`${artifact}: nothing rendered yet, nothing to compare`);

      return { drifted: false, queued: false, stale: false, live };
    }

    if (live === rendered) {
      this.logger.log(`${artifact}: current`);

      return { drifted: false, queued: false, stale: false, live };
    }

    const previous = await this.checks.get(artifact);

    /* Already asked for once, for this same page, and still wrong. Queueing
       again on every check would be a loop that never fixes anything and
       hides the problem in a normal-looking log line, so this stops and says
       so instead.

       Only for the same page, though. A render queued for one deploy and a
       further change shipped by the next are two drifts, and the second is not
       stuck just because the first check queued something. */
    if (previous?.queued && previous.live === live) {
      this.logger.warn(
        `${artifact}: still drifted after a render was queued — not queueing again`,
      );

      return { drifted: true, queued: false, stale: true, live };
    }

    await this.render.enqueue(artifact);

    this.logger.log(`${artifact}: drifted, queued a render`);

    return { drifted: true, queued: true, stale: false, live };
  }
}

export { schedule };
