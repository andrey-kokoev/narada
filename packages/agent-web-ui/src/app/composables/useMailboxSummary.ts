import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface MailboxSummary {
  status: string;
  serverName: string | null;
  affordanceContract: Record<string, unknown> | null;
  accounts: MailboxCollection;
  messages: MailboxCollection;
  unread: { count: number };
  doctor: Record<string, unknown> | null;
  errors: MailboxSummaryError[];
  source: 'event' | 'none';
}

export interface MailboxCollection {
  items: Record<string, unknown>[];
  count: number;
}

export interface MailboxSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useMailboxSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<MailboxSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_mailbox_summary') continue;
      return normalizeMailboxSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeMailboxSummary(record: Record<string, unknown>): MailboxSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    affordanceContract: objectField(record.affordance_contract),
    accounts: normalizeCollection(record.accounts),
    messages: normalizeCollection(record.messages),
    unread: normalizeUnread(record.unread),
    doctor: objectField(record.doctor),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as MailboxSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): MailboxCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count };
}

function normalizeUnread(value: unknown): { count: number } {
  const record = objectField(value);
  return { count: numberField(record, 'count') ?? 0 };
}

function normalizeError(value: unknown): MailboxSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return {
    code: stringField(record, 'code') ?? undefined,
    tool: stringField(record, 'tool') ?? undefined,
    message: stringField(record, 'message') ?? undefined,
  };
}

function emptySummary(): MailboxSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    affordanceContract: null,
    accounts: { items: [], count: 0 },
    messages: { items: [], count: 0 },
    unread: { count: 0 },
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
