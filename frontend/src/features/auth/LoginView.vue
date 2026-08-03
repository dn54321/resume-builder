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
import SvgIllustration from '@/components/SvgIllustration.vue'
import blob1Raw from '@/assets/illustrations/decorative/blob-1.svg?raw'
import blob2Raw from '@/assets/illustrations/decorative/blob-2.svg?raw'
import blob3Raw from '@/assets/illustrations/decorative/blob-3.svg?raw'
import waveDividerRaw from '@/assets/illustrations/decorative/wave-divider.svg?raw'
import dotPatternRaw from '@/assets/illustrations/decorative/dot-pattern.svg?raw'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, login } = useAuth()

const email = ref('')
const password = ref('')
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
      errors.value.push('An unexpected error occurred. Please try again.')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="relative min-h-screen overflow-hidden">
    <!-- Decorative blobs behind the card -->
    <div
      class="absolute top-0 right-0 w-[500px] h-[500px] opacity-60 pointer-events-none"
      aria-hidden="true"
    >
      <SvgIllustration :svg="blob1Raw" class="absolute -top-20 -right-10 w-full h-full" />
    </div>
    <div
      class="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-50 pointer-events-none"
      aria-hidden="true"
    >
      <SvgIllustration :svg="blob2Raw" class="absolute -bottom-20 -left-10 w-full h-full" />
    </div>
    <div
      class="absolute top-1/3 left-1/4 w-[300px] h-[300px] opacity-30 pointer-events-none"
      aria-hidden="true"
    >
      <SvgIllustration :svg="blob3Raw" class="w-full h-full" />
    </div>

    <!-- Dot pattern accents -->
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <SvgIllustration :svg="dotPatternRaw" class="absolute top-16 right-32 w-6 h-6 opacity-20" />
      <SvgIllustration :svg="dotPatternRaw" class="absolute bottom-32 left-20 w-6 h-6 opacity-20" />
      <SvgIllustration :svg="dotPatternRaw" class="absolute top-1/2 right-16 w-6 h-6 opacity-15" />
    </div>

    <!-- Wave divider at bottom -->
    <div class="absolute bottom-0 left-0 right-0 h-16 overflow-hidden pointer-events-none" aria-hidden="true">
      <SvgIllustration :svg="waveDividerRaw" class="absolute inset-0 w-full h-full opacity-30" />
    </div>

    <!-- Card -->
    <div class="flex min-h-screen items-center justify-center px-4">
      <Card class="w-full max-w-md relative z-10">
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
                  @blur="onEmailBlur"
                />
                <p v-if="emailError" class="text-sm text-destructive">{{ emailError }}</p>
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
  </div>
</template>
