import { Module } from '@nestjs/common';

import { RenderModule } from '../render/render.module';
import { CheckStore } from './check.store';
import { IntegrityService } from './integrity.service';

@Module({
  /* RenderModule for the hash of what was last rendered and for the queue to
     put a re-render on. ScheduleModule is registered once in AppModule; the
     @Cron decorator here is discovered by it. */
  imports: [RenderModule],
  providers: [IntegrityService, CheckStore],
  /* CheckStore for the status endpoint, which reports what the last check
     found. */
  exports: [CheckStore, IntegrityService],
})
export class IntegrityModule {}
