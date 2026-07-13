import { reactive } from 'vue';
import { clearRetainedEvents, createRetainedEventState, newestRetainedSequence, oldestRetainedSequence, retainEvent, retainEvents } from '../lib/eventRetention';

export const DEFAULT_RETAINED_EVENT_LIMIT = 500;

export function useRetainedEvents(maxEvents = DEFAULT_RETAINED_EVENT_LIMIT) {
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
