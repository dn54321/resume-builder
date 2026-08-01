export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  sessionToken: string;
}

export interface MeResponse {
  user: User | null;
}
