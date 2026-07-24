import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface SurfaceFeedbackSummary {
  status: string;
  serverName: string | null;
  stats: Record<string, unknown>;
  feedback: SurfaceFeedbackCollection;
  doctor: Record<string, unknown> | null;
  errors: SurfaceFeedbackSummaryError[];
  source: 'event' | 'none';
}

export interface SurfaceFeedbackCollection {
  items: Record<string, unknown>[];
  count: number;
  limit: number;
  offset: number;
}

export interface SurfaceFeedbackSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useSurfaceFeedbackSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<SurfaceFeedbackSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_surface_feedback_summary') continue;
      return normalizeSurfaceFeedbackSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeSurfaceFeedbackSummary(record: Record<string, unknown>): SurfaceFeedbackSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    stats: objectField(record.stats) ?? {},
    feedback: normalizeCollection(record.feedback),
    doctor: objectField(record.doctor),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as SurfaceFeedbackSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): SurfaceFeedbackCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  return {
    items,
    count: numberField(record, 'count') ?? items.length,
    limit: numberField(record, 'limit') ?? 25,
    offset: numberField(record, 'offset') ?? 0,
  };
}

function normalizeError(value: unknown): SurfaceFeedbackSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return { code: stringField(record, 'code') ?? undefined, tool: stringField(record, 'tool') ?? undefined, message: stringField(record, 'message') ?? undefined };
}

function emptySummary(): SurfaceFeedbackSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    stats: { total: 0, by_surface: {}, by_kind: {}, by_status: {} },
    feedback: { items: [], count: 0, limit: 25, offset: 0 },
    doctor: null,
    errors: [],
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
