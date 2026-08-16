import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TEnv } from '../config/env.schema';

/* Only the headers are needed, so this is declared locally rather than
   pulling in @types/express for one property. */
type TRequest = { headers: Record<string, string | string[] | undefined> };

/* A header rather than a query parameter, so the secret never lands in an
   access log. Matches the convention the site's own revalidate route uses. */
const secretHeader = 'x-render-secret';

@Injectable()
export class SecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<TEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<TRequest>();

    if (headers[secretHeader] !== this.config.get('RENDER_SECRET')) {
      throw new UnauthorizedException();
    }

    return true;
  }
}

export { secretHeader };
