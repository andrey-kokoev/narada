<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  title: string;
  source: string;
  sourceLanguage?: string;
}>();

const activeView = ref<'render' | 'code'>('render');
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');

async function copySource() {
  try {
    await navigator.clipboard.writeText(props.source);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }
  window.setTimeout(() => {
    copyState.value = 'idle';
  }, 1400);
}
</script>

<template>
  <figure class="message-part rendered-part-frame">
    <div v-if="activeView === 'render'" class="rendered-part-render" role="tabpanel">
      <slot name="render" />
    </div>
    <div v-else class="rendered-part-code" role="tabpanel">
      <div class="rendered-part-code-toolbar">
        <span class="rendered-part-code-title">{{ props.sourceLanguage ?? props.title }}</span>
        <button type="button" class="rendered-part-copy" @click="copySource">
          {{ copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy' }}
        </button>
      </div>
      <pre><code>{{ props.source }}</code></pre>
    </div>
    <div class="rendered-part-tabs" role="tablist" :aria-label="`${props.title} view`">
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'render'"
        :class="['rendered-part-tab', { 'is-active': activeView === 'render' }]"
        @click="activeView = 'render'"
      >Render</button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'code'"
        :class="['rendered-part-tab', { 'is-active': activeView === 'code' }]"
        @click="activeView = 'code'"
      >Code</button>
    </div>
  </figure>
</template>
