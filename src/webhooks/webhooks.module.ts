import { Module } from '@nestjs/common';

import { RenderModule } from '../render/render.module';
import { SignatureGuard } from './signature.guard';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [RenderModule],
  controllers: [WebhooksController],
  providers: [SignatureGuard],
})
export class WebhooksModule {}
