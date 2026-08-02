<template>
  <ul
    class="preview-bullet-list mt-[2pt] pl-[18pt] list-disc"
    style="font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif)"
  >
    <li
      v-for="bullet in bullets"
      :key="bullet.id"
      class="preview-bullet-list__item text-[10pt] text-black leading-[1.35] mb-[1pt]"
    >
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
