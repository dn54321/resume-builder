import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UnauthorizedException, ConflictException } from '@nestjs/common';

type ResBody = {
  user: { id: string; email: string } | null;
  sessionToken?: string;
  message?: string;
};

const COOKIE_NAME = 'session_token';
const makeUser = (id: string, email: string) => ({ id, email });
const body = (r: request.Response): ResBody => r.body as ResBody;

/**
 * Extract the session_token value from a Set-Cookie header array.
 * @param cookies
 */
function getCookieValue(cookies: string[]): string | null {
  const sessionCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!sessionCookie) return null;
  const match = /^session_token=([^;]+)/.exec(sessionCookie);
  return match ? match[1] : null;
}

describe('Auth Flow (integration)', () => {
  let app: INestApplication<App>;
  let svc: {
    signup: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    validateSession: jest.Mock;
  };

  beforeAll(async () => {
    svc = {
      signup: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      validateSession: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: svc }],
    }).compile();

    app = mod.createNestApplication();
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

  afterAll(() => app.close());

  describe('full lifecycle', () => {
    const email = 'flow@test.com';
    const pw = 'FlowPass1!';
    const uid = 'u-flow-1';
    const t1 = 'tok-1-abc';
    const t2 = 'tok-2-xyz';

    it('signup → verify → login → verify → logout → verify dead', async () => {
      // 1. Signup — returns user in body, token in cookie
      svc.signup.mockResolvedValueOnce({
        user: makeUser(uid, email),
        sessionToken: t1,
      });
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email, password: pw })
        .expect(201);
      expect(body(r1).user?.email).toBe(email);
      expect(body(r1)).not.toHaveProperty('sessionToken');
      const cookies1 = r1.headers['set-cookie'] as unknown as string[];
      expect(getCookieValue(cookies1)).toBe(t1);

      // 2. Me with signup cookie
      svc.validateSession.mockResolvedValueOnce({
        user: makeUser(uid, email),
        sessionToken: t1,
      });
      const r2 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${t1}`)
        .expect(200);
      expect(body(r2).user?.email).toBe(email);

      // 3. Login (new session)
      svc.login.mockResolvedValueOnce({
        user: makeUser(uid, email),
        sessionToken: t2,
      });
      const r3 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: pw })
        .expect(200);
      expect(body(r3)).not.toHaveProperty('sessionToken');
      const cookies3 = r3.headers['set-cookie'] as unknown as string[];
      expect(getCookieValue(cookies3)).toBe(t2);

      // 4. Login cookie works
      svc.validateSession.mockResolvedValueOnce({
        user: makeUser(uid, email),
        sessionToken: t2,
      });
      const r4 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${t2}`)
        .expect(200);
      expect(body(r4).user?.email).toBe(email);

      // 5. Logout signup session — clears cookie
      svc.logout.mockResolvedValueOnce(undefined);
      const r5 = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `${COOKIE_NAME}=${t1}`)
        .expect(204);
      const cookies5 = r5.headers['set-cookie'] as unknown as string[];
      // Should clear (empty value)
      const clearedCookie = cookies5.find((c) =>
        c.startsWith(`${COOKIE_NAME}=`),
      );
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain(`${COOKIE_NAME}=;`);

      // 6. Signup session dead
      svc.validateSession.mockResolvedValueOnce(null);
      const r6 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${t1}`)
        .expect(200);
      expect(body(r6).user).toBeNull();

      // 7. Login session still alive
      svc.validateSession.mockResolvedValueOnce({
        user: makeUser(uid, email),
        sessionToken: t2,
      });
      const r7 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${t2}`)
        .expect(200);
      expect(body(r7).user?.email).toBe(email);
    });
  });

  describe('errors', () => {
    it('409 on duplicate signup', async () => {
      svc.signup.mockRejectedValueOnce(
        new ConflictException('Email already exists'),
      );
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email: 'x@x.com', password: 'Password1!' })
        .expect(409);
      expect(body(r).message).toBe('Email already exists');
    });

    it('401 on bad login', async () => {
      svc.login.mockRejectedValueOnce(
        new UnauthorizedException('Invalid credentials'),
      );
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'x@x.com', password: 'WrongPass1!' })
        .expect(401);
      expect(body(r).message).toBe('Invalid credentials');
    });

    it('400 on short password', async () => {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email: 'x@x.com', password: '12' })
        .expect(400);
      expect(body(r).message).toBeDefined();
    });

    it('400 on missing email', async () => {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ password: 'Password1!' })
        .expect(400);
      expect(body(r).message).toBeDefined();
    });
  });
});
