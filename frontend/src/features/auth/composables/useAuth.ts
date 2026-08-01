import { useAuthStore } from '@/features/auth/stores/auth'

/**
 *
 */
export function useAuth() {
  const store = useAuthStore()

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    getToken: store.getToken,
    login: store.login,
    signup: store.signup,
    logout: store.logout,
    checkSession: store.checkSession,
  }
}
