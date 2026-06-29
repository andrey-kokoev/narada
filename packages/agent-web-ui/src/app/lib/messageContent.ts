export type MessageRenderKind = 'plain_text' | 'markdown' | 'code_block' | 'mermaid_diagram' | 'json_block';

export interface MessageRenderPart {
  kind: MessageRenderKind;
  content: string;
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

export function parseMessageContent(content: string): MessageRenderPart[] {
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
  return /[*_`#>-]|^\s*\|.+\|\s*$|\n\s*\|?\s*:?-{3,}:?\s*\||\n\s*[-*+]\s+|\n\s*\d+\.\s+/m.test(content) ? 'markdown' : 'plain_text';
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
