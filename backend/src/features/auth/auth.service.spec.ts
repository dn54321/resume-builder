/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/database/prisma.service';

// Mock bcrypt
jest.mock('bcrypt');
const mockBcrypt = bcrypt as jest.Mocked<typeof import('bcrypt')>;

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  session: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('signup', () => {
    const dto = { email: 'test@example.com', password: 'password123' };

    it('creates a user and returns user + token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        password: 'hashed-pw',
        createdAt: new Date(),
      });
      mockPrismaService.session.create.mockResolvedValue({
        id: 'session-1',
        token: 'hashed-token',
        userId: 'user-1',
        createdAt: new Date(),
      });
      mockBcrypt.hash.mockResolvedValue('hashed-pw' as never);

      const result = await service.signup(dto);

      expect(result).toHaveProperty('token');
      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');

      expect(result.user).toEqual({
        id: 'user-1',
        email: dto.email,
        createdAt: expect.any(Date),
      });
      expect(result.user).not.toHaveProperty('password');
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);

      expect(mockPrismaService.session.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          token: expect.any(String),
        },
      });
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing',
        email: dto.email,
        password: 'pw',
        createdAt: new Date(),
      });

      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password123' };

    it('returns user + token when credentials are valid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        password: 'hashed-pw',
        createdAt: new Date(),
      });
      mockPrismaService.session.create.mockResolvedValue({
        id: 'session-1',
        token: 'hashed-token',
        userId: 'user-1',
        createdAt: new Date(),
      });
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.login(dto);

      expect(result).toHaveProperty('token');

      expect(result.user).toEqual({
        id: 'user-1',
        email: dto.email,
        createdAt: expect.any(Date),
      });
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        password: 'hashed-pw',
        createdAt: new Date(),
      });
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('calls deleteMany with hashed token', async () => {
      const token = 'raw-token';
      const expectedHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      mockPrismaService.session.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout(token);

      expect(mockPrismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { token: expectedHash },
      });
    });
  });

  describe('validateSession', () => {
    it('returns user when session is valid', async () => {
      const token = 'valid-token';
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      mockPrismaService.session.findUnique.mockResolvedValue({
        id: 'session-1',
        token: hashedToken,
        userId: 'user-1',
        createdAt: new Date(),
        user: {
          id: 'user-1',
          email: 'test@example.com',
          password: 'hashed-pw',
          createdAt: new Date(),
        },
      });

      const user = await service.validateSession(token);

      expect(user.id).toBe('user-1');
      expect(user.email).toBe('test@example.com');
      expect(mockPrismaService.session.findUnique).toHaveBeenCalledWith({
        where: { token: hashedToken },
        include: { user: true },
      });
    });

    it('throws UnauthorizedException when session not found', async () => {
      mockPrismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.validateSession('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getMe', () => {
    it('returns user without password', async () => {
      mockPrismaService.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-pw',
        createdAt: new Date(),
      });

      const result = await service.getMe('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        createdAt: expect.any(Date),
      });
      expect(result).not.toHaveProperty('password');
    });
  });
});
