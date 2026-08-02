import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

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

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Headers('authorization') authorization: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const sessionToken = this.extractSessionToken(authorization);
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
    @Headers('authorization') authorization: string,
    @Body() deleteAccountDto: DeleteAccountDto,
  ): Promise<void> {
    const sessionToken = this.extractSessionToken(authorization);
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
