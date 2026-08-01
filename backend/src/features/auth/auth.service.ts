import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { AuthResponse } from './auth.types';

const SALT_ROUNDS = 12;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
      },
    });

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: hashedToken,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token: rawToken };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: hashedToken,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token: rawToken };
  }

  async logout(rawToken: string): Promise<void> {
    const hashedToken = hashToken(rawToken);

    await this.prisma.session.deleteMany({
      where: { token: hashedToken },
    });
  }

  async validateSession(rawToken: string) {
    const hashedToken = hashToken(rawToken);

    const session = await this.prisma.session.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return session.user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
