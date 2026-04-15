import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExchangeFsSyncConfig } from "./types.js";
import { DEFAULT_EXCHANGE_FS_SYNC_CONFIG } from "./defaults.js";
import type { SecureStorage } from "../auth/secure-storage.js";
import { resolveSecrets, isSecureRef } from "./secure-config.js";

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
): ExchangeFsSyncConfig["normalize"]["attachment_policy"] {
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
): ExchangeFsSyncConfig["normalize"]["body_policy"] {
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

function expectAllowedActions(value: unknown, path: string): ExchangeFsSyncConfig["policy"]["allowed_actions"] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of allowed actions`);
  }
  const actions = value.map((item, index) => {
    const action = expectString(item, `${path}[${index}]`);
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new Error(`${path}[${index}] must be a valid allowed action, got "${action}"`);
    }
    return action as ExchangeFsSyncConfig["policy"]["allowed_actions"][number];
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
  const graph = expectObject(root.graph, "config.graph");
  const scope = expectObject(root.scope, "config.scope");

  const normalizeRaw = isObject(root.normalize) ? root.normalize : {};
  const runtimeRaw = isObject(root.runtime) ? root.runtime : {};
  const lifecycleRaw = isObject(root.lifecycle) ? root.lifecycle : {};
  const charterRaw = isObject(root.charter) ? root.charter : {};
  const retentionRaw = isObject(lifecycleRaw.retention) ? lifecycleRaw.retention : {};
  const scheduleRaw = isObject(lifecycleRaw.schedule) ? lifecycleRaw.schedule : {};

  const mailbox_id = expectString(root.mailbox_id, "config.mailbox_id");
  const root_dir = expectString(root.root_dir, "config.root_dir");

  const merged: ExchangeFsSyncConfig = {
    mailbox_id,
    root_dir,
    graph: {
      ...(isNonEmptyString(graph.tenant_id)
        ? { tenant_id: graph.tenant_id.trim() }
        : {}),
      ...(isNonEmptyString(graph.client_id)
        ? { client_id: graph.client_id.trim() }
        : {}),
      ...(isNonEmptyString(graph.client_secret)
        ? { client_secret: graph.client_secret.trim() }
        : {}),
      user_id: expectString(graph.user_id, "config.graph.user_id"),
      ...(isNonEmptyString(graph.base_url)
        ? { base_url: graph.base_url.trim() }
        : {}),
      prefer_immutable_ids: expectBoolean(
        graph.prefer_immutable_ids,
        "config.graph.prefer_immutable_ids",
      ),
    },
    scope: {
      included_container_refs: expectStringArray(
        scope.included_container_refs,
        "config.scope.included_container_refs",
      ),
      included_item_kinds: expectStringArray(
        scope.included_item_kinds,
        "config.scope.included_item_kinds",
      ),
    },
    normalize: {
      attachment_policy: expectAttachmentPolicy(
        normalizeRaw.attachment_policy ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.attachment_policy,
        "config.normalize.attachment_policy",
      ),
      body_policy: expectBodyPolicy(
        normalizeRaw.body_policy ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.body_policy,
        "config.normalize.body_policy",
      ),
      include_headers: expectBoolean(
        normalizeRaw.include_headers ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.include_headers,
        "config.normalize.include_headers",
      ),
      tombstones_enabled: expectBoolean(
        normalizeRaw.tombstones_enabled ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.tombstones_enabled,
        "config.normalize.tombstones_enabled",
      ),
    },
    runtime: {
      polling_interval_ms: expectNumber(
        runtimeRaw.polling_interval_ms ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.polling_interval_ms,
        "config.runtime.polling_interval_ms",
      ),
      acquire_lock_timeout_ms: expectNumber(
        runtimeRaw.acquire_lock_timeout_ms ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.acquire_lock_timeout_ms,
        "config.runtime.acquire_lock_timeout_ms",
      ),
      cleanup_tmp_on_startup: expectBoolean(
        runtimeRaw.cleanup_tmp_on_startup ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.cleanup_tmp_on_startup,
        "config.runtime.cleanup_tmp_on_startup",
      ),
      rebuild_views_after_sync: expectBoolean(
        runtimeRaw.rebuild_views_after_sync ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.rebuild_views_after_sync,
        "config.runtime.rebuild_views_after_sync",
      ),
    },
    charter: {
      runtime:
        typeof charterRaw.runtime === "string" && charterRaw.runtime.length > 0
          ? charterRaw.runtime.trim()
          : (DEFAULT_EXCHANGE_FS_SYNC_CONFIG.charter?.runtime ?? "mock"),
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
        ? { timeout_ms: expectNumber(charterRaw.timeout_ms, "config.charter.timeout_ms") }
        : {}),
    },
    policy: (() => {
      const policyRaw = isObject(root.policy) ? root.policy : {};
      const primaryCharter = isNonEmptyString(policyRaw.primary_charter)
        ? policyRaw.primary_charter.trim()
        : DEFAULT_EXCHANGE_FS_SYNC_CONFIG.policy.primary_charter;
      const allowedActions =
        policyRaw.allowed_actions !== undefined
          ? expectAllowedActions(policyRaw.allowed_actions, "config.policy.allowed_actions")
          : DEFAULT_EXCHANGE_FS_SYNC_CONFIG.policy.allowed_actions;
      return {
        primary_charter: primaryCharter,
        allowed_actions: allowedActions,
        ...(Array.isArray(policyRaw.secondary_charters) && policyRaw.secondary_charters.length > 0
          ? {
              secondary_charters: expectStringArray(
                policyRaw.secondary_charters,
                "config.policy.secondary_charters",
              ),
            }
          : {}),
        ...(Array.isArray(policyRaw.allowed_tools) && policyRaw.allowed_tools.length > 0
          ? {
              allowed_tools: expectStringArray(
                policyRaw.allowed_tools,
                "config.policy.allowed_tools",
              ),
            }
          : {}),
        ...(isBoolean(policyRaw.require_human_approval)
          ? { require_human_approval: policyRaw.require_human_approval }
          : {}),
      };
    })(),
    lifecycle: {
      tombstone_retention_days: expectNumber(
        lifecycleRaw.tombstone_retention_days ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.tombstone_retention_days,
        "config.lifecycle.tombstone_retention_days",
      ),
      archive_after_days: expectNumber(
        lifecycleRaw.archive_after_days ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.archive_after_days,
        "config.lifecycle.archive_after_days",
      ),
      archive_dir: expectString(
        lifecycleRaw.archive_dir ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.archive_dir,
        "config.lifecycle.archive_dir",
      ),
      compress_archives: expectBoolean(
        lifecycleRaw.compress_archives ??
          DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.compress_archives,
        "config.lifecycle.compress_archives",
      ),
      retention: {
        max_age_days:
          retentionRaw.max_age_days !== undefined
            ? expectNumber(retentionRaw.max_age_days, "config.lifecycle.retention.max_age_days")
            : undefined,
        max_total_size:
          retentionRaw.max_total_size !== undefined
            ? expectString(retentionRaw.max_total_size, "config.lifecycle.retention.max_total_size")
            : undefined,
        max_message_count:
          retentionRaw.max_message_count !== undefined
            ? expectNumber(retentionRaw.max_message_count, "config.lifecycle.retention.max_message_count")
            : undefined,
        preserve_flagged: expectBoolean(
          retentionRaw.preserve_flagged ??
            DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.retention.preserve_flagged,
          "config.lifecycle.retention.preserve_flagged",
        ),
        preserve_unread: expectBoolean(
          retentionRaw.preserve_unread ??
            DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.retention.preserve_unread,
          "config.lifecycle.retention.preserve_unread",
        ),
      },
      schedule: {
        frequency:
          scheduleRaw.frequency === "daily" ||
          scheduleRaw.frequency === "weekly" ||
          scheduleRaw.frequency === "on-sync" ||
          scheduleRaw.frequency === "manual"
            ? scheduleRaw.frequency
            : DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.schedule.frequency,
        max_run_time_minutes: expectNumber(
          scheduleRaw.max_run_time_minutes ??
            DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle.schedule.max_run_time_minutes,
          "config.lifecycle.schedule.max_run_time_minutes",
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
    },
  };

  return merged;
}
