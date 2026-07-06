import { renderOperatorValue } from '@narada2/agent-identity';

export type MessageRenderKind = 'plain_text' | 'markdown' | 'code_block' | 'mermaid_diagram' | 'json_block' | 'artifact_ref' | 'intent_ref';

export interface ArtifactRefContent {
  type: 'artifact_ref';
  artifact_id: string;
  kind?: string;
  title?: string;
  render_hint?: string;
}

export interface IntentRefContent {
  type: 'intent_ref';
  intent: string;
  label?: string;
  description?: string;
  target?: string;
  action?: string;
  args?: Record<string, unknown>;
}

function parseStructuredMessageContent(content: unknown[]): MessageRenderPart[] {
  const parts: MessageRenderPart[] = [];
  let ordinal = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      ordinal = appendTextPart(parts, String(part ?? ''), ordinal);
      continue;
    }
    const typed = part as Record<string, unknown>;
    if (typed.type === 'artifact_ref' && typeof typed.artifact_id === 'string' && typed.artifact_id.trim()) {
      parts.push({
        kind: 'artifact_ref',
        content: typed.title ? String(typed.title) : typed.artifact_id,
        artifact: {
          type: 'artifact_ref',
          artifact_id: typed.artifact_id,
          ...(typed.kind ? { kind: String(typed.kind) } : {}),
          ...(typed.title ? { title: String(typed.title) } : {}),
          ...(typed.render_hint ? { render_hint: String(typed.render_hint) } : {}),
        },
        ordinal,
      });
      ordinal += 1;
      continue;
    }
    if (typed.type === 'intent_ref' && typeof typed.intent === 'string' && typed.intent.trim()) {
      parts.push({
        kind: 'intent_ref',
        content: typed.label ? String(typed.label) : typed.intent,
        intent: {
          type: 'intent_ref',
          intent: typed.intent.trim(),
          ...(typed.label ? { label: String(typed.label) } : {}),
          ...(typed.description ? { description: String(typed.description) } : {}),
          ...(typed.target ? { target: String(typed.target) } : {}),
          ...(typed.action ? { action: String(typed.action) } : {}),
          ...(typed.args && typeof typed.args === 'object' && !Array.isArray(typed.args) ? { args: typed.args as Record<string, unknown> } : {}),
        },
        ordinal,
      });
      ordinal += 1;
      continue;
    }
    if ((typed.type === 'markdown' || typed.type === 'text') && typeof typed.text === 'string') {
      ordinal = appendTextPart(parts, typed.text, ordinal);
      continue;
    }
    if (typed.type === 'code' && typeof typed.text === 'string') {
      parts.push({ kind: 'code_block', content: typed.text, language: typeof typed.language === 'string' ? typed.language : undefined, ordinal });
      ordinal += 1;
      continue;
    }
    ordinal = appendTextPart(parts, renderOperatorValue(typed, { mode: 'block' }), ordinal);
  }
  return parts;
}

export interface MessageRenderPart {
  kind: MessageRenderKind;
  content: string;
  artifact?: ArtifactRefContent;
  intent?: IntentRefContent;
  language?: string;
  ordinal: number;
}

interface FencedBlock {
  start: number;
  end: number;
  language: string;
  content: string;
}

const FENCE_PATTERN = /(^|\n)```([^\n`]*)\n([\s\S]*?)\n```(?=\n|$)/g;

export function parseMessageContent(content: unknown): MessageRenderPart[] {
  if (Array.isArray(content)) return parseStructuredMessageContent(content);
  const text = String(content ?? '');
  if (!text) return [];
  const parts: MessageRenderPart[] = [];
  let cursor = 0;
  let ordinal = 0;
  for (const block of fencedBlocks(text)) {
    const before = text.slice(cursor, block.start);
    ordinal = appendTextPart(parts, before, ordinal);
    const normalizedLanguage = normalizeFenceLanguage(block.language);
    parts.push({
      kind: renderKindForFence(normalizedLanguage, block.content),
      language: normalizedLanguage || undefined,
      content: block.content,
      ordinal,
    });
    ordinal += 1;
    cursor = block.end;
  }
  appendTextPart(parts, text.slice(cursor), ordinal);
  return parts;
}

function appendTextPart(parts: MessageRenderPart[], content: string, ordinal: number): number {
  const trimmed = trimOuterBlankLines(content);
  if (!trimmed) return ordinal;
  const normalized = normalizeTextPart(trimmed);
  parts.push({ kind: textRenderKind(normalized), content: normalized, ordinal });
  return ordinal + 1;
}

function fencedBlocks(text: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  FENCE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(FENCE_PATTERN)) {
    const leadingBreak = match[1] ?? '';
    const start = Number(match.index) + leadingBreak.length;
    blocks.push({
      start,
      end: Number(match.index) + match[0].length,
      language: match[2] ?? '',
      content: match[3] ?? '',
    });
  }
  return blocks;
}

function normalizeTextPart(content: string): string {
  return content.replace(/^\s*(markdown|md)\s*\r?\n/i, '');
}

function textRenderKind(content: string): MessageRenderKind {
  return /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|^\s*>\s+|^\s*#{1,6}\s+|^\s*\|.+\|\s*$|(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\||(?:^|\n)\s*-{3,}\s*(?=\n|$)|(?:^|\n)\s*[-*+]\s+|(?:^|\n)\s*\d+\.\s+)/m.test(content) ? 'markdown' : 'plain_text';
}

function renderKindForFence(language: string, content: string): MessageRenderKind {
  if (language === 'mermaid') return 'mermaid_diagram';
  if (language === 'json' || (!language && looksLikeJson(content))) return 'json_block';
  return 'code_block';
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function normalizeFenceLanguage(language: string): string {
  return String(language ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function trimOuterBlankLines(value: string): string {
  return value.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
}
