import type {
  ApplyEventResult,
  NormalizedEvent,
  NormalizedPayload,
} from "../types/index.js";

export interface BlobInstaller {
  installFromPayload(payload: NormalizedPayload): Promise<void>;
}

export interface MessageStore {
  upsertFromPayload(payload: NormalizedPayload): Promise<void>;
  remove(messageId: string): Promise<void>;
}

export interface TombstoneStore {
  writeFromDeleteEvent(event: NormalizedEvent): Promise<void>;
  remove(messageId: string): Promise<void>;
}

export interface ViewDirtyMarker {
  markFromPayload(payload: NormalizedPayload): Promise<{
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  }>;
  markDelete(messageId: string): Promise<{
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  }>;
}

export interface ApplyEventDeps {
  blobs: BlobInstaller;
  messages: MessageStore;
  tombstones: TombstoneStore;
  views: ViewDirtyMarker;
  tombstones_enabled: boolean;
}

export async function applyEvent(
  deps: ApplyEventDeps,
  event: NormalizedEvent,
): Promise<ApplyEventResult> {
  if (event.event_kind === "upsert") {
    if (!event.payload) {
      throw new Error(`Upsert event ${event.event_id} is missing payload`);
    }

    await deps.blobs.installFromPayload(event.payload);
    await deps.messages.upsertFromPayload(event.payload);

    if (deps.tombstones_enabled) {
      await deps.tombstones.remove(event.message_id);
    }

    const dirty_views = await deps.views.markFromPayload(event.payload);

    return {
      event_id: event.event_id,
      message_id: event.message_id,
      applied: true,
      dirty_views,
    };
  }

  if (deps.tombstones_enabled) {
    await deps.tombstones.writeFromDeleteEvent(event);
  }

  await deps.messages.remove(event.message_id);

  const dirty_views = await deps.views.markDelete(event.message_id);

  return {
    event_id: event.event_id,
    message_id: event.message_id,
    applied: true,
    dirty_views,
  };
}