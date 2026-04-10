
import type { ExchangeFsSyncConfig } from "./types.js";

export const DEFAULT_EXCHANGE_FS_SYNC_CONFIG: Omit<
  ExchangeFsSyncConfig,
  "mailbox_id" | "root_dir" | "graph" | "scope"
> = {
  normalize: {
    attachment_policy: "metadata_only",
    body_policy: "text_only",
    include_headers: false,
    tombstones_enabled: true,
  },
  runtime: {
    polling_interval_ms: 60_000,
    acquire_lock_timeout_ms: 30_000,
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
  },
};
