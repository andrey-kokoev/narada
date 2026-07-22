import type { NarsEvent } from '../types.js';
import { messageData } from './transport.js';

export function durableEventSequence(event: NarsEvent | null | undefined): number | null {
  const value = Number(event?.event_sequence ?? event?.sequence);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function durableEventIdentity(event: NarsEvent | null | undefined): string | null {
  const eventId = event?.event_id;
  if (typeof eventId === 'string' && eventId.trim()) return `event_id:${eventId.trim()}`;
  const sequence = durableEventSequence(event);
  return sequence === null ? null : `sequence:${sequence}`;
}

export function unwrapIncomingMessage(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const message = value as Record<string, unknown>;
  if (message.schema === 'narada.nars.events.envelope.v1' && message.payload && typeof message.payload === 'object') {
    return message.payload;
  }
  if (message.event === 'session_event' && message.payload && typeof message.payload === 'object') {
    return message.payload;
  }
  return value;
}

export function extractDurableEvents(value: unknown): NarsEvent[] {
  let parsed: unknown = value;
  if (typeof value === 'string' || value instanceof ArrayBuffer || ArrayBuffer.isView(value)
    || (value && typeof value === 'object' && 'data' in value)) {
    try {
      parsed = JSON.parse(messageData(value));
    } catch {
      return [];
    }
  }
  parsed = unwrapIncomingMessage(parsed);
  if (!parsed || typeof parsed !== 'object') return [];
  const message = parsed as Record<string, unknown>;
  const result = message.result && typeof message.result === 'object'
    ? message.result as Record<string, unknown>
    : null;
  const candidates = result?.events ?? message.events;
  if (Array.isArray(candidates)) {
    return candidates.flatMap((candidate) => extractDurableEvents(candidate));
  }
  if (typeof message.event === 'string') return [message as NarsEvent];
  return [];
}

export function isReplayCompletedEvent(event: NarsEvent): boolean {
  return event.event === 'session_events_replay_completed';
}

export function isSessionClosedEvent(event: NarsEvent): boolean {
  return event.event === 'session_closed';
}
