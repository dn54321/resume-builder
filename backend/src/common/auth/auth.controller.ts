import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

const COOKIE_NAME = 'session_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body() signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: { id: string; email: string } }> {
    const result = await this.authService.signup(
      signupDto.email,
      signupDto.password,
    );
    this.setSessionCookie(res, result.sessionToken);
    return { user: result.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: { id: string; email: string } }> {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    this.setSessionCookie(res, result.sessionToken);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const sessionToken = this.extractSessionToken(req);
    if (sessionToken) {
      await this.authService.logout(sessionToken);
    }
    this.clearSessionCookie(res);
  }

  @Get('me')
  async me(@Req() req: Request): Promise<{
    user: { id: string; email: string } | null;
  }> {
    const sessionToken = this.extractSessionToken(req);
    if (!sessionToken) {
      return { user: null };
    }
    const result = await this.authService.validateSession(sessionToken);
    return { user: result?.user ?? null };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() req: Request,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const sessionToken = this.extractSessionToken(req);
    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.authService.validateSession(sessionToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    await this.authService.changePassword(
      result.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    // All sessions are invalidated by changePassword — client must re-authenticate.
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Req() req: Request,
    @Body() deleteAccountDto: DeleteAccountDto,
  ): Promise<void> {
    const sessionToken = this.extractSessionToken(req);
    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.authService.validateSession(sessionToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    await this.authService.deleteAccount(
      result.user.id,
      deleteAccountDto.password,
    );
  }

  private extractSessionToken(req: Request): string | null {
    const token: string | undefined = req.cookies?.[COOKIE_NAME] as
      string | undefined;
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
    return null;
  }

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }
}
