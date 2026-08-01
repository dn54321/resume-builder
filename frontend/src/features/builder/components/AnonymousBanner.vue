<template>
  <div v-if="visible" class="anonymous-banner">
    <div class="anonymous-banner__content">
      <span class="anonymous-banner__icon">&#9888;</span>
      <span class="anonymous-banner__text">
        You are not signed in. Your resume is saved only in this browser.
        <RouterLink to="/signup" class="anonymous-banner__link">Sign Up</RouterLink>
        or
        <RouterLink to="/login" class="anonymous-banner__link">Log In</RouterLink>
        to save it permanently.
      </span>
    </div>
    <button
      class="anonymous-banner__dismiss"
      @click="dismiss"
      aria-label="Dismiss notice"
    >
      &times;
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const SESSION_KEY = 'anonymous_banner_dismissed'

const visible = ref(sessionStorage.getItem(SESSION_KEY) !== '1')

/**
 *
 */
function dismiss() {
  visible.value = false
  sessionStorage.setItem(SESSION_KEY, '1')
}
</script>

<style scoped>
.anonymous-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  background: var(--color-warning-bg, #fef3c7);
  border: 1px solid var(--color-warning-border, #fcd34d);
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

.anonymous-banner__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-warning-text, #92400e);
}

.anonymous-banner__icon {
  flex-shrink: 0;
  font-size: 1rem;
}

.anonymous-banner__link {
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  text-decoration: underline;
}

.anonymous-banner__dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--color-warning-text, #92400e);
  border-radius: 0.25rem;
}

.anonymous-banner__dismiss:hover {
  background: rgba(0, 0, 0, 0.1);
}
</style>
