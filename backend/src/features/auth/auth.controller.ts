import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import type { AuthenticatedRequest, AuthResponse } from './auth.types';
import type { User } from '../../generated/prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthenticatedRequest): Promise<{ message: string }> {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    await this.authService.logout(token);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<Omit<User, 'password'>> {
    return this.authService.getMe(req.user.id);
  }
}
