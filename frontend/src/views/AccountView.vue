<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const router = useRouter()
const { user, logout } = useAuth()
const api = useApi()

// --- Change Password ---
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const changePasswordError = ref('')
const changePasswordSuccess = ref(false)
const isChangingPassword = ref(false)

/**
 *
 */
async function handleChangePassword(): Promise<void> {
  changePasswordError.value = ''
  changePasswordSuccess.value = false

  if (newPassword.value !== confirmNewPassword.value) {
    changePasswordError.value = 'New passwords do not match'
    return
  }

  if (newPassword.value.length < 8) {
    changePasswordError.value = 'Password must be at least 8 characters'
    return
  }

  isChangingPassword.value = true

  try {
    await api.post('/api/v1/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })

    changePasswordSuccess.value = true
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''

    // Session was invalidated — log the user out
    setTimeout(() => {
      logout()
      router.push({ name: 'login' })
    }, 2000)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      changePasswordError.value = err.message
    } else {
      changePasswordError.value = 'Something went wrong'
    }
  } finally {
    isChangingPassword.value = false
  }
}

// --- Delete Account ---
const deletePassword = ref('')
const deleteConfirmText = ref('')
const deleteError = ref('')
const isDeleting = ref(false)

const deleteConfirmationText = computed(() => 'delete my account')

/**
 *
 */
async function handleDeleteAccount(): Promise<void> {
  deleteError.value = ''

  if (deleteConfirmText.value !== deleteConfirmationText.value) {
    deleteError.value = `Type "${deleteConfirmationText.value}" to confirm`
    return
  }

  isDeleting.value = true

  try {
    await api.del('/api/v1/auth/account', {
      password: deletePassword.value,
    })

    logout()
    router.push({ name: 'home' })
  } catch (err) {
    if (err instanceof ApiRequestError) {
      deleteError.value = err.message
    } else {
      deleteError.value = 'Something went wrong'
    }
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 px-4 py-8">
    <!-- Account Info Card -->
    <Card>
      <CardHeader>
        <CardTitle>Account Info</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-1">
          <Label>Email</Label>
          <p class="text-sm text-muted-foreground">{{ user?.email }}</p>
        </div>
      </CardContent>
    </Card>

    <!-- Change Password Card -->
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          v-if="!changePasswordSuccess"
          @submit.prevent="handleChangePassword"
          class="space-y-4"
        >
          <div class="space-y-2">
            <Label for="current-password">Current Password</Label>
            <Input
              id="current-password"
              v-model="currentPassword"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <div class="space-y-2">
            <Label for="new-password">New Password</Label>
            <Input
              id="new-password"
              v-model="newPassword"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
            />
          </div>
          <div class="space-y-2">
            <Label for="confirm-new-password">Confirm New Password</Label>
            <Input
              id="confirm-new-password"
              v-model="confirmNewPassword"
              type="password"
              required
              autocomplete="new-password"
            />
          </div>

          <Alert v-if="changePasswordError" variant="destructive">
            <AlertDescription>{{ changePasswordError }}</AlertDescription>
          </Alert>

          <Button type="submit" :disabled="isChangingPassword" class="w-full">
            {{ isChangingPassword ? 'Updating...' : 'Change Password' }}
          </Button>
        </form>

        <Alert
          v-else
          class="border-green-500 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          <AlertDescription>
            Password changed successfully. Redirecting to login...
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>

    <!-- Delete Account Card -->
    <Card class="border-destructive">
      <CardHeader>
        <CardTitle class="text-destructive">Delete Account</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="mb-4 text-sm text-muted-foreground">
          This permanently deletes your account and all associated data
          (resumes, sections, entries). This action cannot be undone.
        </p>

        <form @submit.prevent="handleDeleteAccount" class="space-y-4">
          <div class="space-y-2">
            <Label for="delete-password">Confirm your password</Label>
            <Input
              id="delete-password"
              v-model="deletePassword"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <div class="space-y-2">
            <Label for="delete-confirm">
              Type <code class="rounded bg-muted px-1 py-0.5 text-xs font-semibold">delete my account</code> to confirm
            </Label>
            <Input
              id="delete-confirm"
              v-model="deleteConfirmText"
              type="text"
              required
              autocomplete="off"
            />
          </div>

          <Alert v-if="deleteError" variant="destructive">
            <AlertDescription>{{ deleteError }}</AlertDescription>
          </Alert>

          <Button
            type="submit"
            variant="destructive"
            :disabled="isDeleting"
            class="w-full"
          >
            {{ isDeleting ? 'Deleting...' : 'Delete My Account' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
