export { LocalHistoryError, LocalHistoryStore, writeHealth } from './store.js';
export type { HistoryDiff, LocalHistoryStoreOptions } from './store.js';
export { runHistoryDaemon, stopHistoryDaemon, withHistoryOwnerLock } from './daemon.js';
export { buildSiteTarget, buildUserTarget, defaultPolicy, loadPolicy, pathInsideWorkspace, validatePolicy, writePolicy, DEFAULT_HISTORY_EXCLUSIONS, LOCAL_HISTORY_POLICY_SCHEMA } from './policy.js';
export type {
  CaptureResult,
  FileSnapshot,
  HistoryDaemonOptions,
  HistoryFile,
  HistoryFileKind,
  HistoryOwnerKind,
  HistoryStatus,
  HistoryTarget,
  LocalHistoryPolicy,
  RestoreResult,
} from './types.js';
