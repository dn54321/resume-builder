jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

interface AuthResponseBody {
  user: { id: string; email: string };
  sessionToken: string;
}

interface MeResponseBody {
  user: { id: string; email: string } | null;
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let mockAuthService: {
    signup: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    validateSession: jest.Mock;
    changePassword: jest.Mock;
    deleteAccount: jest.Mock;
  };

  beforeAll(async () => {
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

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should return user and token on success', async () => {
      mockAuthService.signup.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
        sessionToken: 'tok-123',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email: 'test@test.com', password: 'Password1' })
        .expect(201);

      const body = res.body as AuthResponseBody;
      expect(body.user.email).toBe('test@test.com');
      expect(body.sessionToken).toBe('tok-123');
    });

    it('should return 400 for missing fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return user and token on success', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
        sessionToken: 'tok-456',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'Password1' })
        .expect(200);

      const body = res.body as AuthResponseBody;
      expect(body.sessionToken).toBe('tok-456');
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'bad@test.com', password: 'wrong' })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 204 with valid token', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer valid-token')
        .expect(204);
    });

    it('should return 204 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(204);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user for valid session', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      const body = res.body as MeResponseBody;
      expect(body.user?.email).toBe('test@test.com');
    });

    it('should return null user when no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(200);

      const body = res.body as MeResponseBody;
      expect(body.user).toBeNull();
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('should return 204 on success', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
      });
      mockAuthService.changePassword.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send({ currentPassword: 'old', newPassword: 'NewPass1' })
        .expect(204);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'NewPass1' })
        .expect(401);
    });

    it('should return 401 for invalid session', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer bad-token')
        .send({ currentPassword: 'old', newPassword: 'NewPass1' })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/auth/account', () => {
    it('should return 204 on success', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
      });
      mockAuthService.deleteAccount.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/api/v1/auth/account')
        .set('Authorization', 'Bearer valid-token')
        .send({ password: 'Password1' })
        .expect(204);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/account')
        .send({ password: 'Password1' })
        .expect(401);
    });

    it('should return 401 for invalid session', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/auth/account')
        .set('Authorization', 'Bearer bad-token')
        .send({ password: 'Password1' })
        .expect(401);
    });
  });
});
