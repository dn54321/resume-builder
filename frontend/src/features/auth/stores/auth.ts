import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

interface User {
  id: string
  email: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const authReady = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  /**
   *
   * @param api
   */
  async function importAndClearLocalResume(api: ReturnType<typeof useApi>) {
    const RESUME_KEY = 'resume_data'
    const raw = localStorage.getItem(RESUME_KEY)
    if (!raw) return
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      localStorage.removeItem(RESUME_KEY)
      return
    }
    try {
      await api.post('/api/v1/resumes', data)
      localStorage.removeItem(RESUME_KEY)
    } catch {
      // Keep localStorage data on POST failure so user doesn't lose their resume
    }
  }

  /**
   * Check the current session by calling /api/v1/auth/me.
   * The session token is sent automatically via HttpOnly cookie (credentials: 'include').
   */
  async function checkSession() {
    const api = useApi()
    try {
      const response = await api.get<{ user: User }>('/api/v1/auth/me')
      user.value = response.user
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        user.value = null
      }
    } finally {
      authReady.value = true
    }
  }

  /**
   *
   * @param email
   * @param password
   */
  async function login(email: string, password: string) {
    const api = useApi()
    const response = await api.post<{ user: User }>(
      '/api/v1/auth/login',
      { email, password },
    )

    user.value = response.user

    // Anonymous-to-authenticated: import resume data
    await importAndClearLocalResume(api)
  }

  /**
   *
   * @param email
   * @param password
   */
  async function signup(email: string, password: string) {
    const api = useApi()
    const response = await api.post<{ user: User }>(
      '/api/v1/auth/signup',
      { email, password },
    )

    user.value = response.user

    // Anonymous-to-authenticated: import resume data
    await importAndClearLocalResume(api)
  }

  /**
   * Log out the current user. Calls the API to clear the cookie,
   * then clears local user state.
   */
  async function logout() {
    const api = useApi()
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Logout should always clear locally even if API fails
    }
    user.value = null
  }

  return {
    user,
    isAuthenticated,
    authReady,
    signup,
    login,
    logout,
    checkSession,
  }
})
