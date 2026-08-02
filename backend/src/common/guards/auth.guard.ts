import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const authorization = request.headers['authorization'];
    const sessionToken = this.extractSessionToken(authorization);
    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.authService.validateSession(sessionToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    (request as Record<string, unknown>)['user'] = result.user;
    return true;
  }

  private extractSessionToken(
    authorization: string | undefined,
  ): string | null {
    if (!authorization) {
      return null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1] : null;
  }
}
