/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../../features/auth/auth.service';
import type { AuthenticatedRequest } from '../../features/auth/auth.types';
import type { User } from '../../generated/prisma/client';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let validateSessionMock: jest.Mock;

  beforeEach(async () => {
    validateSessionMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: AuthService,
          useValue: { validateSession: validateSessionMock },
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  function createMockContext(
    authHeader?: string,
  ): jest.Mocked<ExecutionContext> {
    const request: Record<string, unknown> = {
      headers: authHeader ? { authorization: authHeader } : {},
      user: undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: <T = AuthenticatedRequest>(): T => request as unknown as T,
      }),
    } as unknown as jest.Mocked<ExecutionContext>;
  }

  it('attaches user when Bearer token is valid', async () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed-pw',
      createdAt: new Date(),
    };
    validateSessionMock.mockResolvedValue(mockUser);

    const context = createMockContext('Bearer valid-token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect((request as Record<string, unknown>)['user']).toBe(mockUser);
  });

  it('throws UnauthorizedException when no auth header', async () => {
    const context = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when header is not Bearer', async () => {
    const context = createMockContext('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token is invalid', async () => {
    validateSessionMock.mockRejectedValue(new UnauthorizedException());

    const context = createMockContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
