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
});
