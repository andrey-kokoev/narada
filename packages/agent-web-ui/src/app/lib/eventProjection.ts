import type { NarsClientProjectionVerbosity } from '@narada2/nars-client-projection-contract';
import { projectRuntimeEvent, shouldRenderRuntimeProjection } from '../../runtime-events.js';
import { summarizeValue } from './rawPayload';

export interface ProjectedEventRow {
  key: string;
  kind: string;
  label: string;
  tone: string;
  summary: string;
  event: unknown;
  renderKey?: string | null;
  streamContent?: string;
}

function normalizeAssistantText(value: string): string {
  return value.trim().replace(/\r\n/g, '\n');
}

export function projectEventRows(events: unknown[], verbosity: NarsClientProjectionVerbosity): ProjectedEventRow[] {
  const renderedByKey = new Map<string, ProjectedEventRow>();
  const order: string[] = [];
  for (const event of events) {
    const row = projectEventForRows(event, verbosity, renderedByKey, order);
    if (!row) continue;
    if (!order.includes(row.key)) order.push(row.key);
  }
  return order.map((key) => renderedByKey.get(key)).filter((row): row is ProjectedEventRow => Boolean(row));
}

function projectEventForRows(event: unknown, verbosity: NarsClientProjectionVerbosity, renderedByKey: Map<string, ProjectedEventRow>, order: string[]): ProjectedEventRow | null {
  let projection = projectRuntimeEvent(event);
  if (!shouldRenderRuntimeProjection(projection, { verbosity })) return null;
  const key = projection.renderKey ?? `event:${renderedByKey.size}`;
  if (projection.kind === 'assistant_message_stream') {
    const previous = renderedByKey.get(key)?.streamContent ?? '';
    const streamContent = `${previous}${summarizeValue(projection.summary)}`;
    projection = { ...projection, summary: streamContent, streamContent };
  }
  const row: ProjectedEventRow = {
    key,
    kind: String(projection.kind),
    label: String(projection.label),
    tone: String(projection.tone),
    summary: summarizeValue(projection.summary || projection.event),
    event: projection.event,
    renderKey: projection.renderKey,
    streamContent: projection.streamContent,
  };
  pruneSupersededAssistantStreams(row, renderedByKey, order);
  const duplicateKey = duplicateAssistantMessageKey(row, renderedByKey);
  if (duplicateKey) return null;
  renderedByKey.set(key, row);
  return row;
}

function duplicateAssistantMessageKey(row: ProjectedEventRow, renderedByKey: Map<string, ProjectedEventRow>): string | null {
  if (row.kind !== 'assistant_message') return null;
  const summary = normalizeAssistantText(row.summary);
  if (!summary) return null;
  for (const [key, prior] of renderedByKey) {
    if (prior.kind !== 'assistant_message') continue;
    if (!sameAssistantScope(prior.event, row.event)) continue;
    if (normalizeAssistantText(prior.summary) === summary) return key;
  }
  return null;
}

function pruneSupersededAssistantStreams(finalRow: ProjectedEventRow, renderedByKey: Map<string, ProjectedEventRow>, order: string[]): void {
  if (finalRow.kind !== 'assistant_message') return;
  for (const [key, prior] of renderedByKey) {
    if (prior.kind !== 'assistant_message_stream') continue;
    if (!sameAssistantScope(prior.event, finalRow.event)) continue;
    if (!finalRow.summary.startsWith(prior.summary)) continue;
    renderedByKey.delete(key);
    const index = order.indexOf(key);
    if (index >= 0) order.splice(index, 1);
  }
}

function sameAssistantScope(a: unknown, b: unknown): boolean {
  const left = eventScope(a);
  const right = eventScope(b);
  if (!left.agentId && !left.sessionId && !right.agentId && !right.sessionId) return true;
  return left.agentId === right.agentId && left.sessionId === right.sessionId;
}

function eventScope(value: unknown): { agentId: unknown; sessionId: unknown } {
  if (!value || typeof value !== 'object') return { agentId: null, sessionId: null };
  const event = value as { agent_id?: unknown; session_id?: unknown; agentId?: unknown; sessionId?: unknown };
  return {
    agentId: event.agent_id ?? event.agentId ?? null,
    sessionId: event.session_id ?? event.sessionId ?? null,
  };
}
