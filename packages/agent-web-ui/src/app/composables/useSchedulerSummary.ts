import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface SchedulerSummary {
  status: string;
  serverName: string | null;
  affordanceContract: Record<string, unknown> | null;
  tasks: SchedulerCollection;
  posture: SchedulerPosture;
  errors: SchedulerSummaryError[];
  source: 'event' | 'none';
}

export interface SchedulerCollection {
  items: Record<string, unknown>[];
  count: number;
}

export interface SchedulerPosture {
  total: number;
  ready: number;
  running: number;
  disabled: number;
  unknown: number;
}

export interface SchedulerSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useSchedulerSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<SchedulerSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_scheduler_summary') continue;
      return normalizeSchedulerSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeSchedulerSummary(record: Record<string, unknown>): SchedulerSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    affordanceContract: objectField(record.affordance_contract),
    tasks: normalizeCollection(record.tasks),
    posture: normalizePosture(record.posture),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as SchedulerSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): SchedulerCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count };
}

function normalizePosture(value: unknown): SchedulerPosture {
  const record = objectField(value);
  return {
    total: numberField(record, 'total') ?? 0,
    ready: numberField(record, 'ready') ?? 0,
    running: numberField(record, 'running') ?? 0,
    disabled: numberField(record, 'disabled') ?? 0,
    unknown: numberField(record, 'unknown') ?? 0,
  };
}

function normalizeError(value: unknown): SchedulerSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return {
    code: stringField(record, 'code') ?? undefined,
    tool: stringField(record, 'tool') ?? undefined,
    message: stringField(record, 'message') ?? undefined,
  };
}

function emptySummary(): SchedulerSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    affordanceContract: null,
    tasks: { items: [], count: 0 },
    posture: { total: 0, ready: 0, running: 0, disabled: 0, unknown: 0 },
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
