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
   layout fix — changes the page without touching Hygraph, so the PDF and the
   splash screens quietly drift from what they are supposed to depict. The
   manual render route exists precisely because of that, which is an admission
   that the automation has a gap rather than a fix for it.

   Weekly, because the drift this catches arrives with a deploy and nobody is
   waiting on it. A deploy hook would be tighter and is the better answer if
   the site's pipeline ever calls this; the schedule is the version that needs
   no coupling between two deploys.

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
    for (const artifact of artifacts) await this.check(artifact);
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

      return { drifted: false, queued: false, stale: false };
    }

    if (live === rendered) {
      this.logger.log(`${artifact}: current`);

      return { drifted: false, queued: false, stale: false };
    }

    const previous = await this.checks.get(artifact);

    /* Already asked for once and still wrong. Queueing again every week would
       be a slow loop that never fixes anything and hides the problem in a
       normal-looking log line, so this stops and says so instead. */
    if (previous?.queued) {
      this.logger.warn(
        `${artifact}: still drifted after a render was queued — not queueing again`,
      );

      return { drifted: true, queued: false, stale: true };
    }

    await this.render.enqueue(artifact);

    this.logger.log(`${artifact}: drifted, queued a render`);

    return { drifted: true, queued: true, stale: false };
  }
}

export { schedule };
