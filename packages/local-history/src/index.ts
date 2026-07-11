export { LocalHistoryError, LocalHistoryStore, writeHealth } from './store.js';
export type { HistoryDiff, LocalHistoryStoreOptions } from './store.js';
export { runHistoryDaemon, stopHistoryDaemon, withHistoryOwnerLock } from './daemon.js';
export { buildSiteTarget, buildUserTarget, defaultPolicy, loadPolicy, loadUserHistoryDefaults, pathInsideWorkspace, userHistoryDefaultsPath, validatePolicy, validatePolicyDefaults, writePolicy, DEFAULT_HISTORY_EXCLUSIONS, LOCAL_HISTORY_DEFAULTS_SCHEMA, LOCAL_HISTORY_POLICY_SCHEMA, MANDATORY_HISTORY_EXCLUSIONS, OPTIONAL_HISTORY_EXCLUSIONS, USER_HISTORY_DEFAULTS_RELATIVE_PATH } from './policy.js';
export type {
  CaptureResult,
  FileSnapshot,
  HistoryDaemonOptions,
  HistoryFile,
  HistoryFileKind,
  HistoryOwnerKind,
  HistoryPrivacyPosture,
  HistoryStatus,
  HistoryTarget,
  LocalHistoryPolicy,
  LocalHistoryPolicyDefaults,
  RestoreResult,
} from './types.js';
