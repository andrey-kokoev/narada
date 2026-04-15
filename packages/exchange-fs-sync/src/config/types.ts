import type { AttachmentPolicy, BodyPolicy, FolderRef, MailboxId } from "../types/index.js";
import type { AllowedAction } from "../foreman/types.js";
import type { ChangeType } from "../adapter/graph/subscription.js";

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

export interface CharterRuntimeConfig {
  runtime: string;
  api_key?: string;
  model?: string;
  base_url?: string;
  timeout_ms?: number;
}

export interface RuntimePolicy {
  primary_charter: string;
  secondary_charters?: string[];
  allowed_actions: AllowedAction[];
  allowed_tools?: string[];
  require_human_approval?: boolean;
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

  /**
   * Charter runtime configuration
   */
  charter?: CharterRuntimeConfig;

  /**
   * Mailbox policy binding that determines charter routing,
   * allowed actions, and available tools for this mailbox.
   */
  policy: RuntimePolicy;

  /**
   * Webhook configuration for real-time sync
   */
  webhook?: {
    /** Enable webhook notifications */
    enabled: boolean;
    
    /** Public URL for receiving notifications (required when enabled) */
    public_url?: string;
    
    /** Local port for webhook server (required when enabled) */
    port?: number;
    
    /** Host to bind to */
    host?: string;
    
    /** Webhook endpoint path */
    path?: string;
    
    /** Client state secret for validation (required when enabled) */
    client_state?: string;
    
    /** Optional HMAC secret for signature validation */
    hmac_secret?: string;
    
    /** Subscription expiration in minutes (max 4230) */
    subscription_expiration_minutes?: number;
    
    /** Auto-renew subscriptions before expiration */
    auto_renew?: boolean;
    
    /** Change types to monitor */
    change_types?: ChangeType[];
    
    /** Lifecycle notification URL (defaults to public_url) */
    lifecycle_url?: string;
    
    /** Fallback poll interval when webhooks fail (minutes) */
    fallback_poll_minutes?: number;
    
    /** Enable hybrid mode (webhooks + polling fallback) */
    hybrid_mode?: boolean;
    
    /** Rate limit: max requests per minute */
    rate_limit_max_requests?: number;
    
    /** Maximum request body size in bytes */
    max_body_size?: number;
  };
}
