import type { Request } from 'express';
import type { User } from '../../generated/prisma/client';

export interface AuthenticatedRequest extends Request {
  user: User;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
}
