<script setup lang="ts">
defineProps<{
  content: string;
  language?: string;
}>();
</script>

<template>
  <figure class="message-part code-block-part">
    <figcaption v-if="language">{{ language }}</figcaption>
    <pre><code>{{ content }}</code></pre>
  </figure>
</template>
