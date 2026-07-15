import { eventMatchesNarsFilters } from './event-log.mjs';
import { createNarsEventAttachmentStateMachine } from './event-attachment-state.mjs';

export function createNarsEventHub({ maxBuffer = 1000 } = {}) {
  const buffer = [];
  const subscribers = new Map();
  let sequence = 0;
  const replayFor = ({ sinceSequence = null, sinceTimestamp = null, filters = {}, maxReplay = 100 } = {}) => {
    const sinceSeq = sinceSequence == null ? null : Number.parseInt(String(sinceSequence), 10);
    const sinceTime = sinceTimestamp ? Date.parse(String(sinceTimestamp)) : null;
    const parsedMaxReplay = Number.parseInt(String(maxReplay), 10);
    const replayLimit = Math.max(0, Math.min(Number.isFinite(parsedMaxReplay) ? parsedMaxReplay : 100, maxBuffer));
    const replay = buffer.filter((event) => {
      if (Number.isFinite(sinceSeq) && Number(event.event_sequence ?? event.sequence ?? 0) <= sinceSeq) return false;
      if (Number.isFinite(sinceTime)) {
        const eventTime = Date.parse(String(event.timestamp ?? event.generated_at ?? ''));
        if (Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
      }
      return eventMatchesNarsFilters(event, filters);
    });
    return replayLimit === 0 ? [] : replay.slice(-replayLimit);
  };
  return {
    publish(event) {
      if (!event || typeof event !== 'object') return null;
      const existingSequence = Number(event.event_sequence ?? event.sequence);
      const assignedSequence = Number.isFinite(existingSequence) && existingSequence > sequence
        ? existingSequence
        : sequence + 1;
      sequence = assignedSequence;
      const sequencedEvent = { ...event, event_sequence: assignedSequence, sequence: assignedSequence };
      buffer.push(sequencedEvent);
      while (buffer.length > maxBuffer) buffer.shift();
      for (const [subscriptionId, subscriber] of subscribers.entries()) {
        if (!eventMatchesNarsFilters(sequencedEvent, subscriber.filters)) continue;
        if (subscriber.lifecycle.state === 'replaying') subscriber.pending.push(sequencedEvent);
        else subscriber.deliver(sequencedEvent, assignedSequence);
      }
      return sequencedEvent;
    },
    subscribe({ subscriptionId = `sub_${Date.now()}_${subscribers.size + 1}`, filters = {}, send }) {
      const lifecycle = createNarsEventAttachmentStateMachine({ attachmentId: subscriptionId });
      const remove = (reason = 'unsubscribe') => {
        subscribers.delete(subscriptionId);
        if (lifecycle.state === 'requested' || lifecycle.state === 'replaying' || lifecycle.state === 'live') {
          lifecycle.transition('closing', { reason });
        }
        if (lifecycle.state === 'closing') lifecycle.transition('closed', { reason });
      };
      const fail = (evidence = {}) => {
        if (['requested', 'replaying', 'live'].includes(lifecycle.state)) lifecycle.transition('failed', evidence);
        subscribers.delete(subscriptionId);
      };
      const subscription = {
        filters,
        send,
        lifecycle,
        pending: [],
        fail,
        deliver(event, assignedSequence) {
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
        beginReplay: (evidence = {}) => lifecycle.transition('replaying', evidence),
        markLive: (evidence = {}) => {
          lifecycle.transition('live', evidence);
          const replayLastSequence = Number(evidence.replay_last_sequence);
          const pending = subscription.pending.splice(0);
          for (const event of pending) {
            const sequence = Number(event.event_sequence ?? event.sequence ?? 0);
            if (Number.isFinite(replayLastSequence) && sequence <= replayLastSequence) continue;
            subscription.deliver(event, sequence);
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
