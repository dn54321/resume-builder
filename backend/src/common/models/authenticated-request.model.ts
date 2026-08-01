/**
 * Express request augmented with the authenticated user payload set by AuthGuard.
 */
export interface AuthenticatedRequest {
  user: { id: string; email: string };
}
