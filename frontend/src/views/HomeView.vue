<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'

const { isAuthenticated } = useAuth()
</script>

<template>
  <div class="flex flex-col items-center min-h-screen px-4">
    <!-- Hero Section -->
    <section class="flex justify-center w-full py-16 sm:py-20">
      <div class="text-center max-w-3xl">
        <span class="inline-block px-3 py-1 text-sm font-semibold rounded-full border bg-muted text-muted-foreground mb-6">
          Resume Builder
        </span>
        <h1 class="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
          Build a resume that gets you hired
        </h1>
        <p class="text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          Create professional resumes with smart section management,
          live preview, and PDF export. Tailor your resume to any job description.
        </p>
        <div class="flex justify-center gap-4 flex-wrap">
          <template v-if="isAuthenticated">
            <RouterLink
              to="/dashboard"
              class="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold px-6 py-3 hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </RouterLink>
            <RouterLink
              to="/dashboard"
              class="inline-flex items-center justify-center rounded-lg border font-semibold px-6 py-3 hover:bg-muted transition-colors"
            >
              Create New Resume
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink
              to="/signup"
              class="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold px-6 py-3 hover:opacity-90 transition-opacity"
            >
              Get Started
            </RouterLink>
            <RouterLink
              to="/login"
              class="inline-flex items-center justify-center rounded-lg border font-semibold px-6 py-3 hover:bg-muted transition-colors"
            >
              Log in
            </RouterLink>
          </template>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section class="w-full max-w-5xl py-8 pb-16">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="text-center rounded-xl border bg-card p-6">
          <div class="text-3xl mb-3" aria-hidden="true">&#x1F441;&#xFE0F;</div>
          <h3 class="text-lg font-bold mb-2">Live Preview</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            See changes in real time as you edit
          </p>
        </div>
        <div class="text-center rounded-xl border bg-card p-6">
          <div class="text-3xl mb-3" aria-hidden="true">&#x1F4CB;</div>
          <h3 class="text-lg font-bold mb-2">Smart Sections</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Toggle and reorder sections to match the job
          </p>
        </div>
        <div class="text-center rounded-xl border bg-card p-6">
          <div class="text-3xl mb-3" aria-hidden="true">&#x1F3AF;</div>
          <h3 class="text-lg font-bold mb-2">Tailor to Jobs</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Paste a job description, highlight relevant bullets
          </p>
        </div>
        <div class="text-center rounded-xl border bg-card p-6">
          <div class="text-3xl mb-3" aria-hidden="true">&#x1F4C4;</div>
          <h3 class="text-lg font-bold mb-2">PDF Export</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Download a polished PDF with one click
          </p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="text-center py-8 border-t w-full mt-auto">
      <p class="text-sm text-muted-foreground">
        Resume Builder &mdash; Built with Vue, NestJS, and Tailwind CSS
      </p>
    </footer>
  </div>
</template>
