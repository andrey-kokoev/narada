<script setup lang="ts">
defineProps<{
  content: string;
  language?: string;
  ordinal?: number;
}>();
</script>

<template>
  <p class="message-part message-plain">{{ content }}</p>
</template>
