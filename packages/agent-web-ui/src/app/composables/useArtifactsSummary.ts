import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface ArtifactsSummary {
  status: string;
  sessionId: string | null;
  agentId: string | null;
  generatedAt: string | null;
  artifacts: ArtifactsCollection;
  counts: Record<string, unknown>;
  filters: Record<string, unknown>;
  error: string | null;
  source: 'event' | 'none';
}

export interface ArtifactsCollection {
  items: Record<string, unknown>[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  truncated: boolean;
}

export function useArtifactsSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<ArtifactsSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_artifacts_summary') continue;
      return normalizeArtifactsSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeArtifactsSummary(record: Record<string, unknown>): ArtifactsSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    sessionId: stringField(record, 'session_id') ?? stringField(record, 'sessionId'),
    agentId: stringField(record, 'agent_id') ?? stringField(record, 'agentId'),
    generatedAt: stringField(record, 'generated_at') ?? stringField(record, 'generatedAt'),
    artifacts: normalizeCollection(record.artifacts),
    counts: objectField(record.counts) ?? { by_kind: {}, by_state: {} },
    filters: objectField(record.filters) ?? {},
    error: stringField(record, 'error'),
    source: 'event',
  };
}

function normalizeCollection(value: unknown): ArtifactsCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  return {
    items,
    count: numberField(record, 'count') ?? items.length,
    total: numberField(record, 'total') ?? numberField(record, 'count') ?? items.length,
    limit: numberField(record, 'limit') ?? 25,
    offset: numberField(record, 'offset') ?? 0,
    truncated: booleanField(record, 'truncated') ?? false,
  };
}

function emptySummary(): ArtifactsSummary {
  return {
    status: 'not_loaded',
    sessionId: null,
    agentId: null,
    generatedAt: null,
    artifacts: { items: [], count: 0, total: 0, limit: 25, offset: 0, truncated: false },
    counts: { by_kind: {}, by_state: {} },
    filters: {},
    error: null,
    source: 'none',
  };
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}

function numberField(record: unknown, field: string): number | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanField(record: unknown, field: string): boolean | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'boolean' ? value : null;
}
