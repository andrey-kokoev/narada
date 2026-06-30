import { reactive } from 'vue';
import { clearRetainedEvents, createRetainedEventState, newestRetainedSequence, oldestRetainedSequence, retainEvent, retainEvents } from '../lib/eventRetention';

export function useRetainedEvents(maxEvents = Number.POSITIVE_INFINITY) {
  const state = reactive(createRetainedEventState(maxEvents));
  return {
    events: state.events,
    state,
    retain(event: unknown) {
      retainEvent(state, event);
    },
    retainMany(events: unknown[]) {
      retainEvents(state, events);
    },
    oldestSequence() {
      return oldestRetainedSequence(state);
    },
    newestSequence() {
      return newestRetainedSequence(state);
    },
    clear() {
      clearRetainedEvents(state);
    },
  };
}
