<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ content: string }>();
const formatted = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.content), null, 2);
  } catch {
    return props.content;
  }
});
</script>

<template>
  <figure class="message-part code-block-part json-block-part">
    <figcaption>json</figcaption>
    <pre><code>{{ formatted }}</code></pre>
  </figure>
</template>
