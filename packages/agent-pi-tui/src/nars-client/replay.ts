import type { NarsEvent, NarsProtocolFrame } from '../types.js';
import { buildReadEventsFrame, buildSubscribeFrame } from './protocol.js';
import { isReplayCompletedEvent } from './event-stream.js';

export const DEFAULT_REPLAY_PAGE_SIZE = 100;

export function boundedReplayFrame(options: {
  subscriptionId: string;
  attempt: number;
  sinceSequence: number | null;
  pageSize?: number;
}): NarsProtocolFrame {
  return buildSubscribeFrame({
    id: `${options.subscriptionId}-replay-${options.attempt}`,
    includeReplay: true,
    pageSize: Math.max(1, Math.min(options.pageSize ?? DEFAULT_REPLAY_PAGE_SIZE, 1000)),
    sinceSequence: options.sinceSequence,
    subscriptionId: options.subscriptionId,
  });
}

export function eventsReadFrame(options: { afterSequence: number | null; limit?: number; id?: string }): NarsProtocolFrame {
  return buildReadEventsFrame(options);
}

export function replayHasCompleted(events: readonly NarsEvent[]): boolean {
  return events.some(isReplayCompletedEvent);
}

