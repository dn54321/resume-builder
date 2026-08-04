import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/features/auth/stores/auth'

/**
 * Auth composable.
 *
 * Uses storeToRefs to preserve reactivity of state properties.
 * Pinia setup stores unwrap refs when accessed as store.xxx,
 * so destructuring without storeToRefs returns plain values
 * that never update in templates.
 */
export function useAuth() {
  const store = useAuthStore()
  const { user, isAuthenticated, authReady } = storeToRefs(store)

  return {
    user,
    isAuthenticated,
    authReady,
    login: store.login,
    signup: store.signup,
    logout: store.logout,
    checkSession: store.checkSession,
  }
}
