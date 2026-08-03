<template>
  <div v-if="visible" class="flex items-center justify-between px-4 py-2.5 bg-amber-100 border border-amber-300 rounded-md mb-4">
    <div class="flex items-center gap-2 text-[0.8125rem] text-amber-800">
      <span class="shrink-0 text-base">&#9888;</span>
      <span>
        You are not signed in. Your resume is saved only in this browser.
        <RouterLink to="/signup" class="text-primary font-semibold underline">Sign Up</RouterLink>
        or
        <RouterLink to="/login" class="text-primary font-semibold underline">Log In</RouterLink>
        to save it permanently.
      </span>
    </div>
    <button
      class="shrink-0 w-6 h-6 flex items-center justify-center border-none bg-transparent cursor-pointer text-xl leading-none text-amber-800 rounded-sm hover:bg-black/10"
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


