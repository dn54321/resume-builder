<!--
  NotFoundView — 404 catch-all page.
  Shown for any URL that doesn't match a defined route.
-->
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>The page you're looking for doesn't exist.</p>
    <button @click="router.push('/')">Go Home</button>
  </div>
</template>
