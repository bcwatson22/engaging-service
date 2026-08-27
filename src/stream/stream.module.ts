import { Module } from '@nestjs/common';

import { HashStore } from '../render/hash.store';
import { BackstopService } from './backstop.service';
import { StreamService } from './stream.service';
import { WorkerClient } from './worker.client';

/* The stream half of the render pipeline, running alongside BullMQ rather than
   replacing it yet. Both paths stay live until the Go worker's output has been
   compared against this service's for a fortnight. */
@Module({
  providers: [StreamService, WorkerClient, BackstopService, HashStore],
  exports: [StreamService],
})
export class StreamModule {}
