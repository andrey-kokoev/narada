import { sequenceFromRuntimeMessage } from '../../runtime-events.js';

export interface RetainedEventState {
  events: unknown[];
  droppedCount: number;
  maxEvents: number;
}

export function createRetainedEventState(maxEvents = 500): RetainedEventState {
  return { events: [], droppedCount: 0, maxEvents };
}

export function retainEvent(state: RetainedEventState, event: unknown): void {
  const sequence = sequenceFromRuntimeMessage(event);
  if (sequence === null) {
    state.events.push(event);
    trimRetainedEvents(state);
    return;
  }
  const existingIndex = state.events.findIndex((retained) => sequenceFromRuntimeMessage(retained) === sequence);
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
