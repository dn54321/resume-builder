jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
    it('calls authService.signup and returns the result', async () => {
      const expected = {
        user: { id: 'user-1', email: 'test@example.com' },
        sessionToken: 'token-123',
      };
      mockAuthService.signup.mockResolvedValue(expected);

      const result = await authController.signup({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(expected);
      expect(mockAuthService.signup).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
    });
  });

  describe('login', () => {
    it('calls authService.login and returns the result', async () => {
      const expected = {
        user: { id: 'user-1', email: 'test@example.com' },
        sessionToken: 'token-123',
      };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await authController.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(expected);
    });
  });

  describe('logout', () => {
    it('calls authService.logout with Bearer token', async () => {
      await authController.logout('Bearer token-abc');

      expect(mockAuthService.logout).toHaveBeenCalledWith('token-abc');
    });

    it('does not throw when no authorization header', async () => {
      await expect(authController.logout('')).resolves.toBeUndefined();
    });
  });

  describe('me', () => {
    it('returns user when session is valid', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      const result = await authController.me('Bearer valid-token');

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com' },
      });
    });

    it('returns null user when no token provided', async () => {
      const result = await authController.me('');

      expect(result).toEqual({ user: null });
    });
  });

  describe('changePassword', () => {
    it('changes password when session is valid', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      await authController.changePassword('Bearer valid-token', {
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      });

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old-password',
        'new-password-123',
      );
    });

    it('throws UnauthorizedException when no token provided', async () => {
      await expect(
        authController.changePassword('', {
          currentPassword: 'old',
          newPassword: 'new-password-123',
        }),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UnauthorizedException when session is invalid', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await expect(
        authController.changePassword('Bearer bad-token', {
          currentPassword: 'old',
          newPassword: 'new-password-123',
        }),
      ).rejects.toThrow('Invalid or expired session');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account when session is valid and password is correct', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      await authController.deleteAccount('Bearer valid-token', {
        password: 'current-password',
      });

      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith(
        'user-1',
        'current-password',
      );
    });

    it('throws UnauthorizedException when no token provided', async () => {
      await expect(
        authController.deleteAccount('', { password: 'pw' }),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UnauthorizedException when session is invalid', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await expect(
        authController.deleteAccount('Bearer bad-token', {
          password: 'pw',
        }),
      ).rejects.toThrow('Invalid or expired session');
    });
  });
});
