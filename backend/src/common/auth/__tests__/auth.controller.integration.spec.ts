jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

interface AuthResponseBody {
  user: { id: string; email: string };
}

interface MeResponseBody {
  user: { id: string; email: string } | null;
}

const COOKIE_NAME = 'session_token';

describe('AuthController (integration)', () => {
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
    app.use(cookieParser());
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
    it('should set session cookie and return user only', async () => {
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
      expect(body).not.toHaveProperty('sessionToken');

      // Verify cookie is set
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const sessionCookie = cookies.find((c) =>
        c.startsWith(`${COOKIE_NAME}=`),
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
    });

    it('should return 400 for missing fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should set session cookie and return user only', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
        sessionToken: 'tok-456',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'Password1' })
        .expect(200);

      const body = res.body as AuthResponseBody;
      expect(body).not.toHaveProperty('sessionToken');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const sessionCookie = cookies.find((c) =>
        c.startsWith(`${COOKIE_NAME}=`),
      );
      expect(sessionCookie).toBeDefined();
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
    it('should clear cookie with valid session', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `${COOKIE_NAME}=valid-token`)
        .expect(204);

      // Verify cookie is cleared (Set-Cookie with empty/expired value)
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) =>
        c.startsWith(`${COOKIE_NAME}=`),
      );
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain(`${COOKIE_NAME}=;`);
    });

    it('should still clear cookie even without session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(204);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) =>
        c.startsWith(`${COOKIE_NAME}=`),
      );
      expect(clearedCookie).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user for valid session cookie', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        user: { id: 'u1', email: 'test@test.com' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=valid-token`)
        .expect(200);

      const body = res.body as MeResponseBody;
      expect(body.user?.email).toBe('test@test.com');
    });

    it('should return null user when no cookie', async () => {
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
        .set('Cookie', `${COOKIE_NAME}=valid-token`)
        .send({ currentPassword: 'old', newPassword: 'NewPass1' })
        .expect(204);
    });

    it('should return 401 without cookie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'NewPass1' })
        .expect(401);
    });

    it('should return 401 for invalid session', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Cookie', `${COOKIE_NAME}=bad-token`)
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
        .set('Cookie', `${COOKIE_NAME}=valid-token`)
        .send({ password: 'Password1' })
        .expect(204);
    });

    it('should return 401 without cookie', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/account')
        .send({ password: 'Password1' })
        .expect(401);
    });

    it('should return 401 for invalid session', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/auth/account')
        .set('Cookie', `${COOKIE_NAME}=bad-token`)
        .send({ password: 'Password1' })
        .expect(401);
    });
  });
});
