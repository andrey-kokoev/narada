import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExchangeFsSyncConfig, ScopeConfig } from "./types.js";
import type { ChangeType } from "../adapter/graph/subscription.js";
import {
  DEFAULT_EXCHANGE_FS_SYNC_CONFIG,
  DEFAULT_STUCK_WORK_THRESHOLDS,
  DEFAULT_STUCK_OUTBOUND_THRESHOLDS,
} from "./defaults.js";
import type { SecureStorage } from "../auth/secure-storage.js";
import { resolveSecrets, isSecureRef } from "./secure-config.js";

const DEFAULTS = DEFAULT_EXCHANGE_FS_SYNC_CONFIG as typeof DEFAULT_EXCHANGE_FS_SYNC_CONFIG & {
  normalize: ScopeConfig["normalize"];
  runtime: ScopeConfig["runtime"];
  policy: ScopeConfig["policy"];
  lifecycle: NonNullable<ExchangeFsSyncConfig["lifecycle"]>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function expectObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function expectBoolean(value: unknown, path: string): boolean {
  if (!isBoolean(value)) {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of strings`);
  }

  return value.map((item, index) =>
    expectString(item, `${path}[${index}]`),
  );
}

function expectAttachmentPolicy(
  value: unknown,
  path: string,
): ScopeConfig["normalize"]["attachment_policy"] {
  if (
    value === "exclude" ||
    value === "metadata_only" ||
    value === "include_content"
  ) {
    return value;
  }

  throw new Error(
    `${path} must be one of: exclude, metadata_only, include_content`,
  );
}

function expectBodyPolicy(
  value: unknown,
  path: string,
): ScopeConfig["normalize"]["body_policy"] {
  if (
    value === "text_only" ||
    value === "html_only" ||
    value === "text_and_html"
  ) {
    return value;
  }

  throw new Error(
    `${path} must be one of: text_only, html_only, text_and_html`,
  );
}

function expectNumber(value: unknown, path: string): number {
  if (!isPositiveNumber(value)) {
    throw new Error(`${path} must be a non-negative finite number`);
  }
  return value;
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

function expectAllowedActions(value: unknown, path: string): ScopeConfig["policy"]["allowed_actions"] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of allowed actions`);
  }
  const actions = value.map((item, index) => {
    const action = expectString(item, `${path}[${index}]`);
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new Error(`${path}[${index}] must be a valid allowed action, got "${action}"`);
    }
    return action as ScopeConfig["policy"]["allowed_actions"][number];
  });
  if (actions.length === 0) {
    throw new Error(`${path} must contain at least one allowed action`);
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

export interface LoadConfigOptions {
  path: string;
  /** Secure storage for resolving { "$secure": "key" } references */
  storage?: SecureStorage;
}

function loadScopeConfig(rawScope: unknown, pathPrefix: string): ScopeConfig {
  const scope = expectObject(rawScope, pathPrefix);

  const scopeId = expectString(
    scope.scope_id ?? scope.id ?? scope.mailbox_id,
    `${pathPrefix}.scope_id`,
  );
  const rootDir = expectString(scope.root_dir, `${pathPrefix}.root_dir`);

  // Sources
  const sourcesRaw = Array.isArray(scope.sources) ? scope.sources : [];
  const hasLegacyGraph = isObject(scope.graph);
  if (sourcesRaw.length === 0 && hasLegacyGraph) {
    const graphObj = scope.graph as Record<string, unknown>;
    sourcesRaw.push({
      type: "graph",
      ...(isNonEmptyString(graphObj.tenant_id) ? { tenant_id: graphObj.tenant_id.trim() } : {}),
      ...(isNonEmptyString(graphObj.client_id) ? { client_id: graphObj.client_id.trim() } : {}),
      ...(isNonEmptyString(graphObj.client_secret) ? { client_secret: graphObj.client_secret.trim() } : {}),
      ...(isNonEmptyString(graphObj.user_id) ? { user_id: graphObj.user_id.trim() } : {}),
      ...(isNonEmptyString(graphObj.base_url) ? { base_url: graphObj.base_url.trim() } : {}),
      ...(isBoolean(graphObj.prefer_immutable_ids) ? { prefer_immutable_ids: graphObj.prefer_immutable_ids } : {}),
    });
  }
  if (sourcesRaw.length === 0) {
    throw new Error(`${pathPrefix}.sources must contain at least one source`);
  }
  const sources = sourcesRaw.map((s, i) => {
    const src = expectObject(s, `${pathPrefix}.sources[${i}]`);
    const type = expectString(src.type, `${pathPrefix}.sources[${i}].type`);
    if (!["graph", "timer", "webhook", "mock"].includes(type)) {
      throw new Error(`${pathPrefix}.sources[${i}].type must be one of: graph, timer, webhook, mock`);
    }
    return { type, ...src } as ScopeConfig["sources"][number];
  });

  // Context strategy
  const contextStrategy = isNonEmptyString(scope.context_strategy)
    ? scope.context_strategy.trim()
    : "mail";

  // Scope filters
  const scopeObj = isObject(scope.scope) ? scope.scope : {};
  const scopeFilters = {
    included_container_refs: Array.isArray(scopeObj.included_container_refs)
      ? expectStringArray(scopeObj.included_container_refs, `${pathPrefix}.scope.included_container_refs`)
      : ["inbox", "sentitems", "drafts", "archive"],
    included_item_kinds: Array.isArray(scopeObj.included_item_kinds)
      ? expectStringArray(scopeObj.included_item_kinds, `${pathPrefix}.scope.included_item_kinds`)
      : ["message"],
  };

  // Normalize
  const normalizeRaw = isObject(scope.normalize) ? scope.normalize : {};
  const normalize = {
    attachment_policy: expectAttachmentPolicy(
      normalizeRaw.attachment_policy ?? DEFAULTS.normalize.attachment_policy,
      `${pathPrefix}.normalize.attachment_policy`,
    ),
    body_policy: expectBodyPolicy(
      normalizeRaw.body_policy ?? DEFAULTS.normalize.body_policy,
      `${pathPrefix}.normalize.body_policy`,
    ),
    include_headers: expectBoolean(
      normalizeRaw.include_headers ?? DEFAULTS.normalize.include_headers,
      `${pathPrefix}.normalize.include_headers`,
    ),
    tombstones_enabled: expectBoolean(
      normalizeRaw.tombstones_enabled ?? DEFAULTS.normalize.tombstones_enabled,
      `${pathPrefix}.normalize.tombstones_enabled`,
    ),
  };

  // Runtime
  const runtimeRaw = isObject(scope.runtime) ? scope.runtime : {};
  const runtime = {
    polling_interval_ms: expectNumber(
      runtimeRaw.polling_interval_ms ?? DEFAULTS.runtime.polling_interval_ms,
      `${pathPrefix}.runtime.polling_interval_ms`,
    ),
    acquire_lock_timeout_ms: expectNumber(
      runtimeRaw.acquire_lock_timeout_ms ?? DEFAULTS.runtime.acquire_lock_timeout_ms,
      `${pathPrefix}.runtime.acquire_lock_timeout_ms`,
    ),
    cleanup_tmp_on_startup: expectBoolean(
      runtimeRaw.cleanup_tmp_on_startup ?? DEFAULTS.runtime.cleanup_tmp_on_startup,
      `${pathPrefix}.runtime.cleanup_tmp_on_startup`,
    ),
    rebuild_views_after_sync: expectBoolean(
      runtimeRaw.rebuild_views_after_sync ?? DEFAULTS.runtime.rebuild_views_after_sync,
      `${pathPrefix}.runtime.rebuild_views_after_sync`,
    ),
    rebuild_search_after_sync: expectBoolean(
      runtimeRaw.rebuild_search_after_sync ?? DEFAULTS.runtime.rebuild_search_after_sync,
      `${pathPrefix}.runtime.rebuild_search_after_sync`,
    ),
  };

  // Charter
  const charterRaw = isObject(scope.charter) ? scope.charter : {};
  const charter = {
    runtime:
      typeof charterRaw.runtime === "string" && charterRaw.runtime.length > 0
        ? charterRaw.runtime.trim()
        : (DEFAULTS.charter?.runtime ?? "mock"),
    ...(isNonEmptyString(charterRaw.api_key)
      ? { api_key: charterRaw.api_key.trim() }
      : {}),
    ...(isNonEmptyString(charterRaw.model)
      ? { model: charterRaw.model.trim() }
      : {}),
    ...(isNonEmptyString(charterRaw.base_url)
      ? { base_url: charterRaw.base_url.trim() }
      : {}),
    ...(charterRaw.timeout_ms !== undefined
      ? { timeout_ms: expectNumber(charterRaw.timeout_ms, `${pathPrefix}.charter.timeout_ms`) }
      : {}),
  };

  // Policy
  const policyRaw = isObject(scope.policy) ? scope.policy : {};
  const policy = {
    primary_charter: isNonEmptyString(policyRaw.primary_charter)
      ? policyRaw.primary_charter.trim()
      : DEFAULTS.policy.primary_charter,
    allowed_actions:
      policyRaw.allowed_actions !== undefined
        ? expectAllowedActions(policyRaw.allowed_actions, `${pathPrefix}.policy.allowed_actions`)
        : DEFAULTS.policy.allowed_actions,
    ...(Array.isArray(policyRaw.secondary_charters) && policyRaw.secondary_charters.length > 0
      ? { secondary_charters: expectStringArray(policyRaw.secondary_charters, `${pathPrefix}.policy.secondary_charters`) }
      : {}),
    ...(Array.isArray(policyRaw.allowed_tools) && policyRaw.allowed_tools.length > 0
      ? { allowed_tools: expectStringArray(policyRaw.allowed_tools, `${pathPrefix}.policy.allowed_tools`) }
      : {}),
    ...(isBoolean(policyRaw.require_human_approval)
      ? { require_human_approval: policyRaw.require_human_approval }
      : {}),
    ...(isBoolean(policyRaw.runtime_authorized)
      ? { runtime_authorized: policyRaw.runtime_authorized }
      : {}),
    ...(isBoolean(policyRaw.admin_authorized)
      ? { admin_authorized: policyRaw.admin_authorized }
      : {}),
  };

  // Executors
  const executorsRaw = Array.isArray(scope.executors) ? scope.executors : [];
  const executors = executorsRaw.length > 0
    ? executorsRaw.map((e, i) => {
        const ex = expectObject(e, `${pathPrefix}.executors[${i}]`);
        return {
          family: expectString(ex.family, `${pathPrefix}.executors[${i}].family`),
          ...(isObject(ex.options) ? { options: ex.options } : {}),
        };
      })
    : undefined;

  // Webhook (scope-local, optional)
  const webhookRaw = isObject(scope.webhook) ? scope.webhook : null;
  const webhook = webhookRaw ? buildWebhookConfig(webhookRaw, `${pathPrefix}.webhook`) : undefined;

  // Lifecycle (scope-local, optional)
  const lifecycleRaw = isObject(scope.lifecycle) ? scope.lifecycle : null;
  const lifecycle = lifecycleRaw ? buildLifecycleConfig(lifecycleRaw, `${pathPrefix}.lifecycle`) : undefined;

  // Operational trust thresholds (optional)
  const operationalTrustRaw = isObject(scope.operational_trust) ? scope.operational_trust : null;
  const operational_trust = operationalTrustRaw
    ? buildOperationalTrustConfig(operationalTrustRaw, `${pathPrefix}.operational_trust`)
    : undefined;

  // Legacy graph field for backward compat
  const graph = hasLegacyGraph
    ? {
        ...(isNonEmptyString((scope.graph as Record<string, unknown>).tenant_id)
          ? { tenant_id: ((scope.graph as Record<string, unknown>).tenant_id as string).trim() }
          : {}),
        ...(isNonEmptyString((scope.graph as Record<string, unknown>).client_id)
          ? { client_id: ((scope.graph as Record<string, unknown>).client_id as string).trim() }
          : {}),
        ...(isNonEmptyString((scope.graph as Record<string, unknown>).client_secret)
          ? { client_secret: ((scope.graph as Record<string, unknown>).client_secret as string).trim() }
          : {}),
        user_id: expectString((scope.graph as Record<string, unknown>).user_id, `${pathPrefix}.graph.user_id`),
        ...(isNonEmptyString((scope.graph as Record<string, unknown>).base_url)
          ? { base_url: ((scope.graph as Record<string, unknown>).base_url as string).trim() }
          : {}),
        prefer_immutable_ids: expectBoolean(
          (scope.graph as Record<string, unknown>).prefer_immutable_ids,
          `${pathPrefix}.graph.prefer_immutable_ids`,
        ),
      }
    : undefined;

  return {
    scope_id: scopeId,
    root_dir: rootDir,
    sources,
    context_strategy: contextStrategy,
    scope: scopeFilters,
    normalize,
    runtime,
    charter,
    policy,
    ...(executors ? { executors } : {}),
    ...(webhook ? { webhook } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(operational_trust ? { operational_trust } : {}),
    ...(graph ? { graph } : {}),
  };
}

function buildWebhookConfig(webhookRaw: Record<string, unknown>, path: string): NonNullable<ExchangeFsSyncConfig["webhook"]> {
  const enabled = webhookRaw.enabled;
  if (typeof enabled !== "boolean") {
    throw new Error(`${path}.enabled must be a boolean`);
  }
  if (enabled) {
    if (!isNonEmptyString(webhookRaw.public_url)) {
      throw new Error(`${path}.public_url is required when webhook is enabled`);
    }
    if (typeof webhookRaw.port !== "number") {
      throw new Error(`${path}.port is required when webhook is enabled`);
    }
    if (!isNonEmptyString(webhookRaw.client_state)) {
      throw new Error(`${path}.client_state is required when webhook is enabled`);
    }
  }
  return {
    enabled,
    ...(isNonEmptyString(webhookRaw.public_url)
      ? { public_url: (webhookRaw.public_url as string).trim() }
      : {}),
    ...(typeof webhookRaw.port === "number" ? { port: webhookRaw.port as number } : {}),
    ...(isNonEmptyString(webhookRaw.host) ? { host: (webhookRaw.host as string).trim() } : {}),
    ...(isNonEmptyString(webhookRaw.path) ? { path: (webhookRaw.path as string).trim() } : {}),
    ...(isNonEmptyString(webhookRaw.client_state)
      ? { client_state: (webhookRaw.client_state as string).trim() }
      : {}),
    ...(isNonEmptyString(webhookRaw.hmac_secret)
      ? { hmac_secret: (webhookRaw.hmac_secret as string).trim() }
      : {}),
    ...(typeof webhookRaw.subscription_expiration_minutes === "number"
      ? { subscription_expiration_minutes: webhookRaw.subscription_expiration_minutes as number }
      : {}),
    ...(typeof webhookRaw.auto_renew === "boolean"
      ? { auto_renew: webhookRaw.auto_renew as boolean }
      : {}),
    ...(Array.isArray(webhookRaw.change_types)
      ? { change_types: webhookRaw.change_types as ChangeType[] }
      : {}),
    ...(isNonEmptyString(webhookRaw.lifecycle_url)
      ? { lifecycle_url: (webhookRaw.lifecycle_url as string).trim() }
      : {}),
    ...(typeof webhookRaw.fallback_poll_minutes === "number"
      ? { fallback_poll_minutes: webhookRaw.fallback_poll_minutes as number }
      : {}),
    ...(typeof webhookRaw.hybrid_mode === "boolean"
      ? { hybrid_mode: webhookRaw.hybrid_mode as boolean }
      : {}),
    ...(typeof webhookRaw.rate_limit_max_requests === "number"
      ? { rate_limit_max_requests: webhookRaw.rate_limit_max_requests as number }
      : {}),
    ...(typeof webhookRaw.max_body_size === "number"
      ? { max_body_size: webhookRaw.max_body_size as number }
      : {}),
  };
}

function buildLifecycleConfig(lifecycleRaw: Record<string, unknown>, path: string): NonNullable<ExchangeFsSyncConfig["lifecycle"]> {
  const retentionRaw = isObject(lifecycleRaw.retention) ? lifecycleRaw.retention : {};
  const scheduleRaw = isObject(lifecycleRaw.schedule) ? lifecycleRaw.schedule : {};
  return {
    tombstone_retention_days: expectNumber(
      lifecycleRaw.tombstone_retention_days ?? DEFAULTS.lifecycle.tombstone_retention_days,
      `${path}.tombstone_retention_days`,
    ),
    archive_after_days: expectNumber(
      lifecycleRaw.archive_after_days ?? DEFAULTS.lifecycle.archive_after_days,
      `${path}.archive_after_days`,
    ),
    archive_dir: expectString(
      lifecycleRaw.archive_dir ?? DEFAULTS.lifecycle.archive_dir,
      `${path}.archive_dir`,
    ),
    compress_archives: expectBoolean(
      lifecycleRaw.compress_archives ?? DEFAULTS.lifecycle.compress_archives,
      `${path}.compress_archives`,
    ),
    retention: {
      max_age_days:
        retentionRaw.max_age_days !== undefined
          ? expectNumber(retentionRaw.max_age_days, `${path}.retention.max_age_days`)
          : undefined,
      max_total_size:
        retentionRaw.max_total_size !== undefined
          ? expectString(retentionRaw.max_total_size, `${path}.retention.max_total_size`)
          : undefined,
      max_message_count:
        retentionRaw.max_message_count !== undefined
          ? expectNumber(retentionRaw.max_message_count, `${path}.retention.max_message_count`)
          : undefined,
      preserve_flagged: expectBoolean(
        retentionRaw.preserve_flagged ?? DEFAULTS.lifecycle.retention.preserve_flagged,
        `${path}.retention.preserve_flagged`,
      ),
      preserve_unread: expectBoolean(
        retentionRaw.preserve_unread ?? DEFAULTS.lifecycle.retention.preserve_unread,
        `${path}.retention.preserve_unread`,
      ),
    },
    schedule: {
      frequency:
        scheduleRaw.frequency === "daily" ||
        scheduleRaw.frequency === "weekly" ||
        scheduleRaw.frequency === "on-sync" ||
        scheduleRaw.frequency === "manual"
          ? scheduleRaw.frequency
          : DEFAULTS.lifecycle.schedule.frequency,
      max_run_time_minutes: expectNumber(
        scheduleRaw.max_run_time_minutes ?? DEFAULTS.lifecycle.schedule.max_run_time_minutes,
        `${path}.schedule.max_run_time_minutes`,
      ),
      time_window:
        isObject(scheduleRaw.time_window) &&
        isNonEmptyString(scheduleRaw.time_window.start) &&
        isNonEmptyString(scheduleRaw.time_window.end)
          ? {
              start: scheduleRaw.time_window.start.trim(),
              end: scheduleRaw.time_window.end.trim(),
            }
          : undefined,
    },
  };
}

function buildOperationalTrustConfig(
  raw: Record<string, unknown>,
  path: string,
): NonNullable<ScopeConfig["operational_trust"]> {
  const workRaw = isObject(raw.stuck_work_thresholds) ? raw.stuck_work_thresholds : {};
  const outboundRaw = isObject(raw.stuck_outbound_thresholds)
    ? raw.stuck_outbound_thresholds
    : {};

  return {
    stuck_work_thresholds: {
      opened_max_age_minutes: expectNumber(
        workRaw.opened_max_age_minutes ?? DEFAULT_STUCK_WORK_THRESHOLDS.opened_max_age_minutes,
        `${path}.stuck_work_thresholds.opened_max_age_minutes`,
      ),
      leased_max_age_minutes: expectNumber(
        workRaw.leased_max_age_minutes ?? DEFAULT_STUCK_WORK_THRESHOLDS.leased_max_age_minutes,
        `${path}.stuck_work_thresholds.leased_max_age_minutes`,
      ),
      executing_max_age_minutes: expectNumber(
        workRaw.executing_max_age_minutes ?? DEFAULT_STUCK_WORK_THRESHOLDS.executing_max_age_minutes,
        `${path}.stuck_work_thresholds.executing_max_age_minutes`,
      ),
      max_retries: expectNumber(
        workRaw.max_retries ?? DEFAULT_STUCK_WORK_THRESHOLDS.max_retries,
        `${path}.stuck_work_thresholds.max_retries`,
      ),
    },
    stuck_outbound_thresholds: {
      pending_max_age_minutes: expectNumber(
        outboundRaw.pending_max_age_minutes ?? DEFAULT_STUCK_OUTBOUND_THRESHOLDS.pending_max_age_minutes,
        `${path}.stuck_outbound_thresholds.pending_max_age_minutes`,
      ),
      draft_creating_max_age_minutes: expectNumber(
        outboundRaw.draft_creating_max_age_minutes ?? DEFAULT_STUCK_OUTBOUND_THRESHOLDS.draft_creating_max_age_minutes,
        `${path}.stuck_outbound_thresholds.draft_creating_max_age_minutes`,
      ),
      draft_ready_max_age_hours: expectNumber(
        outboundRaw.draft_ready_max_age_hours ?? DEFAULT_STUCK_OUTBOUND_THRESHOLDS.draft_ready_max_age_hours,
        `${path}.stuck_outbound_thresholds.draft_ready_max_age_hours`,
      ),
      sending_max_age_minutes: expectNumber(
        outboundRaw.sending_max_age_minutes ?? DEFAULT_STUCK_OUTBOUND_THRESHOLDS.sending_max_age_minutes,
        `${path}.stuck_outbound_thresholds.sending_max_age_minutes`,
      ),
    },
  };
}

export async function loadConfig(
  opts: LoadConfigOptions,
): Promise<ExchangeFsSyncConfig> {
  const raw = await readFile(resolve(opts.path), "utf8");
  let parsed = JSON.parse(raw) as unknown;

  // Resolve secure references if storage is provided
  if (opts.storage) {
    parsed = await resolveSecrets(parsed, opts.storage);
  } else {
    // Check for secure refs without storage
    const hasSecureRefs = checkForSecureRefs(parsed);
    if (hasSecureRefs) {
      throw new Error(
        "Config contains { $secure: ... } references but no secure storage was provided. " +
          "Either provide a storage parameter or use loadConfigWithStorage().",
      );
    }
  }

  const root = expectObject(parsed, "config");
  const rootDir = expectString(root.root_dir, "config.root_dir");

  // Global webhook
  const globalWebhookRaw = isObject(root.webhook) ? root.webhook : null;
  const globalWebhook = globalWebhookRaw ? buildWebhookConfig(globalWebhookRaw, "config.webhook") : undefined;

  // Global lifecycle
  const globalLifecycleRaw = isObject(root.lifecycle) ? root.lifecycle : null;
  const isLegacyMode = !Array.isArray(root.scopes) || root.scopes.length === 0;
  const globalLifecycle = globalLifecycleRaw
    ? buildLifecycleConfig(globalLifecycleRaw, "config.lifecycle")
    : isLegacyMode
      ? buildLifecycleConfig({}, "config.lifecycle")
      : undefined;

  let scopes: ScopeConfig[];

  if (Array.isArray(root.scopes) && root.scopes.length > 0) {
    scopes = root.scopes.map((s, i) => loadScopeConfig(s, `config.scopes[${i}]`));
  } else {
    // Legacy bridge: auto-promote top-level single-scope fields into a ScopeConfig
    const legacyScopeId = root.scope_id ?? root.mailbox_id;
    if (!isNonEmptyString(legacyScopeId)) {
      throw new Error(
        "Config must define either scopes[] or a legacy scope_id/mailbox_id for backward compatibility",
      );
    }

    const legacyScope = {
      scope_id: legacyScopeId,
      root_dir: rootDir,
      graph: root.graph,
      scope: root.scope,
      normalize: root.normalize,
      runtime: root.runtime,
      lifecycle: root.lifecycle,
      charter: root.charter,
      policy: root.policy,
      webhook: root.webhook,
      sources: [], // will be backfilled from graph
      context_strategy: root.context_strategy ?? "mail",
      executors: root.executors,
    };

    scopes = [loadScopeConfig(legacyScope, "config(legacy)")];
  }

  const firstScope = scopes[0];

  const config: ExchangeFsSyncConfig = {
    root_dir: rootDir,
    scopes,
    ...(globalLifecycle ? { lifecycle: globalLifecycle } : {}),
    ...(globalWebhook ? { webhook: globalWebhook } : {}),
    // Legacy backward-compatibility: hoist first scope fields to top level
    ...(firstScope
      ? {
          scope_id: firstScope.scope_id,
          mailbox_id: firstScope.scope_id,
          ...(firstScope.sources[0]
            ? {
                graph: {
                  user_id: firstScope.sources[0].user_id ?? "",
                  prefer_immutable_ids: firstScope.sources[0].prefer_immutable_ids ?? false,
                  ...(firstScope.sources[0].tenant_id !== undefined ? { tenant_id: firstScope.sources[0].tenant_id } : {}),
                  ...(firstScope.sources[0].client_id !== undefined ? { client_id: firstScope.sources[0].client_id } : {}),
                  ...(firstScope.sources[0].client_secret !== undefined ? { client_secret: firstScope.sources[0].client_secret } : {}),
                  ...(firstScope.sources[0].base_url !== undefined ? { base_url: firstScope.sources[0].base_url } : {}),
                },
              }
            : {}),
          scope: firstScope.scope,
          normalize: firstScope.normalize,
          runtime: firstScope.runtime,
          ...(firstScope.charter !== undefined ? { charter: firstScope.charter } : {}),
          policy: firstScope.policy,
        }
      : {}),
  };

  return config;
}
