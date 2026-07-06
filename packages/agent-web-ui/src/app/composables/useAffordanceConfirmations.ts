import { computed } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface AffordanceConfirmationItem {
  confirmationId: string;
  requestId: string | null;
  surfaceId: string | null;
  actionId: string | null;
  message: string | null;
  posture: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

const CONFIRMATION_REQUIRED_EVENT = 'session_affordance_confirmation_required';
const TERMINAL_EVENTS = new Set([
  'session_affordance_action_confirmed',
  'session_affordance_action_cancelled',
  'session_affordance_action_result',
  'session_affordance_action_refused',
]);

export function useAffordanceConfirmations(events: unknown[]) {
  const items = computed<AffordanceConfirmationItem[]>(() => {
    const pending = new Map<string, AffordanceConfirmationItem>();
    for (const message of events) {
      const event = objectValue(unwrapRuntimeEvent(message) ?? message);
      if (!event) continue;
      const eventName = stringField(event, 'event');
      const confirmationId = stringField(event, 'confirmation_id');
      if (eventName === CONFIRMATION_REQUIRED_EVENT && confirmationId) {
        pending.set(confirmationId, {
          confirmationId,
          requestId: stringField(event, 'request_id'),
          surfaceId: stringField(event, 'surface_id'),
          actionId: stringField(event, 'action_id'),
          message: stringField(event, 'message'),
          posture: stringField(event, 'posture'),
          createdAt: stringField(event, 'timestamp') ?? stringField(event, 'created_at'),
          expiresAt: stringField(event, 'expires_at'),
        });
      } else if (confirmationId && TERMINAL_EVENTS.has(eventName ?? '')) {
        pending.delete(confirmationId);
      }
    }
    return [...pending.values()];
  });
  return { items };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}
