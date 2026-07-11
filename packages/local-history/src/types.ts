export type HistoryOwnerKind = 'site' | 'user_site';
export type HistoryEventKind = 'create' | 'modify' | 'delete' | 'rename' | 'pre_restore' | 'restore';
export type HistoryFileKind = 'text' | 'binary' | 'symlink' | 'reparse_point' | 'directory' | 'unknown';
export type HistoryPrivacyPosture = 'default_exclusions' | 'custom_exclusions';

export interface LocalHistoryPolicyDefaults {
  schema: 'narada.local_work_history.defaults.v1';
  roots?: string[];
  exclusions?: string[];
  max_file_size_bytes?: number;
  debounce_ms?: number;
  stable_read_attempts?: number;
  stable_read_delay_ms?: number;
  retention_days?: number;
  quota_bytes?: number;
  privacy_posture?: HistoryPrivacyPosture;
}

export interface LocalHistoryPolicy {
  schema: 'narada.local_work_history.policy.v1';
  enabled: boolean;
  owner_kind: HistoryOwnerKind;
  owner_id: string;
  workspace_id: string;
  workspace_root: string;
  store_root: string;
  roots: string[];
  exclusions: string[];
  max_file_size_bytes: number;
  debounce_ms: number;
  stable_read_attempts: number;
  stable_read_delay_ms: number;
  retention_days: number;
  quota_bytes: number;
  privacy_posture: HistoryPrivacyPosture;
}

export interface HistoryTarget {
  ownerKind: HistoryOwnerKind;
  ownerId: string;
  workspaceRoot: string;
  workspaceId: string;
  authorityRoot: string;
  policyPath: string;
  storeRoot: string;
}

export interface FileSnapshot {
  snapshot_id: string;
  file_id: string;
  relative_path: string;
  content_hash: string | null;
  size_bytes: number;
  captured_at: string;
  event_kind: HistoryEventKind;
  is_tombstone: boolean;
  pinned: boolean;
  git_context: Record<string, unknown> | null;
}

export interface HistoryFile {
  file_id: string;
  workspace_id: string;
  relative_path: string;
  file_kind: HistoryFileKind;
  active: boolean;
  last_hash: string | null;
  last_size_bytes: number | null;
  last_seen_at: string | null;
  snapshots: FileSnapshot[];
}

export interface HistoryStatus {
  schema: 'narada.local_work_history.status.v1';
  status: 'enabled' | 'disabled' | 'missing_policy' | 'error';
  owner_kind: HistoryOwnerKind;
  owner_id: string;
  workspace_root: string;
  authority_root: string;
  policy_path: string;
  store_root: string;
  policy: LocalHistoryPolicy | null;
  watcher: {
    state: 'running' | 'stopped' | 'not_started' | 'failed' | 'unknown';
    pid: number | null;
    started_at: string | null;
    last_scan_at: string | null;
    last_capture_at: string | null;
    last_error: string | null;
  };
  counts: {
    files: number;
    active_files: number;
    snapshots: number;
    blobs: number;
    bytes: number;
    logical_bytes: number;
    pinned_snapshots: number;
  };
}

export interface CaptureResult {
  status: 'captured' | 'deduplicated' | 'tombstone' | 'skipped' | 'not_admitted';
  file_id?: string;
  snapshot_id?: string;
  relative_path: string;
  reason?: string;
  content_hash?: string | null;
}

export interface RestoreResult {
  status: 'restored' | 'deleted' | 'refused';
  snapshot_id: string;
  relative_path: string;
  stale: boolean;
  rollback_snapshot_id?: string;
  reason?: string;
}

export interface HistoryDaemonOptions {
  target: HistoryTarget;
  policy?: LocalHistoryPolicy;
  poll_interval_ms?: number;
  once?: boolean;
}
