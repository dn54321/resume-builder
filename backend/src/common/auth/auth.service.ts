import {
  Inject,
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  async signup(
    email: string,
    password: string,
  ): Promise<{ user: { id: string; email: string }; sessionToken: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await hash(password, 12);
    const user = await this.prisma.user.create({
      data: { email, password: hashedPassword },
    });

    const { sessionToken } = await this.createSession(user.id);

    return { user: { id: user.id, email: user.email }, sessionToken };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: { id: string; email: string }; sessionToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { sessionToken } = await this.createSession(user.id);

    return { user: { id: user.id, email: user.email }, sessionToken };
  }

  async logout(sessionToken: string): Promise<void> {
    const hashedToken = this.crypto.hashToken(sessionToken);
    await this.prisma.session.deleteMany({ where: { token: hashedToken } });
  }

  async validateSession(sessionToken: string): Promise<{
    user: { id: string; email: string };
  } | null> {
    const hashedToken = this.crypto.hashToken(sessionToken);
    const session = await this.prisma.session.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return { user: { id: session.user.id, email: session.user.email } };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate all sessions — user must re-authenticate
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password is incorrect');
    }

    // Cascade delete handles sessions, resumes, and all nested data
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async createSession(
    userId: string,
  ): Promise<{ sessionToken: string }> {
    const sessionToken = this.crypto.generateSessionToken();
    const hashedToken = this.crypto.hashToken(sessionToken);

    await this.prisma.session.create({
      data: {
        token: hashedToken,
        userId,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return { sessionToken };
  }
}
