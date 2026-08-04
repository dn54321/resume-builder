import { useAuthStore } from '@/features/auth/stores/auth'

/**
 *
 */
export function useAuth() {
  const store = useAuthStore()

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    authReady: store.authReady,
    login: store.login,
    signup: store.signup,
    logout: store.logout,
    checkSession: store.checkSession,
  }
}
