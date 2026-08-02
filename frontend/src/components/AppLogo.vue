<script setup lang="ts">
/**
 * AppLogo — stacked document pages icon for the app brand.
 * 32×32 viewBox, uses currentColor for theme-aware rendering.
 *
 * The mark consists of two offset rounded-rect pages with content
 * lines on the front page — a clear resume/document metaphor that
 * reads well at favicon sizes.
 *
 * Color strategy:
 *   - Page bodies: `currentColor` (inherits foreground, adapts to light/dark)
 *   - Content lines: `var(--color-background)` (inverts against the page)
 *   - Accent bar: `var(--color-primary)` (always amber/gold #f59e0b)
 */
</script>

<template>
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="img"
  >
    <!-- Back page (offset behind front) -->
    <rect
      x="2"
      y="1"
      width="26"
      height="28"
      rx="3"
      fill="currentColor"
      opacity="0.25"
    />
    <!-- Front page -->
    <rect
      x="4"
      y="3"
      width="26"
      height="28"
      rx="3"
      fill="currentColor"
      opacity="0.9"
    />
    <!-- Content lines (background color — inverts against the page) -->
    <rect
      x="9"
      y="9"
      width="12"
      height="2"
      rx="1"
      fill="var(--color-background, #fafaf9)"
      opacity="0.9"
    />
    <rect
      x="9"
      y="14"
      width="16"
      height="2"
      rx="1"
      fill="var(--color-background, #fafaf9)"
      opacity="0.6"
    />
    <rect
      x="9"
      y="19"
      width="10"
      height="2"
      rx="1"
      fill="var(--color-background, #fafaf9)"
      opacity="0.6"
    />
    <!-- Accent bar (brand primary — always warm) -->
    <rect
      x="9"
      y="3"
      width="4"
      height="3"
      rx="1"
      fill="var(--color-primary, #f59e0b)"
    />
  </svg>
</template>
