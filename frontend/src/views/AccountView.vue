<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/features/auth/composables/useAuth';
import { useApi, ApiRequestError } from '@/shared/composables/useApi';

const router = useRouter();
const { user, logout } = useAuth();
const api = useApi();

// --- Change Password ---
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const changePasswordError = ref('');
const changePasswordSuccess = ref(false);
const isChangingPassword = ref(false);

/**
 *
 */
async function handleChangePassword(): Promise<void> {
  changePasswordError.value = '';
  changePasswordSuccess.value = false;

  if (newPassword.value !== confirmNewPassword.value) {
    changePasswordError.value = 'New passwords do not match';
    return;
  }

  if (newPassword.value.length < 8) {
    changePasswordError.value = 'Password must be at least 8 characters';
    return;
  }

  isChangingPassword.value = true;

  try {
    await api.post('/api/v1/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });

    changePasswordSuccess.value = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';

    // Session was invalidated — log the user out
    setTimeout(() => {
      logout();
      router.push({ name: 'login' });
    }, 2000);
  } catch (err) {
    if (err instanceof ApiRequestError) {
      changePasswordError.value = err.message;
    } else {
      changePasswordError.value = 'Something went wrong';
    }
  } finally {
    isChangingPassword.value = false;
  }
}

// --- Delete Account ---
const deletePassword = ref('');
const deleteConfirmText = ref('');
const deleteError = ref('');
const isDeleting = ref(false);

const deleteConfirmationText = computed(() => 'delete my account');

/**
 *
 */
async function handleDeleteAccount(): Promise<void> {
  deleteError.value = '';

  if (deleteConfirmText.value !== deleteConfirmationText.value) {
    deleteError.value = `Type "${deleteConfirmationText.value}" to confirm`;
    return;
  }

  isDeleting.value = true;

  try {
    await api.del('/api/v1/auth/account', {
      password: deletePassword.value,
    });

    logout();
    router.push({ name: 'home' });
  } catch (err) {
    if (err instanceof ApiRequestError) {
      deleteError.value = err.message;
    } else {
      deleteError.value = 'Something went wrong';
    }
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="account-view">
    <h1>Account</h1>

    <section class="account-section">
      <h2>Account Info</h2>
      <p><strong>Email:</strong> {{ user?.email }}</p>
    </section>

    <section class="account-section">
      <h2>Change Password</h2>
      <form
        v-if="!changePasswordSuccess"
        @submit.prevent="handleChangePassword"
        class="account-form"
      >
        <div class="form-field">
          <label for="current-password">Current Password</label>
          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            required
            autocomplete="current-password"
          />
        </div>
        <div class="form-field">
          <label for="new-password">New Password</label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
          />
        </div>
        <div class="form-field">
          <label for="confirm-new-password">Confirm New Password</label>
          <input
            id="confirm-new-password"
            v-model="confirmNewPassword"
            type="password"
            required
            autocomplete="new-password"
          />
        </div>
        <p v-if="changePasswordError" class="error-message">
          {{ changePasswordError }}
        </p>
        <button type="submit" :disabled="isChangingPassword">
          {{ isChangingPassword ? 'Updating...' : 'Change Password' }}
        </button>
      </form>
      <p v-else class="success-message">
        Password changed successfully. Redirecting to login...
      </p>
    </section>

    <section class="account-section danger-zone">
      <h2>Delete Account</h2>
      <p class="warning-text">
        This permanently deletes your account and all associated data
        (resumes, sections, entries). This action cannot be undone.
      </p>
      <form @submit.prevent="handleDeleteAccount" class="account-form">
        <div class="form-field">
          <label for="delete-password">Confirm your password</label>
          <input
            id="delete-password"
            v-model="deletePassword"
            type="password"
            required
            autocomplete="current-password"
          />
        </div>
        <div class="form-field">
          <label for="delete-confirm">
            Type <code>delete my account</code> to confirm
          </label>
          <input
            id="delete-confirm"
            v-model="deleteConfirmText"
            type="text"
            required
            autocomplete="off"
          />
        </div>
        <p v-if="deleteError" class="error-message">{{ deleteError }}</p>
        <button
          type="submit"
          class="danger-button"
          :disabled="isDeleting"
        >
          {{ isDeleting ? 'Deleting...' : 'Delete My Account' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.account-view {
  max-width: 500px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.account-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.account-section h2 {
  margin-top: 0;
  font-size: 1.25rem;
}

.account-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
}

.form-field input {
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.form-field code {
  font-size: 0.875rem;
  background: var(--color-background-soft);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.error-message {
  color: #d32f2f;
  font-size: 0.875rem;
}

.success-message {
  color: #2e7d32;
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

.danger-zone {
  border-color: #d32f2f;
}

.danger-zone h2 {
  color: #d32f2f;
}

.warning-text {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 1rem;
}

.danger-button {
  background-color: #d32f2f;
  color: white;
}
</style>
