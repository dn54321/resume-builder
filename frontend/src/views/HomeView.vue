<script setup lang="ts">
/**
 * HomeView — landing page for the Resume Builder.
 */
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-foreground sm:text-5xl">
        Build Your Resume
      </h1>
      <p class="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
        Create professional, tailored resumes in minutes. Our builder helps you
        craft the perfect resume for every job application.
      </p>
      <div class="mt-8 flex items-center justify-center gap-4">
        <RouterLink to="/builder">
          <Button size="lg">Get Started</Button>
        </RouterLink>
        <RouterLink to="/login">
          <Button variant="outline" size="lg">Log in</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
