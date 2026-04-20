/**
 * Multi-mailbox configuration support
 * 
 * Enables syncing multiple mailboxes in parallel with resource management.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SecureStorage } from "../auth/secure-storage.js";
import { resolveSecrets, isSecureRef } from "./secure-config.js";
import type { AttachmentPolicy, BodyPolicy, FolderRef } from "../types/index.js";
import type { CharterRuntimeConfig, RuntimePolicy, LifecycleConfig, ScopeConfig } from "./types.js";
import type { ChangeType } from "../adapter/graph/subscription.js";

/**
 * @deprecated Use ScopeConfig from ./types.js instead.
 * Configuration for a single mailbox (legacy multi-mailbox format)
 */
export interface MailboxConfig {
  /** Unique identifier for this mailbox config */
  id: string;
  /** Email address / Graph user ID */
  mailbox_id: string;
  /** Root directory for this mailbox's data */
  root_dir: string;
  /** Graph API credentials */
  graph: {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
    user_id: string;
    base_url?: string;
    prefer_immutable_ids: boolean;
  };
  /** Sync options (optional, uses defaults if not specified) */
  sync?: {
    attachment_policy?: AttachmentPolicy;
    body_policy?: BodyPolicy;
    include_headers?: boolean;
    tombstones_enabled?: boolean;
    polling_interval_ms?: number;
    acquire_lock_timeout_ms?: number;
    cleanup_tmp_on_startup?: boolean;
    rebuild_views_after_sync?: boolean;
    rebuild_search_after_sync?: boolean;
  };
  /** Scope configuration */
  scope?: {
    included_container_refs: FolderRef[];
    included_item_kinds: string[];
  };
  /** Charter runtime configuration */
  charter?: CharterRuntimeConfig;
  /** Mailbox policy routing */
  policy?: RuntimePolicy;
  /** Lifecycle configuration */
  lifecycle?: LifecycleConfig;
  /** Webhook configuration */
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
}

/** Token provider configuration for shared auth */
export interface TokenProviderConfig {
  type: "client_credentials";
  tenant_id: string;
  client_id: string;
  client_secret: string;
  scope?: string;
}

/** Resource limits for sync operations */
export interface ResourceLimits {
  /** Per-sync memory limit in MB */
  maxMemoryMB: number;
  /** Max disk I/O operations per second */
  maxDiskIOPerSecond: number;
  /** Max network requests per second */
  maxNetworkRequestsPerSecond: number;
}

/** Global configuration for multi-mailbox setup */
export interface MultiMailboxGlobalConfig {
  /** Maximum concurrent syncs (default: 2) */
  max_concurrent_syncs: number;
  /** Resource limits */
  resource_limits: ResourceLimits;
  /** Graceful shutdown timeout in ms (default: 30000) */
  shutdown_timeout_ms: number;
}

/**
 * @deprecated Use ExchangeFsSyncConfig with scopes[] instead.
 */
export interface MultiMailboxConfig {
  /** Array of mailbox configurations */
  mailboxes: MailboxConfig[];
  /** Shared configuration across mailboxes */
  shared?: {
    /** Shared token provider (optional) */
    token_provider?: TokenProviderConfig;
  };
  /** Global settings */
  global?: Partial<MultiMailboxGlobalConfig>;
}

/** Default global configuration */
export const DEFAULT_GLOBAL_CONFIG: MultiMailboxGlobalConfig = {
  max_concurrent_syncs: 2,
  resource_limits: {
    maxMemoryMB: 512,
    maxDiskIOPerSecond: 100,
    maxNetworkRequestsPerSecond: 50,
  },
  shutdown_timeout_ms: 30000,
};

/** Default sync options */
export const DEFAULT_SYNC_OPTIONS: Required<NonNullable<MailboxConfig["sync"]>> = {
  attachment_policy: "metadata_only",
  body_policy: "text_only",
  include_headers: false,
  tombstones_enabled: true,
  polling_interval_ms: 60000,
  acquire_lock_timeout_ms: 30000,
  cleanup_tmp_on_startup: true,
  rebuild_views_after_sync: true,
  rebuild_search_after_sync: false,
};

/** Options for loading multi-mailbox config */
export interface LoadMultiMailboxOptions {
  /** Path to config file */
  path: string;
  /** Secure storage for resolving secrets */
  storage?: SecureStorage;
  /** Validate all mailbox directories exist */
  validateDirectories?: boolean;
}

