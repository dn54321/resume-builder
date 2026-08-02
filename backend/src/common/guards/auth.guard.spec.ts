import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../auth/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let mockAuthService: { validateSession: jest.Mock };

  beforeEach(async () => {
    mockAuthService = {
      validateSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  /**
   *
   * @param authorization
   */
  function createMockContext(authorization?: string): ExecutionContext {
    const request = {
      headers: {} as Record<string, string | undefined>,
    };
    if (authorization) {
      request.headers['authorization'] = authorization;
    }
    return {
      switchToHttp: () => ({
        getRequest: <T>() => request as T,
      }),
    } as ExecutionContext;
  }

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw UnauthorizedException when no authorization header', async () => {
    const ctx = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for empty authorization header', async () => {
    const ctx = createMockContext('');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for malformed Bearer token', async () => {
    const ctx = createMockContext('InvalidFormat');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when session is invalid', async () => {
    mockAuthService.validateSession.mockResolvedValue(null);
    const ctx = createMockContext('Bearer valid-looking-token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockAuthService.validateSession).toHaveBeenCalledWith(
      'valid-looking-token',
    );
  });

  it('should set request.user and return true for valid session', async () => {
    const user = { id: 'user-1', email: 'test@test.com' };
    mockAuthService.validateSession.mockResolvedValue({ user });

    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid-token' },
    };
    const ctx = {
      switchToHttp: () => ({
        getRequest: <T>() => request as T,
      }),
    } as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(request['user']).toEqual(user);
  });
});
