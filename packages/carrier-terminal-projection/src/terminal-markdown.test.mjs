import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerminalStyle } from './terminal-style.mjs';
import {
  createMarkdownStreamState,
  normalizeDisplayTerms,
  renderMarkdownForTerminal,
  renderMarkdownStreamChunk,
  styleInlineMarkdown,
} from './terminal-markdown.mjs';

test('terminal markdown renders headings, bullets, tables, code, and bold orthogonally', () => {
  const style = createTerminalStyle({ enabled: true });
  const rendered = renderMarkdownForTerminal('# Heading\n- facade_only\n| A | B |\n|---|---|\n| **one** | `**two**` |', style);
  const plain = rendered.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  assert.equal(plain, 'Heading\n• facade_only\nA    B      \none  **two**');
  assert.equal(rendered.includes('\x1b[1mone\x1b[0m'), true);
  assert.equal(rendered.includes('\x1b[90m**two**\x1b[0m'), true);
});

test('terminal inline markdown preserves markdown markers inside inline code', () => {
  const style = createTerminalStyle({ enabled: true });
  const rendered = styleInlineMarkdown('Use **bold** and `**code**`.', style);
  assert.equal(rendered.includes('\x1b[1mbold\x1b[0m'), true);
  assert.equal(rendered.includes('\x1b[90m**code**\x1b[0m'), true);
});

test('terminal markdown renders indented triple-backtick code blocks as code', () => {
  const style = createTerminalStyle({ enabled: true });
  const rendered = renderMarkdownForTerminal('  ```text\n  do everything atomically or roll everything back\n  ```', style);
  assert.equal(rendered.includes('```'), false);
  assert.equal(rendered.includes('text'), false);
  assert.equal(rendered.includes('\x1b[90m  do everything atomically or roll everything back\x1b[0m'), true);
  assert.equal(rendered.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, ''), '  do everything atomically or roll everything back');
});

test('terminal markdown stream renders fenced code across chunks', () => {
  const style = createTerminalStyle({ enabled: true });
  const state = createMarkdownStreamState();
  assert.equal(renderMarkdownStreamChunk('```text', state, style), '');
  const rendered = renderMarkdownStreamChunk('do everything atomically or roll everything back', state, style);
  assert.equal(rendered.includes('\x1b[90m  do everything atomically or roll everything back\x1b[0m'), true);
  assert.equal(renderMarkdownStreamChunk('```', state, style), '');
});

test('terminal display term normalization ignores inline code', () => {
  assert.equal(normalizeDisplayTerms('authority_locus: narada_proper and `facade_only`'), 'authority locus: `narada_proper` and `facade_only`');
});
