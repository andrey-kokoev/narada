import type { AttachmentPolicy, BodyPolicy, FolderRef } from "../types/index.js";
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

/** Source configuration for a scope (e.g. Graph API, timer, webhook) */
export interface SourceConfig {
  type: 'graph' | 'timer' | 'webhook';
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  user_id?: string;
  base_url?: string;
  prefer_immutable_ids?: boolean;
  /**
   * @deprecated Legacy field for backward compatibility. Prefer source-specific config objects.
   */
  [key: string]: unknown;
}

/** Executor binding for a scope */
export interface ExecutorConfig {
  family: string;
  options?: Record<string, unknown>;
}

/** Context strategy for scope admission */
export type ContextStrategy = 'mailbox' | 'timer' | 'filesystem' | 'webhook' | string;

/** Vertical-neutral configuration for a single scope */
export interface ScopeConfig {
  /** Unique identifier for this scope */
  scope_id: string;
  /** Root directory for this scope's data */
  root_dir: string;
  /** Source configurations */
  sources: SourceConfig[];
  /** Context strategy for admission */
  context_strategy: ContextStrategy;
  /** Scope filters (folders, item kinds, etc.) */
  scope: {
    included_container_refs: FolderRef[];
    included_item_kinds: string[];
  };
  /** Normalization settings */
  normalize: {
    attachment_policy: AttachmentPolicy;
    body_policy: BodyPolicy;
    include_headers: boolean;
    tombstones_enabled: boolean;
  };
  /** Runtime settings */
  runtime: {
    polling_interval_ms: number;
    acquire_lock_timeout_ms: number;
    cleanup_tmp_on_startup: boolean;
    rebuild_views_after_sync: boolean;
  };
  /** Charter runtime configuration */
  charter?: CharterRuntimeConfig;
  /** Policy binding */
  policy: RuntimePolicy;
  /** Executor bindings */
  executors?: ExecutorConfig[];

  /**
   * @deprecated Legacy Graph API field. Prefer sources[] instead.
   */
  graph?: {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
    user_id: string;
    base_url?: string;
    prefer_immutable_ids: boolean;
  };

  /**
   * @deprecated Legacy webhook field. Prefer global webhook or source-specific webhook config.
   */
  webhook?: {
    enabled: boolean;
    public_url?: string;
    port?: number;
    host?: string;
    path?: string;
    client_state?: string;
    hmac_secret?: string;
    subscription_expiration_minutes?: number;
    auto_renew?: boolean;
    change_types?: ChangeType[];
    lifecycle_url?: string;
    fallback_poll_minutes?: number;
    hybrid_mode?: boolean;
    rate_limit_max_requests?: number;
    max_body_size?: number;
  };

  /**
   * @deprecated Legacy lifecycle field. Prefer global lifecycle.
   */
  lifecycle?: LifecycleConfig;
}

/** Root configuration supporting multiple concurrent verticals */
export interface ExchangeFsSyncConfig {
  root_dir: string;
  scopes: ScopeConfig[];
  lifecycle?: LifecycleConfig;

  /** Global webhook configuration (optional) */
  webhook?: {
    enabled: boolean;
    public_url?: string;
    port?: number;
    host?: string;
    path?: string;
    client_state?: string;
    hmac_secret?: string;
    subscription_expiration_minutes?: number;
    auto_renew?: boolean;
    change_types?: ChangeType[];
    lifecycle_url?: string;
    fallback_poll_minutes?: number;
    hybrid_mode?: boolean;
    rate_limit_max_requests?: number;
    max_body_size?: number;
  };

  /**
   * @deprecated Legacy single-scope fields. Prefer scopes[] instead.
   * When scopes is absent, the loader auto-promotes these fields into a single ScopeConfig.
   */
  scope_id?: string;
  mailbox_id?: string;
  graph?: {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
    user_id: string;
    base_url?: string;
    prefer_immutable_ids: boolean;
  };
  scope?: {
    included_container_refs: FolderRef[];
    included_item_kinds: string[];
  };
  normalize?: {
    attachment_policy: AttachmentPolicy;
    body_policy: BodyPolicy;
    include_headers: boolean;
    tombstones_enabled: boolean;
  };
  runtime?: {
    polling_interval_ms: number;
    acquire_lock_timeout_ms: number;
    cleanup_tmp_on_startup: boolean;
    rebuild_views_after_sync: boolean;
  };
  charter?: CharterRuntimeConfig;
  policy?: RuntimePolicy;
}
