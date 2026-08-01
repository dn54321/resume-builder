import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto): Promise<{
    user: { id: string; email: string };
    sessionToken: string;
  }> {
    return this.authService.signup(signupDto.email, signupDto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<{
    user: { id: string; email: string };
    sessionToken: string;
  }> {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Headers('authorization') authorization: string): Promise<void> {
    const sessionToken = this.extractSessionToken(authorization);
    if (sessionToken) {
      await this.authService.logout(sessionToken);
    }
  }

  @Get('me')
  async me(@Headers('authorization') authorization: string): Promise<{
    user: { id: string; email: string } | null;
  }> {
    const sessionToken = this.extractSessionToken(authorization);
    if (!sessionToken) {
      return { user: null };
    }
    const result = await this.authService.validateSession(sessionToken);
    return { user: result?.user ?? null };
  }

  private extractSessionToken(
    authorization: string | undefined,
  ): string | null {
    if (!authorization) {
      return null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1] : null;
  }
}
