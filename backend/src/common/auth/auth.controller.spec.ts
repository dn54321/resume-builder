jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { Response } from 'express';

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: {
    signup: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    validateSession: jest.Mock;
    changePassword: jest.Mock;
    deleteAccount: jest.Mock;
  };

  /**
   *
   */
  function mockResponse() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as Partial<Response>;
  }

  /**
   *
   * @param cookieValue
   */
  function mockRequest(cookieValue?: string): {
    cookies: Record<string, string | undefined>;
  } {
    return {
      cookies: { session_token: cookieValue },
    };
  }

  beforeEach(async () => {
    mockAuthService = {
      signup: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      validateSession: jest.fn(),
      changePassword: jest.fn(),
      deleteAccount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    authController = module.get<AuthController>(AuthController);
  });

  describe('signup', () => {
    it('calls authService.signup, sets cookie, and returns user only', async () => {
      const expected = {
        user: { id: 'user-1', email: 'test@example.com' },
        sessionToken: 'token-123',
      };
      mockAuthService.signup.mockResolvedValue(expected);
      const res = mockResponse() as Response;

      const result = await authController.signup(
        { email: 'test@example.com', password: 'password123' },
        res,
      );

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com' },
      });
      expect(result).not.toHaveProperty('sessionToken');
      expect(mockAuthService.signup).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.cookie).toHaveBeenCalledWith(
        'session_token',
        'token-123',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });
  });

  describe('login', () => {
    it('calls authService.login, sets cookie, and returns user only', async () => {
      const expected = {
        user: { id: 'user-1', email: 'test@example.com' },
        sessionToken: 'token-123',
      };
      mockAuthService.login.mockResolvedValue(expected);
      const res = mockResponse() as Response;

      const result = await authController.login(
        { email: 'test@example.com', password: 'password123' },
        res,
      );

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com' },
      });
      expect(result).not.toHaveProperty('sessionToken');
    });
  });

  describe('logout', () => {
    it('calls authService.logout with cookie token and clears cookie', async () => {
      const req = mockRequest('token-abc');
      const res = mockResponse() as Response;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await authController.logout(req as any, res);

      expect(mockAuthService.logout).toHaveBeenCalledWith('token-abc');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.clearCookie).toHaveBeenCalledWith('session_token', {
        path: '/',
      });
    });

    it('does not call logout when no cookie present', async () => {
      const req = mockRequest(undefined);
      const res = mockResponse() as Response;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await authController.logout(req as any, res);

      expect(mockAuthService.logout).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.clearCookie).toHaveBeenCalledWith('session_token', {
        path: '/',
      });
    });
  });

  describe('me', () => {
    it('returns user when session cookie is valid', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });
      const req = mockRequest('valid-token');

      const result = await authController.me(req as any);

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com' },
      });
    });

    it('returns null user when no cookie present', async () => {
      const req = mockRequest(undefined);

      const result = await authController.me(req as any);

      expect(result).toEqual({ user: null });
    });
  });

  describe('changePassword', () => {
    it('changes password when session cookie is valid', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });
      const req = mockRequest('valid-token');

      await authController.changePassword(req as any, {
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      });

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old-password',
        'new-password-123',
      );
    });

    it('throws UnauthorizedException when no cookie present', async () => {
      const req = mockRequest(undefined);

      await expect(
        authController.changePassword(req as any, {
          currentPassword: 'old',
          newPassword: 'new-password-123',
        }),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UnauthorizedException when session is invalid', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);
      const req = mockRequest('bad-token');

      await expect(
        authController.changePassword(req as any, {
          currentPassword: 'old',
          newPassword: 'new-password-123',
        }),
      ).rejects.toThrow('Invalid or expired session');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account when session cookie is valid and password is correct', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });
      const req = mockRequest('valid-token');

      await authController.deleteAccount(req as any, {
        password: 'current-password',
      });

      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith(
        'user-1',
        'current-password',
      );
    });

    it('throws UnauthorizedException when no cookie present', async () => {
      const req = mockRequest(undefined);

      await expect(
        authController.deleteAccount(req as any, { password: 'pw' }),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UnauthorizedException when session is invalid', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);
      const req = mockRequest('bad-token');

      await expect(
        authController.deleteAccount(req as any, {
          password: 'pw',
        }),
      ).rejects.toThrow('Invalid or expired session');
    });
  });
});
