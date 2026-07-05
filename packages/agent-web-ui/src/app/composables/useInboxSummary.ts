import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface InboxSummary {
  status: string;
  serverName: string | null;
  affordanceContract: Record<string, unknown> | null;
  envelopes: InboxEnvelopeCollection;
  nextEnvelope: Record<string, unknown> | null;
  doctor: Record<string, unknown> | null;
  errors: InboxSummaryError[];
  source: 'event' | 'none';
}

export interface InboxEnvelopeCollection {
  items: Record<string, unknown>[];
  count: number;
}

export interface InboxSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useInboxSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<InboxSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_inbox_summary') continue;
      return normalizeInboxSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeInboxSummary(record: Record<string, unknown>): InboxSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    affordanceContract: objectField(record.affordance_contract),
    envelopes: normalizeCollection(record.envelopes),
    nextEnvelope: objectField(record.next_envelope),
    doctor: objectField(record.doctor),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as InboxSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): InboxEnvelopeCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count };
}

function normalizeError(value: unknown): InboxSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return {
    code: stringField(record, 'code') ?? undefined,
    tool: stringField(record, 'tool') ?? undefined,
    message: stringField(record, 'message') ?? undefined,
  };
}

function emptySummary(): InboxSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    affordanceContract: null,
    envelopes: { items: [], count: 0 },
    nextEnvelope: null,
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