/** Result of loading multi-mailbox config */
export interface LoadMultiMailboxResult {
  config: MultiMailboxConfig;
  /** Scopes converted from mailboxes for forward compatibility */
  scopes: ScopeConfig[];
  /** Validation errors by mailbox id */
  validationErrors: Map<string, string[]>;
  /** Whether config is valid */
  valid: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function expectBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function expectNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return defaultValue;
}

export function expectAttachmentPolicy(value: unknown): AttachmentPolicy {
  if (value === "exclude" || value === "metadata_only" || value === "include_content") {
    return value;
  }
  return DEFAULT_SYNC_OPTIONS.attachment_policy;
}

export function expectBodyPolicy(value: unknown): BodyPolicy {
  if (value === "text_only" || value === "html_only" || value === "text_and_html") {
    return value;
  }
  return DEFAULT_SYNC_OPTIONS.body_policy;
}

const ALLOWED_ACTIONS = new Set([
  "draft_reply",
  "send_reply",
  "send_new_message",
  "mark_read",
  "move_message",
  "set_categories",
  "extract_obligations",
  "create_followup",
  "tool_request",
  "no_action",
]);

export function expectAllowedActions(value: unknown): RuntimePolicy["allowed_actions"] {
  if (!Array.isArray(value)) {
    throw new Error("allowed_actions must be an array of allowed actions");
  }
  const actions = value.map((item, index) => {
    const action = typeof item === "string" && item.trim().length > 0 ? item.trim() : "";
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new Error(`allowed_actions[${index}] must be a valid allowed action, got "${action}"`);
    }
    return action as RuntimePolicy["allowed_actions"][number];
  });
  if (actions.length === 0) {
    throw new Error("allowed_actions must contain at least one allowed action");
  }
  return actions;
}

/**
 * Check if a value (or nested values) contains secure references
 */
