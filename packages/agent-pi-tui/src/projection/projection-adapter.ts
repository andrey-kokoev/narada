import {
  classifyNarsClientEventProjection,
  projectNarsClientEvent,
  shouldProjectNarsClientProjection,
} from '@narada2/nars-client-projection-contract';
import type { NarsEvent, PiRenderableContent, PiRowIdentity, PiRowViewModel, ProjectionClass } from '../types.js';
import { artifactContentFromEvent } from '../nars-client/artifact-client.js';

export interface ProjectionAdapterOptions {
  verbosity?: ProjectionClass;
  includeStateSamples?: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(',')}}`;
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sequenceOf(event: NarsEvent): number | undefined {
  const sequence = Number(event.event_sequence ?? event.sequence);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : undefined;
}

function identityOf(event: NarsEvent, kind: string): PiRowIdentity | undefined {
  const id = [event.event_id, event.request_id, event.turn_id, event.id]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const role = kind.includes('assistant') || kind.includes('provider_agent')
    ? 'assistant'
    : kind.includes('user') || kind.includes('operator')
      ? 'operator'
      : undefined;
  if (!id && !role) return undefined;
  return { ...(id ? { id } : {}), ...(role ? { role } : {}) };
}

function renderKeyOf(projection: { renderKey?: string; kind: string }, event: NarsEvent): string {
  if (projection.renderKey) return projection.renderKey;
  if (typeof event.event_id === 'string' && event.event_id.trim()) return `event:${event.event_id}`;
  const sequence = sequenceOf(event);
  if (sequence !== undefined) return `sequence:${sequence}`;
  return `${projection.kind}:${shortHash(stableStringify(event))}`;
}

function contentPart(value: unknown): PiRenderableContent | null {
  if (typeof value === 'string') return { type: 'text', text: value };
  if (!value || typeof value !== 'object') return null;
  const part = value as Record<string, unknown>;
  if (part.type === 'artifact_ref' && typeof part.artifact_id === 'string') {
    return {
      type: 'artifact_ref',
      artifact_id: part.artifact_id,
      ...(typeof part.kind === 'string' ? { kind: part.kind } : {}),
      ...(typeof part.title === 'string' ? { title: part.title } : {}),
      ...(typeof part.render_hint === 'string' ? { render_hint: part.render_hint } : {}),
    };
  }
  if (part.type === 'intent_ref' && typeof part.intent === 'string') {
    return {
      type: 'intent_ref',
      intent: part.intent,
      ...(typeof part.label === 'string' ? { label: part.label } : {}),
      ...(typeof part.description === 'string' ? { description: part.description } : {}),
      ...(typeof part.target === 'string' ? { target: part.target } : {}),
      ...(typeof part.action === 'string' ? { action: part.action } : {}),
    };
  }
  if (part.type === 'image' && typeof part.artifact_id === 'string') {
    return {
      type: 'image',
      artifact_id: part.artifact_id,
      ...(typeof part.mime_type === 'string' ? { mime_type: part.mime_type } : {}),
      ...(typeof part.alt === 'string' ? { alt: part.alt } : {}),
    };
  }
  return { type: 'text', text: stableStringify(value) };
}

function contentOf(summary: unknown, event: NarsEvent): PiRenderableContent[] {
  const summaryParts = Array.isArray(summary)
    ? summary.flatMap((part) => {
        const normalized = contentPart(part);
        return normalized ? [normalized] : [];
      })
    : (() => {
        const normalized = contentPart(summary);
        return normalized ? [normalized] : [];
      })();
  const artifactParts = artifactContentFromEvent(event);
  if (summaryParts.length > 0 || artifactParts.length > 0) {
    const combined = [...summaryParts, ...artifactParts];
    return combined.filter((part, index) => combined.findIndex((candidate) => stableStringify(candidate) === stableStringify(part)) === index);
  }
  return [{ type: 'text', text: String(event.message ?? event.event ?? '') }];
}

function statusOf(event: NarsEvent): string | undefined {
  for (const key of ['terminal_state', 'request_state', 'status', 'state', 'reconfiguration_state']) {
    const value = event[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function pendingOf(kind: string, event: NarsEvent): boolean {
  if (kind === 'assistant_message_stream') return event.done !== true && event.terminal !== true;
  const state = statusOf(event)?.toLowerCase();
  return state !== undefined && ['queued', 'running', 'pending', 'started', 'awaiting_confirmation'].includes(state);
}

function terminalOf(kind: string, event: NarsEvent): boolean {
  if (event.terminal === true) return true;
  if (['assistant_message', 'tool_result', 'turn_complete', 'turn_failed', 'session_closed', 'input_completed', 'input_event_completed'].includes(kind)) return true;
  const state = statusOf(event)?.toLowerCase();
  return state !== undefined && ['completed', 'complete', 'failed', 'rejected', 'refused', 'cancelled', 'interrupted'].includes(state);
}

export function piRowViewModelFromNarsEvent(event: NarsEvent, options: ProjectionAdapterOptions = {}): PiRowViewModel | null {
  const projection = projectNarsClientEvent(event);
  if (!shouldProjectNarsClientProjection(projection, options)) return null;
  const projectionClass = classifyNarsClientEventProjection(projection) as ProjectionClass;
  const kind = String(projection.kind ?? event.event ?? 'unknown');
  const pending = pendingOf(kind, event);
  const terminal = terminalOf(kind, event);
  return {
    renderKey: renderKeyOf(projection, event),
    projectionClass,
    kind,
    ...(identityOf(event, kind) ? { identity: identityOf(event, kind) } : {}),
    content: contentOf(projection.summary, event),
    ...(typeof projection.tone === 'string' ? { tone: projection.tone } : {}),
    ...(statusOf(event) ? { status: statusOf(event) } : {}),
    ...(typeof event.timestamp === 'string' ? { timestamp: event.timestamp } : {}),
    ...(sequenceOf(event) !== undefined ? { sequence: sequenceOf(event) } : {}),
    expandable: projectionClass !== 'conversation' || kind === 'tool_call' || kind === 'tool_result',
    expandedByDefault: projectionClass === 'conversation' && kind.startsWith('assistant'),
    pending,
    terminal,
    event,
  };
}

export class NarsProjectionAdapter {
  private readonly options: ProjectionAdapterOptions;

  constructor(options: ProjectionAdapterOptions = {}) {
    this.options = { verbosity: options.verbosity ?? 'conversation', includeStateSamples: options.includeStateSamples ?? false };
  }

  project(event: NarsEvent): PiRowViewModel | null {
    return piRowViewModelFromNarsEvent(event, this.options);
  }

  projectMany(events: readonly NarsEvent[]): PiRowViewModel[] {
    return events.flatMap((event) => {
      const row = this.project(event);
      return row ? [row] : [];
    });
  }
}

export function createProjectionAdapter(options: ProjectionAdapterOptions = {}): NarsProjectionAdapter {
  return new NarsProjectionAdapter(options);
}
