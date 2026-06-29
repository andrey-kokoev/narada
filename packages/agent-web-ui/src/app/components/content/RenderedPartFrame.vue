<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  title: string;
  source: string;
  sourceLanguage?: string;
}>();

const activeView = ref<'render' | 'code'>('render');
</script>

<template>
  <figure class="message-part rendered-part-frame">
    <figcaption class="rendered-part-header">
      <span class="rendered-part-title">{{ props.title }}</span>
      <span class="rendered-part-tabs" role="tablist" :aria-label="`${props.title} view`">
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'code'"
          :class="['rendered-part-tab', { 'is-active': activeView === 'code' }]"
          @click="activeView = 'code'"
        >Code</button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'render'"
          :class="['rendered-part-tab', { 'is-active': activeView === 'render' }]"
          @click="activeView = 'render'"
        >Render</button>
      </span>
    </figcaption>
    <div v-if="activeView === 'render'" class="rendered-part-render" role="tabpanel">
      <slot name="render" />
    </div>
    <div v-else class="rendered-part-code" role="tabpanel">
      <figcaption v-if="props.sourceLanguage">{{ props.sourceLanguage }}</figcaption>
      <pre><code>{{ props.source }}</code></pre>
    </div>
  </figure>
</template>