function checkForSecureRefs(value: unknown): boolean {
  if (isSecureRef(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(checkForSecureRefs);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(checkForSecureRefs);
  }
  return false;
}

/**
 * Validate a single mailbox configuration
 */
export function validateMailboxConfig(
  mailbox: unknown,
  index: number,
): { valid: boolean; errors: string[]; config?: MailboxConfig } {
  const errors: string[] = [];
  
  if (!isObject(mailbox)) {
    return { valid: false, errors: [`Mailbox[${index}] must be an object`] };
  }

  // Required fields
  const id = mailbox.id;
  if (!isNonEmptyString(id)) {
    errors.push(`Mailbox[${index}].id must be a non-empty string`);
  }

  const mailbox_id = mailbox.mailbox_id;
  if (!isNonEmptyString(mailbox_id)) {
    errors.push(`Mailbox[${index}].mailbox_id must be a non-empty string`);
  }

  const root_dir = mailbox.root_dir;
  if (!isNonEmptyString(root_dir)) {
    errors.push(`Mailbox[${index}].root_dir must be a non-empty string`);
  }

  // Graph config
  const graph = mailbox.graph;
  if (!isObject(graph)) {
    errors.push(`Mailbox[${index}].graph must be an object`);
  } else {
    const user_id = graph.user_id;
    if (!isNonEmptyString(user_id)) {
      errors.push(`Mailbox[${index}].graph.user_id must be a non-empty string`);
    }
  }

  // Scope config
  const scope = mailbox.scope;
  if (scope !== undefined) {
    if (!isObject(scope)) {
      errors.push(`Mailbox[${index}].scope must be an object`);
    } else {
      if (!Array.isArray(scope.included_container_refs)) {
        errors.push(`Mailbox[${index}].scope.included_container_refs must be an array`);
      }
      if (!Array.isArray(scope.included_item_kinds)) {
        errors.push(`Mailbox[${index}].scope.included_item_kinds must be an array`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build config
  const graphObj = mailbox.graph as Record<string, unknown>;
  const scopeObj = isObject(mailbox.scope) ? mailbox.scope : {};
  const syncObj = isObject(mailbox.sync) ? mailbox.sync : {};

  // Charter config
  const charterObj = isObject(mailbox.charter) ? mailbox.charter : {};
  const charter: CharterRuntimeConfig = {
    runtime:
      typeof charterObj.runtime === "string" && charterObj.runtime.length > 0
        ? charterObj.runtime.trim()
        : "mock",
    ...(isNonEmptyString(charterObj.api_key) ? { api_key: (charterObj.api_key as string).trim() } : {}),
    ...(isNonEmptyString(charterObj.model) ? { model: (charterObj.model as string).trim() } : {}),
    ...(isNonEmptyString(charterObj.base_url) ? { base_url: (charterObj.base_url as string).trim() } : {}),
    ...(typeof charterObj.timeout_ms === "number" && Number.isFinite(charterObj.timeout_ms) && charterObj.timeout_ms >= 0
      ? { timeout_ms: charterObj.timeout_ms as number }
      : {}),
  };

  // Policy config
  const policyObj = isObject(mailbox.policy) ? mailbox.policy : {};
  let policy: RuntimePolicy | undefined;
  try {
    policy = {
      primary_charter: isNonEmptyString(policyObj.primary_charter)
        ? (policyObj.primary_charter as string).trim()
        : "support_steward",
      allowed_actions:
        policyObj.allowed_actions !== undefined
          ? expectAllowedActions(policyObj.allowed_actions)
          : (["draft_reply", "send_reply", "mark_read", "no_action"] as RuntimePolicy["allowed_actions"]),
      ...(Array.isArray(policyObj.secondary_charters) && policyObj.secondary_charters.length > 0
        ? { secondary_charters: (policyObj.secondary_charters as unknown[]).map((s) => String(s).trim()) }
        : {}),
      ...(Array.isArray(policyObj.allowed_tools) && policyObj.allowed_tools.length > 0
        ? { allowed_tools: (policyObj.allowed_tools as unknown[]).map((s) => String(s).trim()) }
        : {}),
      ...(typeof policyObj.require_human_approval === "boolean"
        ? { require_human_approval: policyObj.require_human_approval as boolean }
        : {}),
    };
  } catch (err) {
    errors.push(`Mailbox[${index}].policy: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Lifecycle config
  const lifecycleObj = isObject(mailbox.lifecycle) ? mailbox.lifecycle : {};
  const retentionObj = isObject(lifecycleObj.retention) ? lifecycleObj.retention : {};
  const scheduleObj = isObject(lifecycleObj.schedule) ? lifecycleObj.schedule : {};
  const lifecycle: LifecycleConfig = {
    tombstone_retention_days: expectNumber(lifecycleObj.tombstone_retention_days, 30),
    archive_after_days: expectNumber(lifecycleObj.archive_after_days, 90),
    archive_dir: isNonEmptyString(lifecycleObj.archive_dir) ? (lifecycleObj.archive_dir as string).trim() : "archive",
    compress_archives: expectBoolean(lifecycleObj.compress_archives, true),
    retention: {
      preserve_flagged: expectBoolean(retentionObj.preserve_flagged, true),
      preserve_unread: expectBoolean(retentionObj.preserve_unread, true),
      ...(typeof retentionObj.max_age_days === "number" ? { max_age_days: retentionObj.max_age_days as number } : {}),
      ...(typeof retentionObj.max_total_size === "string" ? { max_total_size: retentionObj.max_total_size as string } : {}),
      ...(typeof retentionObj.max_message_count === "number" ? { max_message_count: retentionObj.max_message_count as number } : {}),
    },
    schedule: {
      frequency: ["daily", "weekly", "on-sync", "manual"].includes(String(scheduleObj.frequency))
        ? (String(scheduleObj.frequency) as "daily" | "weekly" | "on-sync" | "manual")
        : "manual",
      max_run_time_minutes: expectNumber(scheduleObj.max_run_time_minutes, 60),
      ...(isObject(scheduleObj.time_window)
        ? {
            time_window: {
              start: String(scheduleObj.time_window.start),
              end: String(scheduleObj.time_window.end),
            },
          }
        : {}),
    },
  };

  // Webhook config
  const webhookObj = isObject(mailbox.webhook) ? mailbox.webhook : null;
  let webhook: MailboxConfig["webhook"] | undefined;
  if (webhookObj) {
    if (typeof webhookObj.enabled !== "boolean") {
      errors.push(`Mailbox[${index}].webhook.enabled must be a boolean`);
    } else {
      const whEnabled = webhookObj.enabled as boolean;
      if (whEnabled) {
        if (!isNonEmptyString(webhookObj.public_url)) {
          errors.push(`Mailbox[${index}].webhook.public_url is required when webhook is enabled`);
        }
        if (typeof webhookObj.port !== "number") {
          errors.push(`Mailbox[${index}].webhook.port is required when webhook is enabled`);
        }
        if (!isNonEmptyString(webhookObj.client_state)) {
          errors.push(`Mailbox[${index}].webhook.client_state is required when webhook is enabled`);
        }
      }
      webhook = {
        enabled: whEnabled,
        ...(isNonEmptyString(webhookObj.public_url)
          ? { public_url: (webhookObj.public_url as string).trim() }
          : {}),
        ...(typeof webhookObj.port === "number" ? { port: webhookObj.port as number } : {}),
        ...(isNonEmptyString(webhookObj.host) ? { host: (webhookObj.host as string).trim() } : {}),
        ...(isNonEmptyString(webhookObj.path) ? { path: (webhookObj.path as string).trim() } : {}),
        ...(isNonEmptyString(webhookObj.client_state)
          ? { client_state: (webhookObj.client_state as string).trim() }
          : {}),
        ...(isNonEmptyString(webhookObj.hmac_secret)
          ? { hmac_secret: (webhookObj.hmac_secret as string).trim() }
          : {}),
        ...(typeof webhookObj.subscription_expiration_minutes === "number"
          ? { subscription_expiration_minutes: webhookObj.subscription_expiration_minutes as number }
          : {}),
        ...(typeof webhookObj.auto_renew === "boolean"
          ? { auto_renew: webhookObj.auto_renew as boolean }
          : {}),
        ...(Array.isArray(webhookObj.change_types)
          ? { change_types: webhookObj.change_types as ChangeType[] }
          : {}),
        ...(isNonEmptyString(webhookObj.lifecycle_url)
          ? { lifecycle_url: (webhookObj.lifecycle_url as string).trim() }
          : {}),
        ...(typeof webhookObj.fallback_poll_minutes === "number"
          ? { fallback_poll_minutes: webhookObj.fallback_poll_minutes as number }
          : {}),
        ...(typeof webhookObj.hybrid_mode === "boolean"
          ? { hybrid_mode: webhookObj.hybrid_mode as boolean }
          : {}),
        ...(typeof webhookObj.rate_limit_max_requests === "number"
          ? { rate_limit_max_requests: webhookObj.rate_limit_max_requests as number }
          : {}),
        ...(typeof webhookObj.max_body_size === "number"
          ? { max_body_size: webhookObj.max_body_size as number }
          : {}),
      };
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const config: MailboxConfig = {
    id: (id as string).trim(),
    mailbox_id: (mailbox_id as string).trim(),
    root_dir: (root_dir as string).trim(),
    graph: {
      ...(isNonEmptyString(graphObj.tenant_id) ? { tenant_id: (graphObj.tenant_id as string).trim() } : {}),
      ...(isNonEmptyString(graphObj.client_id) ? { client_id: (graphObj.client_id as string).trim() } : {}),
      ...(isNonEmptyString(graphObj.client_secret) ? { client_secret: (graphObj.client_secret as string).trim() } : {}),
      user_id: (graphObj.user_id as string).trim(),
      ...(isNonEmptyString(graphObj.base_url) ? { base_url: (graphObj.base_url as string).trim() } : {}),
      prefer_immutable_ids: expectBoolean(graphObj.prefer_immutable_ids, true),
    },
    scope: {
      included_container_refs: Array.isArray(scopeObj.included_container_refs)
        ? scopeObj.included_container_refs as FolderRef[]
        : ["inbox", "sentitems", "drafts", "archive"],
      included_item_kinds: Array.isArray(scopeObj.included_item_kinds)
        ? scopeObj.included_item_kinds as string[]
        : ["message"],
    },
    sync: {
      attachment_policy: expectAttachmentPolicy(syncObj.attachment_policy),
      body_policy: expectBodyPolicy(syncObj.body_policy),
      include_headers: expectBoolean(syncObj.include_headers, DEFAULT_SYNC_OPTIONS.include_headers),
      tombstones_enabled: expectBoolean(syncObj.tombstones_enabled, DEFAULT_SYNC_OPTIONS.tombstones_enabled),
      polling_interval_ms: expectNumber(syncObj.polling_interval_ms, DEFAULT_SYNC_OPTIONS.polling_interval_ms),
      acquire_lock_timeout_ms: expectNumber(syncObj.acquire_lock_timeout_ms, DEFAULT_SYNC_OPTIONS.acquire_lock_timeout_ms),
      cleanup_tmp_on_startup: expectBoolean(syncObj.cleanup_tmp_on_startup, DEFAULT_SYNC_OPTIONS.cleanup_tmp_on_startup),
      rebuild_views_after_sync: expectBoolean(syncObj.rebuild_views_after_sync, DEFAULT_SYNC_OPTIONS.rebuild_views_after_sync),
      rebuild_search_after_sync: expectBoolean(syncObj.rebuild_search_after_sync, DEFAULT_SYNC_OPTIONS.rebuild_search_after_sync),
    },
    charter,
    ...(policy ? { policy } : {}),
    lifecycle,
    ...(webhook ? { webhook } : {}),
  };

  return { valid: true, errors: [], config };
}

/**
 * Validate global configuration
 */
function validateGlobalConfig(global: unknown): MultiMailboxGlobalConfig {
  if (!isObject(global)) {
    return DEFAULT_GLOBAL_CONFIG;
  }

  const resource_limits = isObject(global.resource_limits) ? global.resource_limits : {};

  return {
    max_concurrent_syncs: expectNumber(global.max_concurrent_syncs, DEFAULT_GLOBAL_CONFIG.max_concurrent_syncs),
    resource_limits: {
      maxMemoryMB: expectNumber(resource_limits.maxMemoryMB, DEFAULT_GLOBAL_CONFIG.resource_limits.maxMemoryMB),
      maxDiskIOPerSecond: expectNumber(resource_limits.maxDiskIOPerSecond, DEFAULT_GLOBAL_CONFIG.resource_limits.maxDiskIOPerSecond),
      maxNetworkRequestsPerSecond: expectNumber(
        resource_limits.maxNetworkRequestsPerSecond,
        DEFAULT_GLOBAL_CONFIG.resource_limits.maxNetworkRequestsPerSecond,
      ),
    },
    shutdown_timeout_ms: expectNumber(global.shutdown_timeout_ms, DEFAULT_GLOBAL_CONFIG.shutdown_timeout_ms),
  };
}

/**
 * Load and validate multi-mailbox configuration
 */
export async function loadMultiMailboxConfig(
  opts: LoadMultiMailboxOptions,
): Promise<LoadMultiMailboxResult> {
  const raw = await readFile(resolve(opts.path), "utf8");
  let parsed = JSON.parse(raw) as unknown;

  // Resolve secure references if storage is provided
  if (opts.storage) {
    parsed = await resolveSecrets(parsed, opts.storage);
  } else {
    const hasSecureRefs = checkForSecureRefs(parsed);
    if (hasSecureRefs) {
      throw new Error(
        "Config contains { $secure: ... } references but no secure storage was provided.",
      );
    }
  }

  if (!isObject(parsed)) {
    return {
      config: { mailboxes: [] },
      scopes: [],
      validationErrors: new Map([["root", ["Config must be an object"]]]),
      valid: false,
    };
  }

  // Validate mailboxes array
  const mailboxesRaw = parsed.mailboxes;
  if (!Array.isArray(mailboxesRaw)) {
    return {
      config: { mailboxes: [] },
      scopes: [],
      validationErrors: new Map([["mailboxes", ["mailboxes must be an array"]]]),
      valid: false,
    };
  }

  const validationErrors = new Map<string, string[]>();
  const mailboxes: MailboxConfig[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < mailboxesRaw.length; i++) {
    const result = validateMailboxConfig(mailboxesRaw[i], i);
    
    if (!result.valid) {
      validationErrors.set(`mailbox[${i}]`, result.errors);
    } else if (result.config) {
      // Check for duplicate IDs
      if (seenIds.has(result.config.id)) {
        validationErrors.set(result.config.id, [`Duplicate mailbox ID: ${result.config.id}`]);
      } else {
        seenIds.add(result.config.id);
        mailboxes.push(result.config);
      }
    }
  }

  // Validate shared token provider if present
  const shared = isObject(parsed.shared) ? parsed.shared : {};
  let tokenProvider: TokenProviderConfig | undefined;

  if (isObject(shared.token_provider)) {
    const tp = shared.token_provider;
    const tpErrors: string[] = [];

    if (tp.type !== "client_credentials") {
      tpErrors.push("token_provider.type must be 'client_credentials'");
    }
    if (!isNonEmptyString(tp.tenant_id)) {
      tpErrors.push("token_provider.tenant_id is required");
    }
    if (!isNonEmptyString(tp.client_id)) {
      tpErrors.push("token_provider.client_id is required");
    }
    if (!isNonEmptyString(tp.client_secret)) {
      tpErrors.push("token_provider.client_secret is required");
    }

    if (tpErrors.length > 0) {
      validationErrors.set("shared.token_provider", tpErrors);
    } else {
      tokenProvider = {
        type: "client_credentials",
        tenant_id: (tp.tenant_id as string).trim(),
        client_id: (tp.client_id as string).trim(),
        client_secret: (tp.client_secret as string).trim(),
        scope: isNonEmptyString(tp.scope) ? (tp.scope as string).trim() : undefined,
      };
    }
  }

  const config: MultiMailboxConfig = {
    mailboxes,
    ...(tokenProvider ? { shared: { token_provider: tokenProvider } } : {}),
    global: validateGlobalConfig(parsed.global),
  };

  const valid = validationErrors.size === 0 && mailboxes.length > 0;
  const scopes = mailboxes.map(toScopeConfig);

  return {
    config,
    scopes,
    validationErrors,
    valid,
  };
}

/**
 * Convert a legacy MailboxConfig to a ScopeConfig.
 */
export function toScopeConfig(mailbox: MailboxConfig): ScopeConfig {
  return {
    scope_id: mailbox.mailbox_id,
    root_dir: mailbox.root_dir,
    sources: [
      {
        type: "graph",
        ...(mailbox.graph.tenant_id ? { tenant_id: mailbox.graph.tenant_id } : {}),
        ...(mailbox.graph.client_id ? { client_id: mailbox.graph.client_id } : {}),
        ...(mailbox.graph.client_secret ? { client_secret: mailbox.graph.client_secret } : {}),
        user_id: mailbox.graph.user_id,
        ...(mailbox.graph.base_url ? { base_url: mailbox.graph.base_url } : {}),
        prefer_immutable_ids: mailbox.graph.prefer_immutable_ids,
      },
    ],
    context_strategy: "mail",
    scope: mailbox.scope ?? {
      included_container_refs: ["inbox", "sentitems", "drafts", "archive"],
      included_item_kinds: ["message"],
    },
    normalize: {
      attachment_policy: mailbox.sync?.attachment_policy ?? "metadata_only",
      body_policy: mailbox.sync?.body_policy ?? "text_only",
      include_headers: mailbox.sync?.include_headers ?? false,
      tombstones_enabled: mailbox.sync?.tombstones_enabled ?? true,
    },
    runtime: {
      polling_interval_ms: mailbox.sync?.polling_interval_ms ?? 60000,
      acquire_lock_timeout_ms: mailbox.sync?.acquire_lock_timeout_ms ?? 30000,
      cleanup_tmp_on_startup: mailbox.sync?.cleanup_tmp_on_startup ?? true,
      rebuild_views_after_sync: mailbox.sync?.rebuild_views_after_sync ?? true,
      rebuild_search_after_sync: mailbox.sync?.rebuild_search_after_sync ?? false,
    },
    ...(mailbox.charter ? { charter: mailbox.charter } : {}),
    policy: mailbox.policy ?? {
      primary_charter: "support_steward",
      allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
    },
    ...(mailbox.lifecycle ? { lifecycle: mailbox.lifecycle } : {}),
    ...(mailbox.webhook ? { webhook: mailbox.webhook } : {}),
    graph: mailbox.graph,
  };
}

/**
 * Get a mailbox config by ID
 */
export function getMailboxById(
  config: MultiMailboxConfig,
  id: string,
): MailboxConfig | undefined {
  return config.mailboxes.find(m => m.id === id);
}

/**
 * Check if a config uses the legacy multi-mailbox shape.
 *
 * Modern operation configs use `scopes[]` and must be loaded through
 * `loadConfig()`, not the legacy multi-mailbox adapter.
 */
export function isMultiMailboxConfig(obj: unknown): obj is { mailboxes: unknown[] } {
  return isObject(obj) && Array.isArray(obj.mailboxes);
}

export function isMultiScopeConfig(obj: unknown): obj is { scopes: unknown[] } {
  return isObject(obj) && Array.isArray(obj.scopes);
}
