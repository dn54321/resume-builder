<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'

const { isAuthenticated } = useAuth()
</script>

<template>
  <div class="landing">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-content">
        <span class="badge">Resume Builder</span>
        <h1 class="hero-heading">Build a resume that gets you hired</h1>
        <p class="hero-subheading">
          Create professional resumes with smart section management,
          live preview, and PDF export. Tailor your resume to any job description.
        </p>
        <div class="cta-buttons">
          <template v-if="isAuthenticated">
            <RouterLink to="/dashboard" class="btn btn-primary">Go to Dashboard</RouterLink>
            <RouterLink to="/dashboard" class="btn btn-outline">Create New Resume</RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/signup" class="btn btn-primary">Get Started</RouterLink>
            <RouterLink to="/login" class="btn btn-outline">Log in</RouterLink>
          </template>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section class="features">
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon" aria-hidden="true">👁️</div>
          <h3 class="feature-title">Live Preview</h3>
          <p class="feature-description">See changes in real time as you edit</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon" aria-hidden="true">📋</div>
          <h3 class="feature-title">Smart Sections</h3>
          <p class="feature-description">Toggle and reorder sections to match the job</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon" aria-hidden="true">🎯</div>
          <h3 class="feature-title">Tailor to Jobs</h3>
          <p class="feature-description">Paste a job description, highlight relevant bullets</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon" aria-hidden="true">📄</div>
          <h3 class="feature-title">PDF Export</h3>
          <p class="feature-description">Download a polished PDF with one click</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <p>Resume Builder &mdash; Built with Vue, NestJS, and Tailwind CSS</p>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  padding: 0 1rem;
}

/* ── Hero ── */
.hero {
  display: flex;
  justify-content: center;
  padding: 4rem 0 3rem;
  width: 100%;
}

.hero-content {
  text-align: center;
  max-width: 48rem;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 9999px;
  margin-bottom: 1.5rem;
}

.hero-heading {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 1rem;
}

.hero-subheading {
  font-size: 1.125rem;
  color: var(--color-text-muted, #6b7280);
  max-width: 36rem;
  margin: 0 auto 2rem;
  line-height: 1.6;
}

/* ── CTA Buttons ── */
.cta-buttons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn {
  display: inline-block;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: opacity 0.2s;
}

.btn:hover {
  opacity: 0.85;
}

.btn-primary {
  background: var(--color-text);
  color: var(--color-background);
}

.btn-outline {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

/* ── Features ── */
.features {
  width: 100%;
  max-width: 64rem;
  padding: 2rem 0 4rem;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}

.feature-card {
  text-align: center;
  padding: 1.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-background-soft);
}

.feature-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
}

.feature-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.feature-description {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
  line-height: 1.5;
}

/* ── Footer ── */
.footer {
  text-align: center;
  padding: 2rem 0;
  border-top: 1px solid var(--color-border);
  width: 100%;
  margin-top: auto;
}

.footer p {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}

/* ── Responsive Hero ── */
@media (max-width: 480px) {
  .hero {
    padding: 3rem 0 2rem;
  }

  .hero-heading {
    font-size: 1.75rem;
  }

  .hero-subheading {
    font-size: 1rem;
  }
}
</style>
