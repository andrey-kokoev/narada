// Main exports
export { loadConfig } from "./config/load.js";
export { ClientCredentialsTokenProvider } from "./adapter/graph/auth.js";
export { buildGraphTokenProvider } from "./config/token-provider.js";
export { DefaultGraphAdapter } from "./adapter/graph/adapter.js";
export { GraphHttpClient } from "./adapter/graph/client.js";
export { GraphDeltaWalker } from "./adapter/graph/delta.js";
export { normalizeFolderRef, normalizeFlagged } from "./adapter/graph/scope.js";
export { DefaultSyncRunner } from "./runner/sync-once.js";
export { FileCursorStore } from "./persistence/cursor.js";
export { FileApplyLogStore } from "./persistence/apply-log.js";
export { DefaultProjector, applyEvent } from "./projector/apply-event.js";
export { FileBlobStore } from "./persistence/blobs.js";
export { FileMessageStore } from "./persistence/messages.js";
export { FileTombstoneStore } from "./persistence/tombstones.js";
export { FileViewStore } from "./persistence/views.js";
export { FileLock } from "./persistence/lock.js";
export { cleanupTmp } from "./recovery/cleanup-tmp.js";

// Normalize exports
export { normalizeMessageToPayload, normalizeMessage } from "./normalize/message.js";
export { normalizeDeltaEntry } from "./normalize/delta-entry.js";
export { normalizeBatch } from "./normalize/batch.js";
export { normalizeAttachments } from "./normalize/attachments.js";
export { normalizeBody } from "./normalize/body.js";
export { normalizeRecipient, normalizeRecipientList } from "./normalize/addresses.js";

// ID exports
export { buildEventId, hashNormalizedPayload } from "./ids/event-id.js";

// Type exports
export type {
  ExchangeFsSyncConfig,
} from "./config/types.js";
export type {
  GraphAdapterConfig,
} from "./adapter/graph/adapter.js";
export type {
  SyncOnceDeps,
} from "./runner/sync-once.js";
export type {
  NormalizeMessageInput,
} from "./normalize/message.js";
export type {
  NormalizeDeltaEntryInput,
} from "./normalize/delta-entry.js";
export type {
  NormalizeBatchInput,
} from "./normalize/batch.js";

// Re-export all types from types directory
export * from "./types/index.js";

// Progress types
export type {
  ProgressEvent,
  ProgressCallback,
  SyncPhase,
  ProgressTracker,
} from "./types/progress.js";
