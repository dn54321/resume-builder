<template>
  <div
    class="preview-section mb-[10pt]"
    style="font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif)"
  >
    <h2 class="preview-section__heading text-[12pt] font-bold text-black m-0 mb-[2pt] uppercase tracking-[0.5pt]">
      {{ heading }}
    </h2>
    <hr class="preview-section__rule border-none border-t border-black m-0 mb-[6pt]" />
    <div class="preview-section__body text-[10pt] text-black leading-[1.4]">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  heading: string
}>()
</script>
