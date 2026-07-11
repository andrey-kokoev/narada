<script setup lang="ts">
import { computed } from 'vue';
import CodeBlockPart from './CodeBlockPart.vue';
import ArtifactReferencePart from './ArtifactReferencePart.vue';
import IntentRefPart from './IntentRefPart.vue';
import JsonBlockPart from './JsonBlockPart.vue';
import MarkdownTextPart from './MarkdownTextPart.vue';
import MermaidDiagramPart from './MermaidDiagramPart.vue';
import PlainTextPart from './PlainTextPart.vue';
import { buildMessageContentPipeline, rendererKeyFor } from '../../lib/contentPipeline';
import type { MessageRenderKind, MessageRenderPart } from '../../lib/messageContent';

const props = defineProps<{ content: unknown; sessionId?: string | null }>();
const emit = defineEmits<{ 'intent-selected': [intent: string] }>();
const pipeline = computed(() => buildMessageContentPipeline(props.content));
const parts = computed(() => pipeline.value.parts);
const CONTENT_RENDERERS = {
  plain_text: PlainTextPart,
  markdown: MarkdownTextPart,
  code_block: CodeBlockPart,
  artifact_ref: ArtifactReferencePart,
  intent_ref: IntentRefPart,
  mermaid_diagram: MermaidDiagramPart,
  json_block: JsonBlockPart,
} as const;

function rendererFor(part: MessageRenderPart) {
  return CONTENT_RENDERERS[rendererKeyFor(part)] ?? PlainTextPart;
}
</script>

<template>
  <div class="message-content">
    <component
      :is="rendererFor(part)"
      v-for="part in parts"
      :key="`${part.ordinal}:${part.kind}`"
      :content="part.content"
      :artifact="part.artifact"
      :intent="part.kind === 'intent_ref' ? part.intent : undefined"
      :session-id="props.sessionId"
      :language="part.language"
      :ordinal="part.ordinal"
      @intent-selected="emit('intent-selected', $event)"
    />
  </div>
</template>
