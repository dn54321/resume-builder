<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { ApiRequestError } from '@/shared/composables/useApi'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const router = useRouter()
const { isAuthenticated, signup } = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errors = ref<string[]>([])
const emailError = ref('')
const submitting = ref(false)

const hasErrors = computed(() => errors.value.length > 0)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 *
 */
function onEmailBlur() {
  if (email.value.trim() && !EMAIL_RE.test(email.value)) {
    emailError.value = 'Please enter a valid email address'
  } else {
    emailError.value = ''
  }
}

onMounted(() => {
  if (isAuthenticated) {
    router.replace('/builder')
  }
})

/**
 *
 */
function validate(): boolean {
  errors.value = []

  if (!email.value.trim()) {
    errors.value.push('Email is required')
  } else if (!EMAIL_RE.test(email.value)) {
    errors.value.push('Please enter a valid email address')
  }
  if (!password.value) {
    errors.value.push('Password is required')
  } else if (password.value.length < 8) {
    errors.value.push('Password must be at least 8 characters')
  }
  if (password.value !== confirmPassword.value) {
    errors.value.push('Passwords do not match')
  }

  return errors.value.length === 0
}

/**
 *
 */
async function handleSubmit() {
  if (!validate()) return

  submitting.value = true
  try {
    await signup(email.value, password.value)
    router.replace('/builder')
  } catch (err) {
    if (err instanceof ApiRequestError) {
      if (err.errors) {
        for (const [, msgs] of Object.entries(err.errors)) {
          errors.value.push(...msgs)
        }
      } else {
        errors.value.push(err.message)
      }
    } else {
      errors.value.push('An unexpected error occurred. Please try again.')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit" novalidate>
          <div class="grid gap-4">
            <div class="grid gap-2">
              <Label for="signup-email">Email</Label>
              <Input
                id="signup-email"
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="you@example.com"
                :disabled="submitting"
                @blur="onEmailBlur"
              />
              <p v-if="emailError" class="text-sm text-destructive">{{ emailError }}</p>
            </div>
            <div class="grid gap-2">
              <Label for="signup-password">Password</Label>
              <Input
                id="signup-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                :disabled="submitting"
              />
            </div>
            <div class="grid gap-2">
              <Label for="signup-confirm">Confirm password</Label>
              <Input
                id="signup-confirm"
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                :disabled="submitting"
              />
            </div>

            <Alert v-if="hasErrors" variant="destructive">
              <AlertTitle>Signup failed</AlertTitle>
              <AlertDescription>
                <ul class="list-disc pl-4 m-0">
                  <li v-for="(error, i) in errors" :key="i">{{ error }}</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button type="submit" :disabled="submitting" class="w-full">
              {{ submitting ? 'Creating account...' : 'Sign up' }}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter class="justify-center">
        <p class="text-sm text-muted-foreground">
          Already have an account?
          <RouterLink to="/login" class="text-primary hover:underline">Log in</RouterLink>
        </p>
      </CardFooter>
    </Card>
  </div>
</template>
