import { Module } from '@nestjs/common';

import { StreamModule } from '../stream/stream.module';
import { HashStore } from './hash.store';
import { RecordStore } from './record.store';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { SecretGuard } from './secret.guard';

/* No processor, no browser, no object storage. What is left is the request
   side of rendering — asking for an artifact, and reading what came of it. */
@Module({
  imports: [StreamModule],
  controllers: [RenderController],
  providers: [RenderService, SecretGuard, HashStore, RecordStore],
  /* RecordStore is exported for the status module, which reads the history the
     Go worker writes. */
  /* HashStore is exported for the integrity check, which compares the live
     page against the hash of whatever was last rendered from it. */
  exports: [RenderService, RecordStore, HashStore],
})
export class RenderModule {}
