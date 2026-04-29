import type {
  ApplyEventResult,
  Projector,
} from "../types/runtime.js";
import type { SourceRecord } from "../types/source.js";
import type {
  NormalizedEvent,
  NormalizedPayload,
} from "../types/normalized.js";
import { FileBlobStore } from "../persistence/blobs.js";
import { FileMessageStore } from "../persistence/messages.js";
import { FileTombstoneStore } from "../persistence/tombstones.js";
import { FileViewStore } from "../persistence/views.js";

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

const FACT_ONLY_SOURCE_KINDS = new Set([
  "timer.tick",
  "filesystem.change",
  "webhook.received",
]);

function getPayloadKind(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const kind = (payload as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}

function isFactOnlySourceRecord(record: SourceRecord): boolean {
  const kind = getPayloadKind(record.payload);
  return kind !== null && FACT_ONLY_SOURCE_KINDS.has(kind);
}

function factOnlyApplyResult(record: SourceRecord): ApplyEventResult {
  return {
    event_id: record.recordId,
    message_id: record.recordId,
    applied: true,
    dirty_views: {
      by_thread: [],
      by_folder: [],
      unread_changed: false,
      flagged_changed: false,
    },
  };
}

export async function applyEvent(
  deps: ApplyEventDeps,
  event: NormalizedEvent,
): Promise<ApplyEventResult> {
  const kind = event.event_kind;
  
  if (kind === "upsert" || kind === "created" || kind === "updated") {
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

  if (kind === "delete" || kind === "deleted") {
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

  throw new Error(`Unknown event kind: ${kind}`);
}

export async function applySourceRecord(
  deps: ApplyEventDeps,
  record: SourceRecord,
): Promise<ApplyEventResult> {
  if (isFactOnlySourceRecord(record)) {
    return factOnlyApplyResult(record);
  }

  const event = record.payload as NormalizedEvent;
  return applyEvent(deps, event);
}

export interface DefaultProjectorOptions {
  rootDir: string;
  tombstonesEnabled?: boolean;
}

export class DefaultProjector implements Projector {
  private readonly deps: ApplyEventDeps;

  constructor(opts: DefaultProjectorOptions) {
    const blobs = new FileBlobStore({
      rootDir: opts.rootDir,
    });

    const messages = new FileMessageStore({
      rootDir: opts.rootDir,
    });

    const tombstones = new FileTombstoneStore({
      rootDir: opts.rootDir,
    });

    const views = new FileViewStore({
      rootDir: opts.rootDir,
    });

    this.deps = {
      blobs,
      messages,
      tombstones,
      views,
      tombstones_enabled: opts.tombstonesEnabled ?? true,
    };
  }

  async applyRecord(record: SourceRecord): Promise<ApplyEventResult> {
    return applySourceRecord(this.deps, record);
  }

  /** @deprecated Use applyRecord instead */
  async applyEvent(event: NormalizedEvent): Promise<ApplyEventResult> {
    return applyEvent(this.deps, event);
  }
}
