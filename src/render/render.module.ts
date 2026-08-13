import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { StorageModule } from "../storage/storage.module";
import { HashStore } from "./hash.store";
import { renderQueue } from "./render.constants";
import { RenderController } from "./render.controller";
import { RenderProcessor } from "./render.processor";
import { RenderService } from "./render.service";
import { SecretGuard } from "./secret.guard";

@Module({
  imports: [BullModule.registerQueue({ name: renderQueue }), StorageModule],
  controllers: [RenderController],
  providers: [RenderService, RenderProcessor, SecretGuard, HashStore],
  exports: [RenderService],
})
export class RenderModule {}
