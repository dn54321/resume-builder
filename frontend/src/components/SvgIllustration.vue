<script setup lang="ts">
/**
 * SvgIllustration — renders an inline SVG from a raw string import,
 * preserving CSS variable inheritance for theming support.
 */
defineProps<{
  /** Raw SVG markup (imported with ?raw suffix) */
  svg: string
  /** Accessible label for the illustration */
  ariaLabel?: string
  /** Optional CSS class */
  class?: string
}>()
</script>

<template>
  <div
    class="svg-illustration"
    :class="$props.class"
    :aria-label="ariaLabel"
    :role="ariaLabel ? 'img' : undefined"
    v-html="svg"
  />
</template>

<style scoped>
.svg-illustration :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
</style>
