<template>
  <ul class="preview-bullet-list">
    <li v-for="bullet in bullets" :key="bullet.id" class="preview-bullet-list__item">
      {{ bullet.value }}
    </li>
  </ul>
</template>

<script setup lang="ts">
export interface PreviewBullet {
  id: string
  value: string
}

defineProps<{
  bullets: PreviewBullet[]
}>()
</script>

<style scoped>
.preview-bullet-list {
  margin: 2pt 0 0;
  padding-left: 18pt;
  list-style-type: disc;
}

.preview-bullet-list__item {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #000;
  line-height: 1.35;
  margin-bottom: 1pt;
}
</style>
