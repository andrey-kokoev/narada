import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface DelegationSummary {
  status: string;
  workerServerName: string | null;
  delegatedTaskServerName: string | null;
  affordanceContract: Record<string, unknown> | null;
  posture: Record<string, unknown>;
  workers: DelegationCollection;
  delegatedTasks: DelegationCollection;
  errors: DelegationSummaryError[];
  source: 'event' | 'none';
}

export interface DelegationCollection {
  items: Record<string, unknown>[];
  count: number;
  dashboard?: Record<string, unknown> | null;
}

export interface DelegationSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useDelegationSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<DelegationSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_delegation_summary') continue;
      return normalizeDelegationSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeDelegationSummary(record: Record<string, unknown>): DelegationSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    workerServerName: stringField(record, 'worker_server_name') ?? stringField(record, 'workerServerName'),
    delegatedTaskServerName: stringField(record, 'delegated_task_server_name') ?? stringField(record, 'delegatedTaskServerName'),
    affordanceContract: objectField(record.affordance_contract),
    posture: objectField(record.posture) ?? {},
    workers: normalizeCollection(record.workers),
    delegatedTasks: normalizeCollection(record.delegated_tasks),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as DelegationSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): DelegationCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count, dashboard: objectField(record?.dashboard) };
}

function normalizeError(value: unknown): DelegationSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return { code: stringField(record, 'code') ?? undefined, tool: stringField(record, 'tool') ?? undefined, message: stringField(record, 'message') ?? undefined };
}

function emptySummary(): DelegationSummary {
  return {
    status: 'not_loaded',
    workerServerName: null,
    delegatedTaskServerName: null,
    affordanceContract: null,
    posture: {},
    workers: { items: [], count: 0, dashboard: null },
    delegatedTasks: { items: [], count: 0 },
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
