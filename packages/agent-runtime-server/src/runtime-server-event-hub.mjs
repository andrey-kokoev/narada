export function eventMatchesFilters(event, filters = {}) {
  if (!filters || typeof filters !== 'object') return true;
  const eventKind = event.event ?? event.event_kind ?? null;
  const kinds = Array.isArray(filters.event_kinds) ? filters.event_kinds : Array.isArray(filters.kinds) ? filters.kinds : null;
  if (kinds && !kinds.includes(eventKind)) return false;
  const families = Array.isArray(filters.families) ? filters.families : null;
  if (families?.length) {
    const family = String(eventKind ?? '').startsWith('session_') ? 'session' : 'turn';
    if (!families.includes(family)) return false;
  }
  if (filters.request_id && event.request_id !== filters.request_id) return false;
  if (filters.turn_id && event.turn_id !== filters.turn_id) return false;
  return true;
}

export function createEventHub({ maxBuffer = 1000 } = {}) {
  const buffer = [];
  const subscribers = new Map();
  let sequence = 0;
  const replayFor = ({ sinceSequence = null, sinceTimestamp = null, filters = {}, maxReplay = 100 } = {}) => {
    const sinceSeq = sinceSequence == null ? null : Number.parseInt(String(sinceSequence), 10);
    const sinceTime = sinceTimestamp ? Date.parse(String(sinceTimestamp)) : null;
    const replayLimit = Math.max(0, Math.min(Number.parseInt(String(maxReplay), 10) || 0, maxBuffer));
    return buffer.filter((event) => {
      if (Number.isFinite(sinceSeq) && Number(event.event_sequence ?? event.sequence ?? 0) <= sinceSeq) return false;
      if (Number.isFinite(sinceTime)) {
        const eventTime = Date.parse(String(event.timestamp ?? event.generated_at ?? ''));
        if (Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
      }
      return eventMatchesFilters(event, filters);
    }).slice(-replayLimit);
  };
  return {
    publish(event) {
      if (!event || typeof event !== 'object') return null;
      const existingSequence = Number(event.event_sequence ?? event.sequence);
      let assignedSequence;
      if (Number.isFinite(existingSequence) && existingSequence > sequence) {
        sequence = existingSequence;
        assignedSequence = existingSequence;
      } else {
        sequence += 1;
        assignedSequence = sequence;
      }
      const sequencedEvent = {
        ...event,
        event_sequence: assignedSequence,
        sequence: assignedSequence,
      };
      buffer.push(sequencedEvent);
      while (buffer.length > maxBuffer) buffer.shift();
      for (const [subscriptionId, subscriber] of subscribers.entries()) {
        if (!eventMatchesFilters(sequencedEvent, subscriber.filters)) continue;
        try {
          subscriber.send({
            schema: 'narada.nars.events.envelope.v1',
            event: 'session_event',
            subscription_id: subscriptionId,
            cursor: { sequence: sequencedEvent.event_sequence, next_sequence: sequencedEvent.event_sequence + 1 },
            payload: sequencedEvent,
          });
        } catch {
          subscribers.delete(subscriptionId);
        }
      }
      return sequencedEvent;
    },
    subscribe({ subscriptionId = `sub_${Date.now()}_${subscribers.size + 1}`, filters = {}, send }) {
      subscribers.set(subscriptionId, { filters, send });
      return {
        subscriptionId,
        unsubscribe: () => subscribers.delete(subscriptionId),
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

