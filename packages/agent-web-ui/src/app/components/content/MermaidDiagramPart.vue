<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import RenderedPartFrame from './RenderedPartFrame.vue';

let nextMermaidInstanceId = 0;

const props = defineProps<{
  content: string;
  language?: string;
  ordinal: number;
}>();
const renderedSvg = ref('');
const errorMessage = ref('');
const instanceId = nextMermaidInstanceId;
nextMermaidInstanceId += 1;
const diagramId = computed(() => `narada-mermaid-${instanceId}-${props.ordinal}-${hashText(props.content)}`);

onMounted(renderDiagram);
watch(() => props.content, renderDiagram);

async function renderDiagram() {
  renderedSvg.value = '';
  errorMessage.value = '';
  try {
    const mermaidModule = await import('mermaid');
    const mermaid = (mermaidModule.default ?? mermaidModule) as typeof import('mermaid').default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
    const result = await mermaid.render(diagramId.value, props.content);
    renderedSvg.value = result.svg;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
</script>

<template>
  <RenderedPartFrame title="mermaid" :source="content" source-language="mermaid">
    <template #render>
      <div v-if="renderedSvg" class="mermaid-diagram" v-html="renderedSvg"></div>
      <div v-else-if="errorMessage" class="mermaid-fallback">
        <p>Mermaid render failed: {{ errorMessage }}</p>
        <pre><code>{{ content }}</code></pre>
      </div>
      <div v-else class="mermaid-loading">Rendering diagram...</div>
    </template>
  </RenderedPartFrame>
</template>
