export interface RetainedEventState {
  events: unknown[];
  droppedCount: number;
  maxEvents: number;
}

export function createRetainedEventState(maxEvents = 500): RetainedEventState {
  return { events: [], droppedCount: 0, maxEvents };
}

export function retainEvent(state: RetainedEventState, event: unknown): void {
  state.events.push(event);
  while (state.events.length > state.maxEvents) {
    state.events.shift();
    state.droppedCount += 1;
  }
}

export function clearRetainedEvents(state: RetainedEventState): void {
  state.events.splice(0);
  state.droppedCount = 0;
}
