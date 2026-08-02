<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

interface ResumeSummary {
  id: string
  layout: string
  createdAt: string
  updatedAt: string
}

const router = useRouter()
const auth = useAuth()
const api = useApi()

const resumes = ref<ResumeSummary[]>([])
const isLoading = ref(true)
const error = ref('')

onMounted(async () => {
  if (!auth.isAuthenticated) {
    router.replace('/login')
    return
  }

  await fetchResumes()
})

/**
 *
 */
async function fetchResumes(): Promise<void> {
  isLoading.value = true
  error.value = ''

  try {
    resumes.value = await api.get<ResumeSummary[]>('/api/v1/resumes')
  } catch (err) {
    if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  } finally {
    isLoading.value = false
  }
}

/**
 *
 */
async function handleCreateResume(): Promise<void> {
  error.value = ''

  try {
    const created = await api.post<{ id: string }>('/api/v1/resumes', {
      sections: [],
    })
    router.push(`/builder/${created.id}`)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  }
}

/**
 *
 * @param dateStr
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="dashboard-view">
    <!-- Page Header -->
    <header class="dashboard-header">
      <h1>My Resumes</h1>
      <button
        class="btn-primary"
        :disabled="isLoading"
        @click="handleCreateResume"
      >
        Create New Resume
      </button>
    </header>

    <!-- Error State -->
    <div v-if="error" class="alert-error" role="alert">
      {{ error }}
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="resume-grid">
      <div
        v-for="n in 3"
        :key="n"
        class="resume-card resume-card--skeleton"
      >
        <div class="skeleton-line skeleton-line--title" />
        <div class="skeleton-line skeleton-line--date" />
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="resumes.length === 0" class="empty-state">
      <div class="empty-state-card">
        <div class="empty-state-icon">📄</div>
        <h2>No resumes yet</h2>
        <p>Create your first resume to get started</p>
        <button class="btn-primary" @click="handleCreateResume">
          Create New Resume
        </button>
      </div>
    </div>

    <!-- Resume List -->
    <div v-else class="resume-grid">
      <div
        v-for="resume in resumes"
        :key="resume.id"
        class="resume-card"
        role="button"
        tabindex="0"
        @click="router.push(`/builder/${resume.id}`)"
        @keydown.enter="router.push(`/builder/${resume.id}`)"
        @keydown.space.prevent="router.push(`/builder/${resume.id}`)"
      >
        <h3 class="resume-card__name">{{ resume.layout }}</h3>
        <p class="resume-card__date">
          Updated {{ formatDate(resume.updatedAt) }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

/* ── Header ─────────────────────────────── */

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.75rem;
}

/* ── Buttons ────────────────────────────── */

.btn-primary {
  padding: 0.625rem 1.25rem;
  font-size: 1rem;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  background-color: var(--color-text);
  color: var(--color-background);
  font-weight: 500;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Alert ──────────────────────────────── */

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

/* ── Grid ───────────────────────────────── */

.resume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

/* ── Resume Card ────────────────────────── */

.resume-card {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  background: var(--color-background);
}

.resume-card:hover {
  border-color: var(--color-text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.resume-card:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.resume-card__name {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  text-transform: capitalize;
}

.resume-card__date {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

/* ── Skeleton Card ──────────────────────── */

.resume-card--skeleton {
  cursor: default;
  pointer-events: none;
}

.resume-card--skeleton:hover {
  border-color: var(--color-border);
  box-shadow: none;
}

.skeleton-line {
  height: 1rem;
  background: #e5e7eb;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  width: 60%;
  height: 1.25rem;
  margin-bottom: 0.75rem;
}

.skeleton-line--date {
  width: 80%;
  height: 0.8125rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── Empty State ────────────────────────── */

.empty-state {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
}

.empty-state-card {
  text-align: center;
  padding: 3rem 2rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  max-width: 360px;
  width: 100%;
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}

.empty-state-card p {
  margin: 0 0 1.5rem;
  color: #6b7280;
  font-size: 0.9375rem;
}
</style>
