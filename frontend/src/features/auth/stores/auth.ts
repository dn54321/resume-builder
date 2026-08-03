import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

interface User {
  id: string
  email: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const authReady = ref(false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  /**
   *
   * @param t
   */
  function persistToken(t: string) {
    token.value = t
    localStorage.setItem('auth_token', t)
  }

  /**
   *
   */
  function clearToken() {
    token.value = null
    localStorage.removeItem('auth_token')
  }

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
   *
   */
  async function checkSession() {
    if (!token.value) {
      authReady.value = true
      return
    }

    const api = useApi()
    try {
      const response = await api.get<{ user: User }>('/api/v1/auth/me')
      user.value = response.user
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        clearToken()
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
    const response = await api.post<{ user: User; sessionToken: string }>(
      '/api/v1/auth/login',
      { email, password },
    )

    persistToken(response.sessionToken)
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
    const response = await api.post<{ user: User; sessionToken: string }>(
      '/api/v1/auth/signup',
      { email, password },
    )

    persistToken(response.sessionToken)
    user.value = response.user

    // Anonymous-to-authenticated: import resume data
    await importAndClearLocalResume(api)
  }

  /**
   *
   */
  async function logout() {
    if (token.value) {
      const api = useApi()
      try {
        await api.post('/api/v1/auth/logout')
      } catch {
        // Logout should always clear locally even if API fails
      }
    }
    clearToken()
    user.value = null
  }

  /**
   *
   */
  function getToken(): string | null {
    return token.value
  }

  return {
    user,
    token,
    isAuthenticated,
    authReady,
    getToken,
    signup,
    login,
    logout,
    checkSession,
  }
})
