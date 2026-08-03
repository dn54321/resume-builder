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

<<<<<<< HEAD
const auth = useAuthStore()
=======
import { computed } from 'vue'
import heroIllustrationRaw from '@/assets/illustrations/hero-illustration.svg?raw'
import tailorIllustrationRaw from '@/assets/illustrations/tailor-illustration.svg?raw'
import sectionsIllustrationRaw from '@/assets/illustrations/sections-illustration.svg?raw'
import previewIllustrationRaw from '@/assets/illustrations/preview-illustration.svg?raw'
import exportIllustrationRaw from '@/assets/illustrations/export-illustration.svg?raw'
import blob1Raw from '@/assets/illustrations/decorative/blob-1.svg?raw'
import blob2Raw from '@/assets/illustrations/decorative/blob-2.svg?raw'
import blob3Raw from '@/assets/illustrations/decorative/blob-3.svg?raw'
import waveDividerRaw from '@/assets/illustrations/decorative/wave-divider.svg?raw'
import dotPatternRaw from '@/assets/illustrations/decorative/dot-pattern.svg?raw'

/** URL-encoded dot-pattern for use as a repeating background image */
const dotPatternBg = computed(
  () => `url("data:image/svg+xml,${encodeURIComponent(dotPatternRaw)}")`,
)
>>>>>>> ticket/res-52

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

<<<<<<< HEAD
    <!-- Features Grid -->
    <section class="px-4 py-16">
      <div class="max-w-5xl mx-auto">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
=======
    <!-- Wave divider -->
    <div class="relative h-16 overflow-hidden" aria-hidden="true">
      <SvgIllustration :svg="waveDividerRaw" class="absolute inset-0 w-full h-full" />
    </div>

    <!-- Features Section -->
    <section
      class="relative py-16 lg:py-24"
      :style="{ backgroundImage: dotPatternBg, backgroundRepeat: 'repeat' }"
    >
      <!-- Decorative blobs -->
      <div
        class="absolute top-20 right-0 w-[350px] h-[350px] opacity-40 pointer-events-none"
        aria-hidden="true"
      >
        <SvgIllustration :svg="blob3Raw" class="w-full h-full" />
      </div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-foreground sm:text-4xl">
            Everything you need to land the job
          </h2>
          <p class="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            From crafting to tailoring to exporting — all the tools you need in one place.
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
>>>>>>> ticket/res-52
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
