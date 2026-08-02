<!--
  DashboardView — Stub component for RES-34.
  Displays a placeholder dashboard page for authenticated users.
-->
<script setup lang="ts">
import { useAuthStore } from '@/features/auth/stores/auth';

const auth = useAuthStore();
</script>

<template>
  <div class="dashboard">
    <h1>Dashboard</h1>
    <p v-if="auth.user">Welcome, {{ auth.user.email }}</p>
  </div>
</template>
