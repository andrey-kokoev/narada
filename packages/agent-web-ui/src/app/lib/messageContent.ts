import { parseMessageContent as parseCanonicalMessageContent } from '../../content-pipeline.ts';

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

export interface MessageRenderPart {
  kind: MessageRenderKind;
  content: string;
  artifact?: ArtifactRefContent;
  intent?: IntentRefContent;
  language?: string;
  ordinal: number;
}

export function parseMessageContent(content: unknown): MessageRenderPart[] {
  return parseCanonicalMessageContent(content) as MessageRenderPart[];
}
