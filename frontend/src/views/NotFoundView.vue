<script setup lang="ts">
</script>

<template>
  <div class="not-found">
    <span class="not-found__code">404</span>
    <h1 class="not-found__heading">Page not found</h1>
    <p class="not-found__description">
      The page you're looking for doesn't exist or has been moved.
    </p>
    <RouterLink to="/" class="not-found__button">Go home</RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
  padding: 2rem;
}

.not-found__code {
  font-size: 8rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-foreground);
  opacity: 0.2;
}

.not-found__heading {
  font-size: 2rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
  color: var(--color-foreground);
}

.not-found__description {
  font-size: 1rem;
  color: var(--color-muted-foreground);
  max-width: 28rem;
  margin-bottom: 2rem;
}

.not-found__button {
  display: inline-block;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-primary-foreground);
  background-color: var(--color-primary);
  border-radius: 0.375rem;
  text-decoration: none;
  transition: background-color 0.2s;
}

.not-found__button:hover {
  opacity: 0.9;
}
</style>
