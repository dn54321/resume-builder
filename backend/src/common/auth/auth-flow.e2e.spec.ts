import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException, ConflictException } from '@nestjs/common';

type ResBody = {
  user: { id: string; email: string } | null;
  sessionToken?: string;
  message?: string;
};

const makeUser = (id: string, email: string) => ({ id, email });
const body = (r: request.Response): ResBody => r.body as ResBody;

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
      // 1. Signup
      svc.signup.mockResolvedValueOnce({ user: makeUser(uid, email), sessionToken: t1 });
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email, password: pw })
        .expect(201);
      expect(body(r1).user?.email).toBe(email);
      expect(body(r1).sessionToken).toBe(t1);

      // 2. Me with signup token
      svc.validateSession.mockResolvedValueOnce({ user: makeUser(uid, email), sessionToken: t1 });
      const r2 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t1}`)
        .expect(200);
      expect(body(r2).user?.email).toBe(email);

      // 3. Login (new session)
      svc.login.mockResolvedValueOnce({ user: makeUser(uid, email), sessionToken: t2 });
      const r3 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: pw })
        .expect(200);
      expect(body(r3).sessionToken).toBe(t2);

      // 4. Login token works
      svc.validateSession.mockResolvedValueOnce({ user: makeUser(uid, email), sessionToken: t2 });
      const r4 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t2}`)
        .expect(200);
      expect(body(r4).user?.email).toBe(email);

      // 5. Logout signup session
      svc.logout.mockResolvedValueOnce(undefined);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${t1}`)
        .expect(204);

      // 6. Signup session dead
      svc.validateSession.mockResolvedValueOnce(null);
      const r6 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t1}`)
        .expect(200);
      expect(body(r6).user).toBeNull();

      // 7. Login session still alive
      svc.validateSession.mockResolvedValueOnce({ user: makeUser(uid, email), sessionToken: t2 });
      const r7 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t2}`)
        .expect(200);
      expect(body(r7).user?.email).toBe(email);
    });
  });

  describe('errors', () => {
    it('409 on duplicate signup', async () => {
      svc.signup.mockRejectedValueOnce(new ConflictException('Email already exists'));
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email: 'x@x.com', password: 'Password1!' })
        .expect(409);
      expect(body(r).message).toBe('Email already exists');
    });

    it('401 on bad login', async () => {
      svc.login.mockRejectedValueOnce(new UnauthorizedException('Invalid credentials'));
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
