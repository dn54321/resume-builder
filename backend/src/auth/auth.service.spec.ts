jest.mock('../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let mockCrypto: {
    generateSessionToken: jest.Mock;
    hashToken: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    mockCrypto = {
      generateSessionToken: jest.fn(),
      hashToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CryptoService, useValue: mockCrypto },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('creates a user and returns a session token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });
      mockCrypto.generateSessionToken.mockReturnValue('raw-session-token');
      mockCrypto.hashToken.mockReturnValue('hashed-session-token');
      mockPrisma.session.create.mockResolvedValue({ id: 'session-1' });

      const result = await authService.signup(
        'test@example.com',
        'password123',
      );

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.id).toBe('user-1');
      expect(result.sessionToken).toBe('raw-session-token');
    });

    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing',
        email: 'test@example.com',
      });

      await expect(
        authService.signup('test@example.com', 'password123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns session token for valid credentials', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(true);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-password',
      });
      mockCrypto.generateSessionToken.mockReturnValue('raw-session-token');
      mockCrypto.hashToken.mockReturnValue('hashed-session-token');
      mockPrisma.session.create.mockResolvedValue({ id: 'session-1' });

      const result = await authService.login('test@example.com', 'password123');

      expect(result.user.email).toBe('test@example.com');
      expect(result.sessionToken).toBe('raw-session-token');
    });

    it('throws UnauthorizedException for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('wrong@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(false);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-password',
      });

      await expect(
        authService.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateSession', () => {
    it('returns user for valid session', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      mockCrypto.hashToken.mockReturnValue('hashed-token');
      mockPrisma.session.findUnique.mockResolvedValue({
        expiresAt: futureDate,
        user: { id: 'user-1', email: 'test@example.com' },
      });

      const result = await authService.validateSession('raw-token');

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com' },
      });
    });

    it('returns null for expired session', async () => {
      const pastDate = new Date(Date.now() - 3600000);
      mockCrypto.hashToken.mockReturnValue('hashed-token');
      mockPrisma.session.findUnique.mockResolvedValue({
        expiresAt: pastDate,
        user: { id: 'user-1', email: 'test@example.com' },
      });

      const result = await authService.validateSession('raw-token');

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('deletes the session', async () => {
      mockCrypto.hashToken.mockReturnValue('hashed-token');
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await authService.logout('raw-token');

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { token: 'hashed-token' },
      });
    });
  });

  describe('changePassword', () => {
    it('updates the password when current password is valid', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(true);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-old-password',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      await authService.changePassword(
        'user-1',
        'old-password',
        'new-password',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { password: 'hashed-password' },
      });
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(false);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-old-password',
      });

      await expect(
        authService.changePassword('user-1', 'wrong-password', 'new-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.changePassword('nonexistent', 'pw', 'new-pw'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteAccount', () => {
    it('deletes the user when password is correct', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(true);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-password',
      });
      mockPrisma.user.delete.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      await authService.deleteAccount('user-1', 'correct-password');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const mockedCompare = compare as jest.Mock;
      mockedCompare.mockResolvedValue(false);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-password',
      });

      await expect(
        authService.deleteAccount('user-1', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.deleteAccount('nonexistent', 'pw'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
