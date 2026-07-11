import { parseMessageContent, type MessageRenderKind, type MessageRenderPart } from './messageContent';

/**
 * The browser content boundary: event summaries become ordered typed parts,
 * and the view layer only chooses a renderer for each admitted part kind.
 */
export const MESSAGE_RENDERER_KINDS: readonly MessageRenderKind[] = [
  'plain_text',
  'markdown',
  'code_block',
  'artifact_ref',
  'intent_ref',
  'mermaid_diagram',
  'json_block',
];

export interface MessageContentPipeline {
  sourceKind: 'structured' | 'text';
  parts: MessageRenderPart[];
  hasRenderableContent: boolean;
}

export function buildMessageContentPipeline(content: unknown): MessageContentPipeline {
  const parts = parseMessageContent(content);
  return {
    sourceKind: Array.isArray(content) ? 'structured' : 'text',
    parts,
    hasRenderableContent: parts.length > 0,
  };
}

export function rendererKeyFor(part: MessageRenderPart): MessageRenderKind {
  return MESSAGE_RENDERER_KINDS.includes(part.kind) ? part.kind : 'plain_text';
}
