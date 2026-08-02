<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import AppLogo from '@/components/AppLogo.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const router = useRouter()
const { isAuthenticated, user, checkSession, logout } = useAuth()

onMounted(() => {
  checkSession()
})

/**
 *
 */
async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b bg-background sticky top-0 z-50">
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
      >
        <RouterLink
          to="/"
          class="flex items-center gap-2 font-bold text-xl text-foreground no-underline"
        >
          <AppLogo />
          Resume Builder
        </RouterLink>

        <nav class="flex items-center gap-4">
          <ThemeToggle />

          <template v-if="isAuthenticated">
            <RouterLink
              to="/dashboard"
              class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              My Resumes
            </RouterLink>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="gap-2">
                  <span class="text-sm max-w-[160px] truncate">{{ user?.email }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56">
                <DropdownMenuItem @select="router.push('/account')">
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="handleLogout">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>

          <template v-else>
            <RouterLink to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </RouterLink>
            <RouterLink to="/signup">
              <Button size="sm">Sign up</Button>
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
