import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<
    Pick<AuthService, 'signup' | 'login' | 'logout' | 'getMe'>
  >;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    createdAt: new Date(),
  };

  const mockToken = 'mock-raw-token';

  beforeEach(async () => {
    authService = {
      signup: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('signup', () => {
    it('calls authService.signup and returns result', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      jest.mocked(authService.signup).mockResolvedValue({
        user: mockUser,
        token: mockToken,
      });

      const result = await controller.signup(dto);

      expect(result).toEqual({ user: mockUser, token: mockToken });
      expect(authService.signup).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('calls authService.login and returns result', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      jest.mocked(authService.login).mockResolvedValue({
        user: mockUser,
        token: mockToken,
      });

      const result = await controller.login(dto);

      expect(result).toEqual({ user: mockUser, token: mockToken });
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('logout', () => {
    it('calls authService.logout with extracted token', async () => {
      jest.mocked(authService.logout).mockResolvedValue(undefined);

      const req = {
        headers: { authorization: 'Bearer token-123' },
        user: mockUser,
      } as unknown as AuthenticatedRequest;

      const result = await controller.logout(req);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith('token-123');
    });

    it('handles missing auth header gracefully', async () => {
      jest.mocked(authService.logout).mockResolvedValue(undefined);

      const req = {
        headers: {},
        user: mockUser,
      } as unknown as AuthenticatedRequest;

      const result = await controller.logout(req);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith('');
    });
  });

  describe('me', () => {
    it('calls authService.getMe with user id from request', async () => {
      jest.mocked(authService.getMe).mockResolvedValue(mockUser);

      const req = { user: { id: 'user-1' } } as unknown as AuthenticatedRequest;

      const result = await controller.me(req);

      expect(result).toEqual(mockUser);
      expect(authService.getMe).toHaveBeenCalledWith('user-1');
    });
  });
});
