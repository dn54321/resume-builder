<script setup lang="ts">
/**
 * HomeView — landing page for the Resume Builder.
 * Features hero illustration, feature highlights with spot illustrations,
 * decorative blobs, and wave dividers for a premium, visually distinctive design.
 */
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import SvgIllustration from '@/components/SvgIllustration.vue'

import heroIllustrationRaw from '@/assets/illustrations/hero-illustration.svg?raw'
import tailorIllustrationRaw from '@/assets/illustrations/tailor-illustration.svg?raw'
import sectionsIllustrationRaw from '@/assets/illustrations/sections-illustration.svg?raw'
import previewIllustrationRaw from '@/assets/illustrations/preview-illustration.svg?raw'
import exportIllustrationRaw from '@/assets/illustrations/export-illustration.svg?raw'
import blob1Raw from '@/assets/illustrations/decorative/blob-1.svg?raw'
import blob2Raw from '@/assets/illustrations/decorative/blob-2.svg?raw'
import blob3Raw from '@/assets/illustrations/decorative/blob-3.svg?raw'
import waveDividerRaw from '@/assets/illustrations/decorative/wave-divider.svg?raw'

const features = [
  {
    illustration: tailorIllustrationRaw,
    title: 'AI-Powered Tailoring',
    description:
      'Paste a job description and let our AI tailor your resume to match. Highlight relevant skills and experience automatically.',
  },
  {
    illustration: sectionsIllustrationRaw,
    title: 'Flexible Sections',
    description:
      'Choose exactly which sections to include — work experience, education, skills, projects, and more. Build the resume that fits you.',
  },
  {
    illustration: previewIllustrationRaw,
    title: 'Live Preview',
    description:
      'See every change instantly with a real-time preview. Choose between Standard and Two-Column layouts and watch your resume take shape.',
  },
  {
    illustration: exportIllustrationRaw,
    title: 'PDF Export',
    description:
      'Download a polished, print-ready PDF with one click. Professional formatting that looks great on screen and on paper.',
  },
]
</script>

<template>
  <div class="landing-page">
    <!-- Hero Section -->
    <section class="relative overflow-hidden">
      <!-- Decorative blobs behind hero -->
      <div
        class="absolute top-0 right-0 w-[500px] h-[500px] opacity-60 pointer-events-none"
        aria-hidden="true"
      >
        <SvgIllustration :svg="blob1Raw" class="absolute -top-20 -right-10 w-full h-full" />
      </div>
      <div
        class="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-50 pointer-events-none"
        aria-hidden="true"
      >
        <SvgIllustration :svg="blob2Raw" class="absolute -bottom-20 -left-10 w-full h-full" />
      </div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <!-- Hero text -->
          <div class="text-center lg:text-left">
            <h1
              class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              Build a resume
              <span
                class="bg-gradient-to-r from-amber-500 to-rose-400 bg-clip-text text-transparent"
              >
                you're proud of
              </span>
            </h1>
            <p class="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
              Create professional, tailored resumes in minutes. Our builder helps you
              craft the perfect resume for every job application — with AI-powered
              tailoring, live preview, and one-click PDF export.
            </p>
            <div class="mt-8 flex items-center justify-center lg:justify-start gap-4">
              <RouterLink to="/builder">
                <Button size="lg" class="bg-amber-500 hover:bg-amber-600 text-white">
                  Get Started Free
                </Button>
              </RouterLink>
              <RouterLink to="/login">
                <Button variant="outline" size="lg">Log in</Button>
              </RouterLink>
            </div>
          </div>

          <!-- Hero illustration -->
          <div class="flex justify-center lg:justify-end">
            <SvgIllustration
              :svg="heroIllustrationRaw"
              aria-label="Resume builder illustration"
              class="w-full max-w-[500px]"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Wave divider -->
    <div class="relative h-16 overflow-hidden" aria-hidden="true">
      <SvgIllustration :svg="waveDividerRaw" class="absolute inset-0 w-full h-full" />
    </div>

    <!-- Features Section -->
    <section class="relative py-16 lg:py-24">
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
          <div
            v-for="feature in features"
            :key="feature.title"
            class="group relative rounded-2xl border bg-card p-6 hover:shadow-lg transition-shadow duration-300"
          >
            <div class="w-16 h-16 mb-4 mx-auto">
              <SvgIllustration
                :svg="feature.illustration"
                :aria-label="feature.title"
                class="w-full h-full"
              />
            </div>
            <h3 class="text-lg font-semibold text-foreground text-center mb-2">
              {{ feature.title }}
            </h3>
            <p class="text-sm text-muted-foreground text-center">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="relative py-16 lg:py-20">
      <!-- Decorative blob -->
      <div
        class="absolute left-0 bottom-0 w-[400px] h-[400px] opacity-30 pointer-events-none"
        aria-hidden="true"
      >
        <SvgIllustration :svg="blob1Raw" class="w-full h-full" />
      </div>

      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-bold text-foreground sm:text-4xl">
          Ready to build your resume?
        </h2>
        <p class="mt-4 text-lg text-muted-foreground">
          Join thousands of job seekers who've landed interviews with resumes built here.
        </p>
        <div class="mt-8">
          <RouterLink to="/builder">
            <Button size="lg" class="bg-amber-500 hover:bg-amber-600 text-white">
              Start Building Now
            </Button>
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
