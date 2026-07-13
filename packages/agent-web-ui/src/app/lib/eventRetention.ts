import { sequenceFromRuntimeMessage } from '../../runtime-events.js';

export interface RetainedEventState {
  events: unknown[];
  droppedCount: number;
  maxEvents: number;
}

function normalizeRetainedEventLimit(maxEvents: number): number {
  if (!Number.isFinite(maxEvents) || maxEvents < 1) return DEFAULT_RETAINED_EVENT_LIMIT;
  return Math.max(1, Math.floor(maxEvents));
}

export const DEFAULT_RETAINED_EVENT_LIMIT = 500;

function sameRuntimeEventIdentity(left: unknown, right: unknown): boolean {
  const leftEvent = unwrapRetainedEvent(left);
  const rightEvent = unwrapRetainedEvent(right);
  return eventIdentity(leftEvent) === eventIdentity(rightEvent);
}

function unwrapRetainedEvent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const payload = record.event === 'session_event' && record.payload && typeof record.payload === 'object'
    ? record.payload
    : record;
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
}

function eventIdentity(event: Record<string, unknown> | null): string {
  if (!event) return 'null';
  const kind = String(event.event ?? event.event_kind ?? 'unknown');
  const requestId = event.request_id ?? event.input_event_id ?? event.turn_id ?? event.artifact_id ?? null;
  return `${kind}:${requestId ?? JSON.stringify(event)}`;
}

export function createRetainedEventState(maxEvents = DEFAULT_RETAINED_EVENT_LIMIT): RetainedEventState {
  return { events: [], droppedCount: 0, maxEvents: normalizeRetainedEventLimit(maxEvents) };
}

export function retainEvent(state: RetainedEventState, event: unknown): void {
  const sequence = sequenceFromRuntimeMessage(event);
  if (sequence === null) {
    state.events.push(event);
    trimRetainedEvents(state);
    return;
  }
  const existingIndex = state.events.findIndex((retained) => sequenceFromRuntimeMessage(retained) === sequence && sameRuntimeEventIdentity(retained, event));
  if (existingIndex !== -1) {
    state.events.splice(existingIndex, 1, event);
    return;
  }
  const insertIndex = state.events.findIndex((retained) => {
    const retainedSequence = sequenceFromRuntimeMessage(retained);
    return retainedSequence !== null && retainedSequence > sequence;
  });
  if (insertIndex === -1) state.events.push(event);
  else state.events.splice(insertIndex, 0, event);
  trimRetainedEvents(state);
}

export function retainEvents(state: RetainedEventState, events: unknown[]): void {
  for (const event of events) retainEvent(state, event);
}

export function oldestRetainedSequence(state: RetainedEventState): number | null {
  for (const event of state.events) {
    const sequence = sequenceFromRuntimeMessage(event);
    if (sequence !== null) return sequence;
  }
  return null;
}

export function newestRetainedSequence(state: RetainedEventState): number | null {
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const sequence = sequenceFromRuntimeMessage(state.events[index]);
    if (sequence !== null) return sequence;
  }
  return null;
}

function trimRetainedEvents(state: RetainedEventState): void {
  if (!Number.isFinite(state.maxEvents)) return;
  while (state.events.length > state.maxEvents) {
    state.events.shift();
    state.droppedCount += 1;
  }
}

export function clearRetainedEvents(state: RetainedEventState): void {
  state.events.splice(0);
  state.droppedCount = 0;
}
