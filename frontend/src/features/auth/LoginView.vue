<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { ApiRequestError } from '@/shared/composables/useApi'

const router = useRouter()
const { isAuthenticated, login } = useAuth()

const email = ref('')
const password = ref('')
const errors = ref<string[]>([])
const submitting = ref(false)

const hasErrors = computed(() => errors.value.length > 0)

onMounted(() => {
  if (isAuthenticated) {
    router.replace('/builder')
  }
})

/**
 *
 */
async function handleSubmit() {
  errors.value = []

  if (!email.value.trim()) {
    errors.value.push('Email is required')
  }
  if (!password.value) {
    errors.value.push('Password is required')
  }
  if (errors.value.length > 0) return

  submitting.value = true
  try {
    await login(email.value, password.value)
    router.replace('/builder')
  } catch (err) {
    if (err instanceof ApiRequestError) {
      if (err.errors) {
        // Collect field-level validation errors
        for (const [, msgs] of Object.entries(err.errors)) {
          errors.value.push(...msgs)
        }
      } else {
        errors.value.push(err.message)
      }
    } else {
      errors.value.push('Something went wrong. Please try again.')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Login</h1>
    <form @submit.prevent="handleSubmit" novalidate>
      <div class="form-group">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="submitting"
        />
      </div>

      <div class="form-group">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :disabled="submitting"
        />
      </div>

      <div v-if="hasErrors" class="errors" role="alert">
        <p v-for="(msg, i) in errors" :key="i">{{ msg }}</p>
      </div>

      <button type="submit" :disabled="submitting">
        {{ submitting ? 'Logging in...' : 'Login' }}
      </button>
    </form>

    <p class="switch-link">
      Don't have an account?
      <RouterLink to="/signup">Sign up</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.auth-view {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

h1 {
  text-align: center;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 1rem;
}

input:disabled {
  opacity: 0.6;
}

.errors {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.errors p {
  margin: 0;
}

.errors p + p {
  margin-top: 0.25rem;
}

button {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-text);
  color: var(--color-background);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch-link {
  text-align: center;
  margin-top: 1.5rem;
}
</style>
