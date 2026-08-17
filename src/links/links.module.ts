import { Module } from '@nestjs/common';

import { LinksService } from './links.service';
import { SweepStore } from './sweep.store';

@Module({
  providers: [LinksService, SweepStore],
  /* SweepStore for the status endpoint, which reports what the last sweep
     found. */
  exports: [SweepStore, LinksService],
})
export class LinksModule {}
