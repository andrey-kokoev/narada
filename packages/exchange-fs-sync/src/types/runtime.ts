import type {
  CursorToken,
  EventId,
  MessageId,
  NormalizedBatch,
  NormalizedEvent,
  NormalizedPayload,
} from "./normalized.js";

export interface RunResult {
  prior_cursor?: CursorToken | null;
  next_cursor?: CursorToken;
  event_count: number;
  applied_count: number;
  skipped_count: number;
  duration_ms: number;
  status: "success" | "retryable_failure" | "fatal_failure";
  error?: string;
}

export interface ApplyEventResult {
  event_id: EventId;
  message_id: MessageId;
  applied: boolean;
  dirty_views: {
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  };
}

export interface GraphAdapter {
  fetch_since(cursor?: CursorToken | null): Promise<NormalizedBatch>;
}

export interface CursorStore {
  read(): Promise<CursorToken | null>;
  commit(nextCursor: CursorToken): Promise<void>;
}

export interface ApplyLogStore {
  hasApplied(eventId: EventId): Promise<boolean>;
  markApplied(event: NormalizedEvent): Promise<void>;
}

export interface Projector {
  applyEvent(event: NormalizedEvent): Promise<ApplyEventResult>;
}

export interface SyncRunner {
  syncOnce(): Promise<RunResult>;
}

export interface MessageStore {
  upsertFromPayload(payload: NormalizedPayload): Promise<void>;
  remove(messageId: string): Promise<void>;
}

export interface ViewStore {
  markDelete(messageId: string): Promise<{
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  }>;
}
