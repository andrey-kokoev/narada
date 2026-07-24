import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface TaskLifecycleSummary {
  status: string;
  serverName: string | null;
  agentId: string | null;
  affordanceContract: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  counts: Record<string, unknown>;
  inProgress: TaskLifecycleCollection;
  pendingReviews: TaskLifecycleCollection;
  obligations: TaskLifecycleCollection;
  errors: TaskLifecycleSummaryError[];
  source: 'event' | 'none';
}

export interface TaskLifecycleCollection {
  items: Record<string, unknown>[];
  count: number;
}

export interface TaskLifecycleSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useTaskLifecycleSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<TaskLifecycleSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_task_lifecycle_summary') continue;
      return normalizeTaskLifecycleSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeTaskLifecycleSummary(record: Record<string, unknown>): TaskLifecycleSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    agentId: stringField(record, 'agent_id') ?? stringField(record, 'agentId'),
    affordanceContract: objectField(record.affordance_contract),
    recommendation: objectField(record.recommendation),
    counts: objectField(record.counts) ?? {},
    inProgress: normalizeCollection(record.in_progress),
    pendingReviews: normalizeCollection(record.pending_reviews),
    obligations: normalizeCollection(record.obligations),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as TaskLifecycleSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): TaskLifecycleCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count };
}

function normalizeError(value: unknown): TaskLifecycleSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return {
    code: stringField(record, 'code') ?? undefined,
    tool: stringField(record, 'tool') ?? undefined,
    message: stringField(record, 'message') ?? undefined,
  };
}

function emptySummary(): TaskLifecycleSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    agentId: null,
    affordanceContract: null,
    recommendation: null,
    counts: {},
    inProgress: { items: [], count: 0 },
    pendingReviews: { items: [], count: 0 },
    obligations: { items: [], count: 0 },
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
