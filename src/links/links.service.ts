import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Env } from '../config/env.schema';
import { cvPdf } from '../render/render.constants';
import { checkLink, type Result } from './check';
import { extractLinks } from './extract';
import { SweepStore } from './sweep.store';

/* Weekly, and on a different day from the integrity check so two sets of
   outbound requests do not land together on a machine sized for one render at
   a time. */
const schedule = CronExpression.EVERY_WEEK;

/* Sequential rather than all at once. There are a dozen or so links and no
   hurry; firing them in parallel makes this look like a scanner to the hosts
   least likely to give it the benefit of the doubt. */
const checkEach = async (urls: string[]): Promise<Result[]> => {
  const results: Result[] = [];

  for (const url of urls) results.push(await checkLink(url));

  return results;
};

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    private readonly sweeps: SweepStore,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(schedule, { name: 'links' })
  async run(): Promise<void> {
    await this.sweep();
  }

  /* Public so it can be run deliberately as well as on the schedule.

     Reported, never emailed. A weekly message saying LinkedIn answered 999
     again would train anyone receiving it to ignore the next one, including
     the time it is a link that genuinely died. */
  async sweep(): Promise<Result[]> {
    const url = `${this.config.get('SITE_URL', { infer: true })}${cvPdf.path}`;
    const response = await fetch(url, {
      headers: { 'cache-control': 'no-cache' },
    });

    if (!response.ok) {
      this.logger.warn(`Could not read ${url}: ${response.status}`);

      return [];
    }

    const links = extractLinks(await response.text());
    const results = await checkEach(links);
    const problems = results.filter(({ state }) => state !== 'ok');

    await this.sweeps.set(results.length, problems);

    this.logger.log(
      `Checked ${results.length} links, ${problems.length} worth a look`,
    );

    return problems;
  }
}

export { schedule, checkEach };
