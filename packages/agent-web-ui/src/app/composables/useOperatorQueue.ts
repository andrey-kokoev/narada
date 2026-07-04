import { computed, type Ref } from 'vue';
import type { OperatorQueueItem } from './useOperatorInput';

export function useOperatorQueue(healthBody: Ref<Record<string, unknown> | null>) {
  const items = computed<OperatorQueueItem[]>(() => {
    const queue = objectField(healthBody.value, 'operator_input_queue');
    const rawItems = Array.isArray(queue?.items) ? queue.items : [];
    return rawItems
      .map(normalizeQueueItem)
      .filter((item): item is OperatorQueueItem => Boolean(item?.content));
  });
  return { items };
}

function normalizeQueueItem(value: unknown): OperatorQueueItem | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const index = Number(record.index);
  if (!Number.isInteger(index) || index < 1) return null;
  return {
    index,
    event_id: stringField(record, 'event_id'),
    content: stringField(record, 'content') ?? '',
    source: stringField(record, 'source'),
    delivery_mode: stringField(record, 'delivery_mode'),
    created_at: stringField(record, 'created_at'),
  };
}

function objectField(record: Record<string, unknown> | null, field: string): Record<string, unknown> | null {
  const value = record?.[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}
