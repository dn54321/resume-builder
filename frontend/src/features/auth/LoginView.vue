<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { ApiRequestError } from '@/shared/composables/useApi'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, login } = useAuth()

const email = ref('')
const password = ref('')
const errors = ref<string[]>([])
const submitting = ref(false)

const hasErrors = computed(() => errors.value.length > 0)

onMounted(() => {
  if (isAuthenticated) {
    router.replace('/dashboard')
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
    const redirect = route.query.redirect
    if (typeof redirect === 'string') {
      router.replace(redirect)
    } else {
      router.replace('/dashboard')
    }
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
  <div class="flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit" novalidate>
          <div class="grid gap-4">
            <div class="grid gap-2">
              <Label for="login-email">Email</Label>
              <Input
                id="login-email"
                v-model="email"
                type="email"
                autocomplete="email"
                :disabled="submitting"
              />
            </div>

            <div class="grid gap-2">
              <Label for="login-password">Password</Label>
              <Input
                id="login-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                :disabled="submitting"
              />
            </div>

            <Alert v-if="hasErrors" variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                <p v-for="(msg, i) in errors" :key="i">{{ msg }}</p>
              </AlertDescription>
            </Alert>

            <Button type="submit" :disabled="submitting" class="w-full">
              {{ submitting ? 'Logging in...' : 'Login' }}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter class="justify-center">
        <p class="text-sm text-muted-foreground">
          Don't have an account?
          <RouterLink to="/signup" class="underline underline-offset-4 hover:text-primary">Sign up</RouterLink>
        </p>
      </CardFooter>
    </Card>
  </div>
</template>
