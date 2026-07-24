import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface SopSummary {
  status: string;
  serverName: string | null;
  affordanceContract: Record<string, unknown> | null;
  templates: SopCollection;
  runs: SopCollection;
  activeRun: Record<string, unknown> | null;
  recentRuns: SopCollection;
  doctor: Record<string, unknown> | null;
  errors: SopSummaryError[];
  source: 'event' | 'none';
}

export interface SopCollection {
  items: Record<string, unknown>[];
  count: number;
}

export interface SopSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useSopSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<SopSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_sop_summary') continue;
      return normalizeSopSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeSopSummary(record: Record<string, unknown>): SopSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    affordanceContract: objectField(record.affordance_contract),
    templates: normalizeCollection(record.templates),
    runs: normalizeCollection(record.runs),
    activeRun: objectField(record.active_run),
    recentRuns: normalizeCollection(record.recent_runs),
    doctor: objectField(record.doctor),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as SopSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): SopCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count };
}

function normalizeError(value: unknown): SopSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return {
    code: stringField(record, 'code') ?? undefined,
    tool: stringField(record, 'tool') ?? undefined,
    message: stringField(record, 'message') ?? undefined,
  };
}

function emptySummary(): SopSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    affordanceContract: null,
    templates: { items: [], count: 0 },
    runs: { items: [], count: 0 },
    activeRun: null,
    recentRuns: { items: [], count: 0 },
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
