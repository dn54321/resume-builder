<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'
import ConfirmModal from '@/shared/components/ConfirmModal.vue'

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
const showConfirmModal = ref(false)
const resumeToDelete = ref<ResumeSummary | null>(null)

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
 * Format a date string for display.
 * @param {string} dateStr - ISO date string
 * @returns {string} Locale-formatted date
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Open the confirm modal for a resume.
 * @param {ResumeSummary} resume - The resume to delete
 */
function handleDeleteClick(resume: ResumeSummary): void {
  error.value = ''
  resumeToDelete.value = resume
  showConfirmModal.value = true
}

/**
 * Execute the deletion after user confirms.
 */
async function handleConfirmDelete(): Promise<void> {
  if (!resumeToDelete.value) return

  error.value = ''

  try {
    await api.del(`/api/v1/resumes/${resumeToDelete.value.id}`)
    resumes.value = resumes.value.filter(
      (r) => r.id !== resumeToDelete.value!.id,
    )
  } catch (err) {
    if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  } finally {
    resumeToDelete.value = null
  }
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
    <div
      v-if="error"
      class="mb-6 rounded-md border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
      role="alert"
    >
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
        class="resume-card bg-card border border-border text-card-foreground rounded-lg hover:border-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2"
        role="button"
        tabindex="0"
        @click="router.push(`/builder/${resume.id}`)"
        @keydown.enter="router.push(`/builder/${resume.id}`)"
        @keydown.space.prevent="router.push(`/builder/${resume.id}`)"
      >
        <div class="resume-card__header">
          <h3 class="resume-card__name">{{ resume.layout }}</h3>
          <button
            class="resume-card__delete-btn"
            data-testid="delete-btn"
            :aria-label="`Delete ${resume.layout}`"
            @click.stop="handleDeleteClick(resume)"
          >
            🗑️
          </button>
        </div>
        <p class="resume-card__date">
          Updated {{ formatDate(resume.updatedAt) }}
        </p>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-model="showConfirmModal"
      :title="resumeToDelete ? `Delete ${resumeToDelete.layout}?` : 'Delete?'"
      description="This action cannot be undone."
      confirm-label="Delete"
      cancel-label="Cancel"
      variant="destructive"
      data-testid="confirm-delete-modal"
      @confirm="handleConfirmDelete"
    />
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

/* ── Grid ───────────────────────────────── */

.resume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

/* ── Resume Card ────────────────────────── */

.resume-card {
  padding: 1.25rem;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.resume-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.resume-card__name {
  margin: 0;
  font-size: 1.125rem;
  text-transform: capitalize;
  word-break: break-word;
  flex: 1;
}

.resume-card__delete-btn {
  flex-shrink: 0;
  padding: 0.25rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  border-radius: 4px;
  opacity: 0.5;
  transition: opacity 0.15s, background-color 0.15s;
}

.resume-card__delete-btn:hover {
  opacity: 1;
  background-color: #fee2e2;
}

.resume-card__date {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}

/* ── Skeleton Card ──────────────────────── */

.resume-card--skeleton {
  cursor: default;
  pointer-events: none;
}

.skeleton-line {
  height: 1rem;
  background: var(--muted);
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
  background: var(--color-card);
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
  color: var(--muted-foreground);
  font-size: 0.9375rem;
}
</style>
