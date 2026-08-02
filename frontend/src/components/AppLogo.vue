<script setup lang="ts">
/**
 * AppLogo — inline SVG icon (document with checkmark) for the app brand.
 *
 * Uses the warm creative palette:
 *   - Document body: `var(--color-primary)` (amber/gold)
 *   - Folded corner: darker amber
 *   - Checkmark / strokes: `currentColor` (adapts to text color in light/dark mode)
 *
 * 24×24 viewBox, aria-hidden for decorative use.
 */
</script>

<template>
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Document body -->
    <path
      d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
      fill="var(--color-primary, #f59e0b)"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Folded corner -->
    <path
      d="M14 2V8H20"
      fill="var(--color-primary, #f59e0b)"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Checkmark -->
    <path
      d="M9 15L11 17L16 12"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
