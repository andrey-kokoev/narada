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
  /** When 'draft_only', the runtime reports degraded_draft_only health and restricts effects to draft-only */
  degraded_mode?: "draft_only" | "normal";
  /** Path to the Kimi CLI executable (default: `kimi` on PATH) */
  cli_path?: string;
  /** Session ID to resume for kimi-cli runtime */
  session_id?: string;
  /** Continue the previous session for the working directory */
  continue_session?: boolean;
  /** Working directory for the kimi-cli agent */
  work_dir?: string;
}

export interface RuntimePolicy {
  primary_charter: string;
  secondary_charters?: string[];
  allowed_actions: AllowedAction[];
  allowed_tools?: string[];
  require_human_approval?: boolean;
  /** Explicitly grants authorization for runtime authority classes (claim, execute, resolve, confirm). */
  runtime_authorized?: boolean;
  /** Explicitly grants authorization for admin authority class. */
  admin_authorized?: boolean;
}

export interface ToolCatalogRef {
  type: "local_path";
  path: string;
}

export interface MailAdmissionConfig {
  allowed_sender_addresses?: string[];
  allowed_sender_domains?: string[];
  unknown_sender_behavior?: "ignore" | "admit";
}

export interface AdmissionConfig {
  mail?: MailAdmissionConfig;
}

/** Source configuration for a scope (e.g. Graph API, timer, webhook) */
export interface SourceConfig {
  type: 'graph' | 'timer' | 'webhook' | 'mock';
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
export type ContextStrategy = 'mail' | 'timer' | 'filesystem' | 'webhook' | string;

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
    rebuild_search_after_sync: boolean;
  };
  /** Charter runtime configuration */
  charter?: CharterRuntimeConfig;
  /** Policy binding */
  policy: RuntimePolicy;
  /** Source-record admission policy. Controls which synced source records may produce work. */
  admission?: AdmissionConfig;
  /** External tool catalogs bound into this scope */
  tool_catalogs?: ToolCatalogRef[];
  /** Executor bindings */
  executors?: ExecutorConfig[];

  /** Operational trust / stuck-detection thresholds (optional) */
  operational_trust?: OperationalTrustConfig;

  /** Campaign request sender allowlist (optional) */
  campaign_request_senders?: string[];

  /** Campaign request lookback window in days (default: 7) */
  campaign_request_lookback_days?: number;

  /** Operator contacts who may open pending operator requests by email */
  operator_contacts?: OperatorContact[];

  /** Confirmation providers for email-originated operator requests */
  confirmation_providers?: ConfirmationProvidersConfig;

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
export interface StuckWorkThresholds {
  opened_max_age_minutes: number;
  leased_max_age_minutes: number;
  executing_max_age_minutes: number;
  max_retries: number;
}

export interface StuckOutboundThresholds {
  pending_max_age_minutes: number;
  draft_creating_max_age_minutes: number;
  draft_ready_max_age_hours: number;
  sending_max_age_minutes: number;
}

export interface OperationalTrustConfig {
  stuck_work_thresholds?: StuckWorkThresholds;
  stuck_outbound_thresholds?: StuckOutboundThresholds;
}

/** Daemon health threshold configuration (Task 234) */
export interface HealthConfig {
  max_staleness_ms?: number;
  max_consecutive_errors?: number;
  max_drain_ms?: number;
}

export type ConfirmableOperatorAction =
  | "approve_draft_for_send"
  | "reject_draft"
  | "mark_reviewed"
  | "handled_externally"
  | "trigger_sync"
  | "request_redispatch";

export interface OperatorContact {
  principal_id: string;
  channel: "email";
  address: string;
  identity_provider: "microsoft_entra";
  tenant_id: string;
  entra_user_id: string;
  may_open_operator_requests: boolean;
  may_confirm_actions: ConfirmableOperatorAction[];
}

export interface MicrosoftEntraConfirmationProvider {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  redirect_base_url: string;
}

export type ConfirmationProvider = MicrosoftEntraConfirmationProvider;

export interface ConfirmationProvidersConfig {
  microsoft_entra?: MicrosoftEntraConfirmationProvider;
}

export interface ExchangeFsSyncConfig {
  root_dir: string;
  scopes: ScopeConfig[];
  lifecycle?: LifecycleConfig;
  operational_trust?: OperationalTrustConfig;
  /** Daemon health thresholds (optional) */
  health?: HealthConfig;

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
    rebuild_search_after_sync: boolean;
  };
  charter?: CharterRuntimeConfig;
  policy?: RuntimePolicy;
}
