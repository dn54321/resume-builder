import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';

const COOKIE_NAME = 'session_token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionToken = this.extractSessionToken(request);
    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.authService.validateSession(sessionToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    (request as unknown as Record<string, unknown>)['user'] = result.user;
    return true;
  }

  private extractSessionToken(req: Request): string | null {
    const token: string | undefined = req.cookies?.[COOKIE_NAME] as
      string | undefined;
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
    return null;
  }
}
