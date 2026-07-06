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
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const intent = intentFromLink(token.attrGet('href'));
  if (!intent) return self.renderToken(tokens, index, options);
  const attrs = [
    'type="button"',
    'class="markdown-intent-button"',
    `data-intent="${escapeAttribute(intent)}"`,
  ];
  const title = token.attrGet('title');
  if (title) attrs.push(`title="${escapeAttribute(title)}"`);
  return `<button ${attrs.join(' ')}>`;
};
markdown.renderer.rules.link_close = (tokens, index, options, env, self) => {
  if (!isIntentLink(tokens, index)) return self.renderToken(tokens, index, options);
  return '</button>';
};

const renderedMarkdown = computed(() => annotateMarkdownTables(markdown.render(props.content)));

interface MarkdownTokenLike {
  type?: string;
  attrGet?(name: string): string | null;
}

function handleMarkdownClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest?.('[data-intent]') as HTMLElement | null;
  if (!button) return;
  const intent = button.dataset.intent?.trim();
  if (!intent) return;
  event.preventDefault();
  event.stopPropagation();
  void navigator.clipboard.writeText(intent)
    .then(() => flashIntent(button, 'copied'))
    .catch(() => flashIntent(button, 'failed'));
}

function flashIntent(button: HTMLElement, status: 'copied' | 'failed') {
  button.dataset.status = status;
  window.setTimeout(() => {
    if (button.dataset.status === status) delete button.dataset.status;
  }, 1200);
}

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
  return value.replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function intentFromLink(href: string | null | undefined) {
  const value = String(href ?? '').trim();
  const intent = value.match(/^(?:narada-)?intent:(.+)$/i)?.[1]?.trim() ?? '';
  return intent || null;
}

function isIntentLink(tokens: MarkdownTokenLike[], index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor]?.type === 'link_open') return Boolean(intentFromLink(tokens[cursor]?.attrGet?.('href')));
    if (tokens[cursor]?.type === 'link_close') return false;
  }
  return false;
}
</script>

<template>
  <RenderedPartFrame title="markdown" :source="content">
    <template #render>
      <div class="message-markdown" v-html="renderedMarkdown" @click="handleMarkdownClick"></div>
    </template>
  </RenderedPartFrame>
</template>
