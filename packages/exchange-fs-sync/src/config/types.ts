import type { AttachmentPolicy, BodyPolicy, FolderRef, MailboxId } from "../types/index.js";

export interface RetentionPolicy {
  max_age_days?: number;
  max_total_size?: string;
  max_message_count?: number;
  preserve_flagged: boolean;
  preserve_unread: boolean;
}

export interface CleanupSchedule {
  frequency: 'daily' | 'weekly' | 'on-sync' | 'manual';
  max_run_time_minutes: number;
  time_window?: { start: string; end: string };
}

export interface LifecycleConfig {
  tombstone_retention_days: number;
  archive_after_days: number;
  archive_dir: string;
  compress_archives: boolean;
  retention: RetentionPolicy;
  schedule: CleanupSchedule;
}

export interface ExchangeFsSyncConfig {
  mailbox_id: MailboxId;
  root_dir: string;

  graph: {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
    user_id: string;
    base_url?: string;
    prefer_immutable_ids: boolean;
  };

  scope: {
    included_container_refs: FolderRef[];
    included_item_kinds: string[];
  };

  normalize: {
    attachment_policy: AttachmentPolicy;
    body_policy: BodyPolicy;
    include_headers: boolean;
    tombstones_enabled: boolean;
  };

  runtime: {
    polling_interval_ms: number;
    acquire_lock_timeout_ms: number;
    cleanup_tmp_on_startup: boolean;
    rebuild_views_after_sync: boolean;
  };

  lifecycle: LifecycleConfig;
}
