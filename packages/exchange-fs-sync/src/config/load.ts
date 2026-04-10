import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExchangeFsSyncConfig } from "./types.js";
import { DEFAULT_EXCHANGE_FS_SYNC_CONFIG } from "./defaults.js";

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

export interface LoadConfigOptions {
  path: string;
}

export async function loadConfig(
  opts: LoadConfigOptions,
): Promise<ExchangeFsSyncConfig> {
  const raw = await readFile(resolve(opts.path), "utf8");
  const parsed = JSON.parse(raw) as unknown;

  const root = expectObject(parsed, "config");
  const graph = expectObject(root.graph, "config.graph");
  const scope = expectObject(root.scope, "config.scope");

  const normalizeRaw = isObject(root.normalize) ? root.normalize : {};
  const runtimeRaw = isObject(root.runtime) ? root.runtime : {};

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
  };

  if (merged.scope.included_container_refs.length !== 1) {
    throw new Error(
      "Current implementation requires exactly one included_container_ref",
    );
  }

  return merged;
}