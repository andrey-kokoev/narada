import { renderOperatorValue } from '@narada2/agent-identity';

const FENCE_PATTERN = /(^|\n)```([^\n`]*)\n([\s\S]*?)\n```(?=\n|$)/g;

export function parseMessageContent(content) {
  if (Array.isArray(content)) return parseStructuredMessageContent(content);
  const text = String(content ?? '');
  if (!text) return [];

  const parts = [];
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

function parseStructuredMessageContent(content) {
  const parts = [];
  let ordinal = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') {
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
          ...(typed.args && typeof typed.args === 'object' && !Array.isArray(typed.args)
            ? { args: typed.args }
            : {}),
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

function appendTextPart(parts, content, ordinal) {
  const trimmed = trimOuterBlankLines(String(content ?? ''));
  if (!trimmed) return ordinal;
  const normalized = normalizeTextPart(trimmed);
  parts.push({ kind: textRenderKind(normalized), content: normalized, ordinal });
  return ordinal + 1;
}

function fencedBlocks(text) {
  const blocks = [];
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

function normalizeTextPart(content) {
  return content.replace(/^\s*(markdown|md)\s*\r?\n/i, '');
}

function textRenderKind(content) {
  return /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|^\s*>\s+|^\s*#{1,6}\s+|^\s*\|.+\|\s*$|(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\||(?:^|\n)\s*-{3,}\s*(?=\n|$)|(?:^|\n)\s*[-*+]\s+|(?:^|\n)\s*\d+\.\s+)/m.test(content)
    ? 'markdown'
    : 'plain_text';
}

function renderKindForFence(language, content) {
  if (language === 'mermaid') return 'mermaid_diagram';
  if (language === 'json' || (!language && looksLikeJson(content))) return 'json_block';
  return 'code_block';
}

function looksLikeJson(content) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function normalizeFenceLanguage(language) {
  return String(language ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function trimOuterBlankLines(value) {
  return value.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
}
