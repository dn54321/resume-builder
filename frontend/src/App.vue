<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'

const { isAuthenticated, user, checkSession, logout } = useAuth()

onMounted(() => {
  checkSession()
})
</script>

<template>
  <header>
    <nav>
        <RouterLink to="/">Home</RouterLink>
        <template v-if="isAuthenticated">
          <RouterLink to="/account" class="user-email">{{ user?.email }}</RouterLink>
          <button class="logout-button" @click="logout()">
            Log out
          </button>
        </template>
        <template v-else>
          <RouterLink to="/login">Log in</RouterLink>
          <RouterLink to="/signup">Sign up</RouterLink>
        </template>
    </nav>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

.user-email {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
  color: var(--color-text);
}

.logout-button {
  display: inline-block;
  padding: 0 1rem;
  border: none;
  border-left: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
