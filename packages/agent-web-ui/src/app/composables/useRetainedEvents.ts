import { reactive } from 'vue';
import { clearRetainedEvents, createRetainedEventState, retainEvent } from '../lib/eventRetention';

export function useRetainedEvents(maxEvents = 500) {
  const state = reactive(createRetainedEventState(maxEvents));
  return {
    events: state.events,
    state,
    retain(event: unknown) {
      retainEvent(state, event);
    },
    clear() {
      clearRetainedEvents(state);
    },
  };
}
