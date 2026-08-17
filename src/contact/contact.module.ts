import { Module } from '@nestjs/common';

import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { Mailer } from './mailer';
import { RateLimitStore } from './rate-limit.store';

@Module({
  controllers: [ContactController],
  providers: [ContactService, Mailer, RateLimitStore],
})
export class ContactModule {}
