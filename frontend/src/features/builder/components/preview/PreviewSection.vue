<template>
  <div class="preview-section">
    <h2 class="preview-section__heading">{{ heading }}</h2>
    <hr class="preview-section__rule" />
    <div class="preview-section__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  heading: string
}>()
</script>

<style scoped>
.preview-section {
  margin-bottom: 10pt;
}

.preview-section__heading {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 12pt;
  font-weight: 700;
  color: #000;
  margin: 0 0 2pt;
  text-transform: uppercase;
  letter-spacing: 0.5pt;
}

.preview-section__rule {
  border: none;
  border-top: 1pt solid #000;
  margin: 0 0 6pt;
}

.preview-section__body {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #000;
  line-height: 1.4;
}
</style>
