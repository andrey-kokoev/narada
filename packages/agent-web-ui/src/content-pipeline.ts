import { renderOperatorValue } from '@narada2/agent-identity';
import { isRecord, type UnknownRecord } from './types.ts';

export type MessageContentPart = {
  kind: string;
  content: string;
  ordinal: number;
  language?: string;
  artifact?: UnknownRecord;
  intent?: UnknownRecord;
};

type FencedBlock = {
  start: number;
  end: number;
  language: string;
  content: string;
};

const FENCE_PATTERN = /(^|\n)```([^\n`]*)\n([\s\S]*?)\n```(?=\n|$)/g;

export function parseMessageContent(content: unknown): MessageContentPart[] {
  if (Array.isArray(content)) return parseStructuredMessageContent(content);
  const text = String(content ?? '');
  if (!text) return [];

  const parts: MessageContentPart[] = [];
  let cursor = 0;
  let ordinal = 0;
  for (const block of fencedBlocks(text)) {
    ordinal = appendTextPart(parts, text.slice(cursor, block.start), ordinal);
    const language = normalizeFenceLanguage(block.language);
    parts.push({
      kind: renderKindForFence(language, block.content),
      language: language || undefined,
      content: block.content,
      ordinal,
    });
    ordinal += 1;
    cursor = block.end;
  }
  appendTextPart(parts, text.slice(cursor), ordinal);
  return parts;
}

function parseStructuredMessageContent(content: readonly unknown[]): MessageContentPart[] {
  const parts: MessageContentPart[] = [];
  let ordinal = 0;
  for (const part of content) {
    if (!isRecord(part)) {
      ordinal = appendTextPart(parts, String(part ?? ''), ordinal);
      continue;
    }
    const typed = part;
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
      const args = isRecord(typed.args) ? { args: typed.args } : {};
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
          ...args,
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
      const language = normalizeFenceLanguage(typed.language ?? '');
      parts.push({
        kind: renderKindForFence(language, typed.text),
        content: typed.text,
        language: language || undefined,
        ordinal,
      });
      ordinal += 1;
      continue;
    }
    ordinal = appendTextPart(parts, renderOperatorValue(typed, { mode: 'block' }), ordinal);
  }
  return parts;
}

function appendTextPart(parts: MessageContentPart[], content: unknown, ordinal: number): number {
  const trimmed = trimOuterBlankLines(String(content ?? ''));
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
    blocks.push({
      start: Number(match.index) + leadingBreak.length,
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

function textRenderKind(content: string): string {
  return /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|^\s*>\s+|^\s*#{1,6}\s+|^\s*\|.+\|\s*$|(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\||(?:^|\n)\s*-{3,}\s*(?=\n|$)|(?:^|\n)\s*[-*+]\s+|(?:^|\n)\s*\d+\.\s+)/m.test(content)
    ? 'markdown'
    : 'plain_text';
}

function renderKindForFence(language: string, content: string): string {
  if (language === 'mermaid') return 'mermaid_diagram';
  if (language === 'json' || (!language && looksLikeJson(content))) return 'json_block';
  return 'code_block';
}

function looksLikeJson(content: unknown): boolean {
  const trimmed = String(content ?? '').trim();
  if (!trimmed || !['{', '['].includes(trimmed[0] ?? '')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function normalizeFenceLanguage(language: unknown): string {
  return String(language ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function trimOuterBlankLines(value: string): string {
  return value.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
}
