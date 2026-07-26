import { eventMatchesNarsFilters } from './event-log.js';
import type { NarsEventFilters, NarsSessionEvent } from './event-log.js';
import { createNarsEventAttachmentStateMachine } from './event-attachment-state.js';
import type { NaradaEventAttachmentStateMachine, NaradaEventAttachmentTransition } from './event-attachment-state.js';

export interface NaradaEventHubEnvelope {
  schema: 'narada.nars.events.envelope.v1';
  event: 'session_event';
  subscription_id: string;
  cursor: { sequence: number; next_sequence: number };
  payload: NarsSessionEvent;
}

export interface NaradaEventHubSubscription {
  subscriptionId: string;
  readonly state: string;
  readonly stateHistory: NaradaEventAttachmentTransition[];
  beginReplay(evidence?: Record<string, unknown>): NaradaEventAttachmentTransition;
  markLive(evidence?: Record<string, unknown>): void;
  fail(evidence?: Record<string, unknown>): void;
  unsubscribe(reason?: string): void;
}

interface InternalSubscription {
  filters: NarsEventFilters;
  send: (envelope: NaradaEventHubEnvelope) => void;
  lifecycle: NaradaEventAttachmentStateMachine;
  pending: NarsSessionEvent[];
  fail(evidence?: Record<string, unknown>): void;
  deliver(event: NarsSessionEvent, assignedSequence: number): void;
}

export interface NaradaEventHub {
  publish(event: NarsSessionEvent | null | undefined): NarsSessionEvent | null;
  subscribe(options: { subscriptionId?: string; filters?: NarsEventFilters; send: (envelope: NaradaEventHubEnvelope) => void }): NaradaEventHubSubscription;
  replayFor(options?: { sinceSequence?: number | string | null; sinceTimestamp?: string | null; filters?: NarsEventFilters; maxReplay?: number | string | null }): NarsSessionEvent[];
  cursor(): { last_sequence: number | null; next_sequence: number };
  subscriberCount(): number;
}

export function createNarsEventHub({ maxBuffer = 1000 }: { maxBuffer?: number } = {}): NaradaEventHub {
  const buffer: NarsSessionEvent[] = [];
  const subscribers = new Map<string, InternalSubscription>();
  let sequence = 0;
  const replayFor = ({ sinceSequence = null, sinceTimestamp = null, filters = {}, maxReplay = 100 }: { sinceSequence?: number | string | null; sinceTimestamp?: string | null; filters?: NarsEventFilters; maxReplay?: number | string | null } = {}): NarsSessionEvent[] => {
    const sinceSeq = sinceSequence == null ? null : Number.parseInt(String(sinceSequence), 10);
    const sinceTime = sinceTimestamp ? Date.parse(String(sinceTimestamp)) : null;
    const parsedMaxReplay = Number.parseInt(String(maxReplay), 10);
    const replayLimit = Math.max(0, Math.min(Number.isFinite(parsedMaxReplay) ? parsedMaxReplay : 100, maxBuffer));
    const replay = buffer.filter((event) => {
      if (sinceSeq !== null && Number.isFinite(sinceSeq) && Number(event.event_sequence ?? event.sequence ?? 0) <= sinceSeq) return false;
      if (sinceTime !== null && Number.isFinite(sinceTime)) {
        const eventTime = Date.parse(String(event.timestamp ?? event.generated_at ?? ''));
        if (Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
      }
      return eventMatchesNarsFilters(event, filters);
    });
    return replayLimit === 0 ? [] : replay.slice(-replayLimit);
  };
  return {
    publish(event: NarsSessionEvent | null | undefined): NarsSessionEvent | null {
      if (!event || typeof event !== 'object') return null;
      const existingSequence = Number(event.event_sequence ?? event.sequence);
      const assignedSequence = Number.isFinite(existingSequence) && existingSequence > sequence
        ? existingSequence
        : sequence + 1;
      sequence = assignedSequence;
      const sequencedEvent: NarsSessionEvent = { ...event, event_sequence: assignedSequence, sequence: assignedSequence };
      buffer.push(sequencedEvent);
      while (buffer.length > maxBuffer) buffer.shift();
      for (const [subscriptionId, subscriber] of subscribers.entries()) {
        if (!eventMatchesNarsFilters(sequencedEvent, subscriber.filters)) continue;
        if (subscriber.lifecycle.state === 'replaying') subscriber.pending.push(sequencedEvent);
        else subscriber.deliver(sequencedEvent, assignedSequence);
      }
      return sequencedEvent;
    },
    subscribe({ subscriptionId = `sub_${Date.now()}_${subscribers.size + 1}`, filters = {}, send }: { subscriptionId?: string; filters?: NarsEventFilters; send: (envelope: NaradaEventHubEnvelope) => void }): NaradaEventHubSubscription {
      const lifecycle = createNarsEventAttachmentStateMachine({ attachmentId: subscriptionId });
      const remove = (reason = 'unsubscribe'): void => {
        subscribers.delete(subscriptionId);
        if (lifecycle.state === 'requested' || lifecycle.state === 'replaying' || lifecycle.state === 'live') {
          lifecycle.transition('closing', { reason });
        }
        if (lifecycle.state === 'closing') lifecycle.transition('closed', { reason });
      };
      const fail = (evidence: Record<string, unknown> = {}): void => {
        if (['requested', 'replaying', 'live'].includes(lifecycle.state)) lifecycle.transition('failed', evidence);
        subscribers.delete(subscriptionId);
      };
      const subscription: InternalSubscription = {
        filters,
        send,
        lifecycle,
        pending: [],
        fail,
        deliver(event: NarsSessionEvent, assignedSequence: number): void {
          try {
            send({
              schema: 'narada.nars.events.envelope.v1',
              event: 'session_event',
              subscription_id: subscriptionId,
              cursor: { sequence: assignedSequence, next_sequence: assignedSequence + 1 },
              payload: event,
            });
          } catch {
            fail({ reason: 'subscriber_send_failed' });
            subscribers.delete(subscriptionId);
          }
        },
      };
      subscribers.set(subscriptionId, subscription);
      return {
        subscriptionId,
        get state() { return lifecycle.state; },
        get stateHistory() { return lifecycle.history; },
        beginReplay: (evidence: Record<string, unknown> = {}) => lifecycle.transition('replaying', evidence),
        markLive: (evidence: Record<string, unknown> = {}): void => {
          lifecycle.transition('live', evidence);
          const replayLastSequence = Number(evidence.replay_last_sequence);
          const replaySequenceField = typeof evidence.replay_sequence_field === 'string' ? evidence.replay_sequence_field : null;
          const pending = subscription.pending.splice(0);
          for (const event of pending) {
            const sequence = replaySequenceField
              ? Number(event?.[replaySequenceField])
              : Number(event.event_sequence ?? event.sequence ?? 0);
            if (Number.isFinite(replayLastSequence)
              && (replaySequenceField ? Number.isFinite(sequence) && sequence <= replayLastSequence : sequence <= replayLastSequence)) continue;
            subscription.deliver(
              event,
              Number.isFinite(sequence) ? sequence : Number(event.event_sequence ?? event.sequence ?? 0),
            );
          }
        },
        fail,
        unsubscribe: remove,
      };
    },
    replayFor,
    cursor() {
      return { last_sequence: sequence || null, next_sequence: sequence + 1 };
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}
