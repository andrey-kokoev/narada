<script setup lang="ts">
import { computed } from 'vue';
import CodeBlockPart from './CodeBlockPart.vue';
import JsonBlockPart from './JsonBlockPart.vue';
import MarkdownTextPart from './MarkdownTextPart.vue';
import MermaidDiagramPart from './MermaidDiagramPart.vue';
import PlainTextPart from './PlainTextPart.vue';
import { parseMessageContent, type MessageRenderPart } from '../../lib/messageContent';

const props = defineProps<{ content: string }>();
const parts = computed(() => parseMessageContent(props.content));
const CONTENT_RENDERERS = {
  plain_text: PlainTextPart,
  markdown: MarkdownTextPart,
  code_block: CodeBlockPart,
  mermaid_diagram: MermaidDiagramPart,
  json_block: JsonBlockPart,
} as const;

function rendererFor(part: MessageRenderPart) {
  return CONTENT_RENDERERS[part.kind] ?? PlainTextPart;
}
</script>

<template>
  <div class="message-content">
    <component
      :is="rendererFor(part)"
      v-for="part in parts"
      :key="`${part.ordinal}:${part.kind}`"
      :content="part.content"
      :language="part.language"
      :ordinal="part.ordinal"
    />
  </div>
</template>
