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
const confirmPassword = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleSignup(): Promise<void> {
  errorMessage.value = '';

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match';
    return;
  }

  isSubmitting.value = true;

  try {
    const { data, error } = await apiRequest<AuthResponse>(
      '/api/v1/auth/signup',
      {
        method: 'POST',
        body: { email: email.value, password: password.value },
      },
    );

    if (error || !data) {
      errorMessage.value = error || 'Signup failed';
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
    <h1>Sign Up</h1>
    <form @submit.prevent="handleSignup" class="auth-form">
      <div class="form-field">
        <label for="signup-email">Email</label>
        <input
          id="signup-email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
        />
      </div>
      <div class="form-field">
        <label for="signup-password">Password</label>
        <input
          id="signup-password"
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
        />
      </div>
      <div class="form-field">
        <label for="signup-confirm-password">Confirm Password</label>
        <input
          id="signup-confirm-password"
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
        />
      </div>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Creating account...' : 'Sign Up' }}
      </button>
    </form>
    <p class="auth-switch">
      Already have an account?
      <RouterLink to="/login">Log in</RouterLink>
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
