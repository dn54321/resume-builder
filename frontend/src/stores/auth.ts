import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { User } from '@/shared/types/auth';

const SESSION_TOKEN_KEY = 'session_token';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const sessionToken = ref<string | null>(
    localStorage.getItem(SESSION_TOKEN_KEY),
  );
  const isLoading = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  function setSession(userData: User, token: string): void {
    user.value = userData;
    sessionToken.value = token;
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }

  function clearSession(): void {
    user.value = null;
    sessionToken.value = null;
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }

  async function checkSession(apiBaseUrl: string): Promise<void> {
    const token = sessionToken.value;
    if (!token) {
      return;
    }

    isLoading.value = true;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        clearSession();
        return;
      }
      const data = (await response.json()) as { user: User | null };
      if (data.user) {
        user.value = data.user;
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      isLoading.value = false;
    }
  }

  return {
    user,
    sessionToken,
    isLoading,
    isAuthenticated,
    setSession,
    clearSession,
    checkSession,
  };
});
