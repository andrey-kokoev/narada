import type { NarsEvent, NarsProtocolFrame, PendingInput, InputDeliveryPhase } from '../types.js';

function eventRequestId(event: NarsEvent): string | null {
  for (const key of ['request_id', 'input_event_id', 'idempotency_key']) {
    const value = event[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function phaseForEvent(event: NarsEvent): InputDeliveryPhase | null {
  switch (event.event) {
    case 'runtime_request_state_transition': {
      const state = String(event.request_state ?? event.state ?? '').toLowerCase();
      if (['failed', 'rejected', 'refused'].includes(state)) return 'durable_rejected';
      if (['completed', 'succeeded'].includes(state)) return 'completed';
      if (['admitted', 'accepted', 'started', 'running', 'queued'].includes(state)) return 'durable_admitted';
      return null;
    }
    case 'session_control_rejected':
    case 'input_dropped_by_operator':
    case 'input_abandoned_on_session_end':
      return 'durable_rejected';
    case 'session_control_accepted':
    case 'conversation_enqueue_requested':
    case 'input_event_queued':
    case 'input_queued_for_turn_boundary':
    case 'input_admitted_to_turn':
      return 'durable_admitted';
    case 'input_event_completed':
    case 'input_completed':
      return 'completed';
    default:
      return null;
  }
}

export class PendingInputLedger {
  private readonly entries = new Map<string, PendingInput>();

  admit(frame: NarsProtocolFrame, content: string, deliveryMode: PendingInput['deliveryMode'], now = new Date()): PendingInput {
    const params = frame.params ?? {};
    const key = typeof params.idempotency_key === 'string' ? params.idempotency_key : frame.id;
    const entry: PendingInput = {
      requestId: frame.id,
      idempotencyKey: key,
      content,
      phase: 'created',
      deliveryMode,
      createdAt: now.toISOString(),
    };
    this.entries.set(frame.id, entry);
    this.entries.set(key, entry);
    return entry;
  }

  mark(frameId: string, phase: InputDeliveryPhase, eventKind?: string): PendingInput | null {
    const current = this.entries.get(frameId);
    if (!current) return null;
    const next = { ...current, phase, ...(eventKind ? { lastEventKind: eventKind } : {}) };
    this.entries.set(current.requestId, next);
    this.entries.set(current.idempotencyKey, next);
    return next;
  }

  observe(event: NarsEvent): PendingInput | null {
    const key = eventRequestId(event);
    if (!key) return null;
    const phase = phaseForEvent(event);
    if (!phase) return null;
    return this.mark(key, phase, event.event);
  }

  get(key: string): PendingInput | null {
    return this.entries.get(key) ?? null;
  }

  snapshot(): PendingInput[] {
    return [...new Map([...this.entries.values()].map((entry) => [entry.requestId, entry])).values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

export function deliveryModeFromFrame(frame: NarsProtocolFrame): PendingInput['deliveryMode'] {
  return frame.params?.delivery_mode === 'admit_after_active_turn'
    ? 'admit_after_active_turn'
    : 'immediate';
}

