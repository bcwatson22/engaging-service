import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { IntegrityModule } from '../integrity/integrity.module';
import { LinksModule } from '../links/links.module';
import { renderQueue } from '../render/render.constants';
import { RenderModule } from '../render/render.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  /* The queue for its counts, RenderModule for the record the processor
     writes. Registering the queue here rather than reaching into RenderModule
     for it keeps this module's own dependency explicit. */
  imports: [
    BullModule.registerQueue({ name: renderQueue }),
    RenderModule,
    IntegrityModule,
    LinksModule,
  ],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
