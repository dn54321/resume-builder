<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useApi } from '@/composables/useApi';
import type { AuthResponse } from '@/shared/types/auth';

const router = useRouter();
const authStore = useAuthStore();
const { apiRequest } = useApi();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleLogin(): Promise<void> {
  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const { data, error } = await apiRequest<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });

    if (error || !data) {
      errorMessage.value = error || 'Login failed';
      return;
    }

    authStore.setSession(data.user, data.sessionToken);
    router.push({ name: 'home' });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Log In</h1>
    <form @submit.prevent="handleLogin" class="auth-form">
      <div class="form-field">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
        />
      </div>
      <div class="form-field">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Logging in...' : 'Log In' }}
      </button>
    </form>
    <p class="auth-switch">
      Don't have an account?
      <RouterLink to="/signup">Sign up</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.auth-view {
  max-width: 400px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-field input {
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.error-message {
  color: #d32f2f;
  font-size: 0.875rem;
}

button {
  padding: 0.625rem 1rem;
  font-size: 1rem;
  cursor: pointer;
  border: none;
  border-radius: 4px;
  background-color: var(--color-text);
  color: var(--color-background);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-switch {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.875rem;
}
</style>
