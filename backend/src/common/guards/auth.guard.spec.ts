import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../auth/auth.service';

const COOKIE_NAME = 'session_token';

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
   * Create a mock ExecutionContext with a cookies object.
   * @param cookieValue
   */
  function createMockContext(cookieValue?: string): ExecutionContext {
    const request = {
      cookies: {} as Record<string, string | undefined>,
    };
    if (cookieValue !== undefined) {
      request.cookies[COOKIE_NAME] = cookieValue;
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

  it('should throw UnauthorizedException when no session cookie', async () => {
    const ctx = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for empty session cookie', async () => {
    const ctx = createMockContext('');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when session is invalid', async () => {
    mockAuthService.validateSession.mockResolvedValue(null);
    const ctx = createMockContext('valid-looking-token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockAuthService.validateSession).toHaveBeenCalledWith(
      'valid-looking-token',
    );
  });

  it('should set request.user and return true for valid session', async () => {
    const user = { id: 'user-1', email: 'test@test.com' };
    mockAuthService.validateSession.mockResolvedValue({ user });

    const request: Record<string, unknown> = {
      cookies: { [COOKIE_NAME]: 'valid-token' },
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
