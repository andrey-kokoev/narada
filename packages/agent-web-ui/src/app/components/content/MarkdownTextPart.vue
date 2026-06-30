<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { computed } from 'vue';
import RenderedPartFrame from './RenderedPartFrame.vue';

const props = defineProps<{
  content: string;
  language?: string;
  ordinal?: number;
}>();

const markdown = new MarkdownIt('default', {
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});
markdown.enable(['backticks', 'fence']);

const renderedMarkdown = computed(() => annotateMarkdownTables(markdown.render(props.content)));

function annotateMarkdownTables(html: string) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (tableHtml) => {
    const headers = [...tableHtml.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((match) => escapeAttribute(stripTags(match[1] ?? '').trim()));
    if (headers.length === 0) return tableHtml;
    return tableHtml.replace(/<tr>([\s\S]*?)<\/tr>/g, (rowHtml) => {
      if (rowHtml.includes('<th>')) return rowHtml;
      let columnIndex = 0;
      return rowHtml.replace(/<td>/g, () => `<td data-label="${headers[columnIndex++] ?? ''}">`);
    });
  });
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, '');
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
</script>

<template>
  <RenderedPartFrame title="markdown" :source="content">
    <template #render>
      <div class="message-markdown" v-html="renderedMarkdown"></div>
    </template>
  </RenderedPartFrame>
</template>
