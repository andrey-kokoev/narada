<script setup lang="ts">
import { computed, ref } from 'vue';
import { stringifyRawPayload } from '../lib/rawPayload';

const props = defineProps<{ event: unknown }>();
const open = ref(false);
const rawText = computed(() => (open.value ? stringifyRawPayload(props.event) : ''));
</script>

<template>
  <details class="event-raw" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>Raw event</summary>
    <pre v-if="open">{{ rawText }}</pre>
  </details>
</template>
