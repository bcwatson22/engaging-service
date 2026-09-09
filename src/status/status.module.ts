import { Module } from '@nestjs/common';

import { IntegrityModule } from '../integrity/integrity.module';
import { LinksModule } from '../links/links.module';
import { RenderModule } from '../render/render.module';
import { StreamModule } from '../stream/stream.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  /* The stream for its counts, RenderModule for the history the Go worker now
     writes and this service only reads. */
  imports: [StreamModule, RenderModule, IntegrityModule, LinksModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
