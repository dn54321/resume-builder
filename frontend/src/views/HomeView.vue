<script setup lang="ts">
/**
 * HomeView — landing page for the Resume Builder.
 *
 * Features a hero section with brand badge, headline, subheading, and
 * authentication-aware CTA buttons. Below the hero: a four-card feature grid
 * followed by a simple footer.
 */
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/stores/auth'

const auth = useAuthStore()

const features = [
  {
    icon: '👁️',
    title: 'Live Preview',
    description: 'See changes in real time as you edit',
  },
  {
    icon: '🧩',
    title: 'Smart Sections',
    description: 'Toggle and reorder sections to match the job',
  },
  {
    icon: '🎯',
    title: 'Tailor to Jobs',
    description: 'Paste a job description, highlight relevant bullets',
  },
  {
    icon: '📄',
    title: 'PDF Export',
    description: 'Download a polished PDF with one click',
  },
]
</script>

<template>
  <div class="landing-page min-h-screen flex flex-col">
    <!-- Hero Section -->
    <section class="flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
      <div class="max-w-3xl mx-auto text-center">
        <!-- Badge -->
        <span
          class="inline-block px-3 py-1 text-sm font-medium bg-amber-100 text-amber-800 rounded-full mb-6"
        >
          Resume Builder
        </span>

        <!-- Heading -->
        <h1
          class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Build a resume that gets you hired
        </h1>

        <!-- Subheading -->
        <p class="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Create professional resumes with smart section management, live
          preview, and PDF export. Tailor your resume to any job description.
        </p>

        <!-- CTA Buttons — auth-aware -->
        <div class="mt-8 flex items-center justify-center gap-4">
          <template v-if="auth.isAuthenticated">
            <RouterLink to="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </RouterLink>
            <RouterLink to="/dashboard">
              <Button variant="outline" size="lg">Create New Resume</Button>
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/signup">
              <Button size="lg">Get Started</Button>
            </RouterLink>
            <RouterLink to="/login">
              <Button variant="outline" size="lg">Log in</Button>
            </RouterLink>
          </template>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section class="px-4 py-16">
      <div class="max-w-5xl mx-auto">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="feature-card rounded-xl border bg-card p-6 text-center"
          >
            <div class="text-3xl mb-3" aria-hidden="true">{{ feature.icon }}</div>
            <h3 class="font-semibold text-foreground mb-2">{{ feature.title }}</h3>
            <p class="text-sm text-muted-foreground">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer
      class="px-4 py-8 text-center text-sm text-muted-foreground border-t"
    >
      Resume Builder &mdash; Built with Vue, NestJS, and Tailwind CSS
    </footer>
  </div>
</template>
