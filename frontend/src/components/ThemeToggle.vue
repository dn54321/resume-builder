<script setup lang="ts">
import { Sun, Moon, Monitor } from '@lucide/vue'
import { useTheme, type ThemeMode } from '@/shared/composables/useTheme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const { theme, setTheme } = useTheme()

interface ThemeOption {
  mode: ThemeMode
  label: string
  icon: typeof Sun
}

const options: ThemeOption[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
]
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9"
        aria-label="Toggle theme"
        data-testid="theme-toggle"
      >
        <Sun v-if="theme === 'light'" class="h-4 w-4" />
        <Moon v-else-if="theme === 'dark'" class="h-4 w-4" />
        <Monitor v-else class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-36">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.mode"
        :data-testid="`theme-${option.mode}`"
        :class="{ 'font-semibold': theme === option.mode }"
        @click="setTheme(option.mode)"
      >
        <component :is="option.icon" class="h-4 w-4 mr-2" />
        {{ option.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
