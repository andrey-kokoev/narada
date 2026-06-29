<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { computed } from 'vue';
import RenderedPartFrame from './RenderedPartFrame.vue';

const props = defineProps<{
  content: string;
  language?: string;
  ordinal?: number;
}>();

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

const renderedMarkdown = computed(() => markdown.render(props.content));
</script>

<template>
  <RenderedPartFrame title="markdown" :source="content" source-language="markdown">
    <template #render>
      <div class="message-markdown" v-html="renderedMarkdown"></div>
    </template>
  </RenderedPartFrame>
</template>
