
import type { ExchangeFsSyncConfig, ScopeConfig } from "./types.js";

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
};
