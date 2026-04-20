
import type { ExchangeFsSyncConfig, ScopeConfig } from "./types.js";

export const DEFAULT_STUCK_WORK_THRESHOLDS = {
  opened_max_age_minutes: 60,
  leased_max_age_minutes: 120,
  executing_max_age_minutes: 30,
  max_retries: 3,
};

export const DEFAULT_STUCK_OUTBOUND_THRESHOLDS = {
  pending_max_age_minutes: 15,
  draft_creating_max_age_minutes: 10,
  draft_ready_max_age_hours: 24,
  sending_max_age_minutes: 5,
};

export const DEFAULT_EXCHANGE_FS_SYNC_CONFIG: Omit<
  ExchangeFsSyncConfig,
  "root_dir" | "scopes"
> & { scopes: ScopeConfig[] } = {
  scopes: [],
  normalize: {
    attachment_policy: "metadata_only",
    body_policy: "text_only",
    include_headers: false,
    tombstones_enabled: true,
  },
  charter: {
    runtime: "mock",
  },
  policy: {
    primary_charter: "support_steward",
    allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
  },
  runtime: {
    polling_interval_ms: 60_000,
    acquire_lock_timeout_ms: 30_000,
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
    rebuild_search_after_sync: false,
  },
  lifecycle: {
    tombstone_retention_days: 30,
    archive_after_days: 90,
    archive_dir: "archive",
    compress_archives: true,
    retention: {
      preserve_flagged: true,
      preserve_unread: true,
    },
    schedule: {
      frequency: "manual",
      max_run_time_minutes: 60,
    },
  },
  operational_trust: {
    stuck_work_thresholds: DEFAULT_STUCK_WORK_THRESHOLDS,
    stuck_outbound_thresholds: DEFAULT_STUCK_OUTBOUND_THRESHOLDS,
  },
};
