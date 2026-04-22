import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../src/config/load.js";
import type { ExchangeFsSyncConfig } from "../../../src/config/types.js";

async function writeConfigFile(value: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "narada-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

async function cleanupConfigFile(path: string): Promise<void> {
  await rm(join(path, ".."), { recursive: true, force: true });
}

/** Normalize new multi-scope config to legacy flat shape for test assertions */
function legacyShape(config: ExchangeFsSyncConfig): Omit<ExchangeFsSyncConfig, "scopes" | "scope_id"> {
  const { scopes: _scopes, scope_id: _scopeId, ...rest } = config;
  return rest;
}

describe("loadConfig", () => {
  let createdPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(createdPaths.map((path) => cleanupConfigFile(path)));
    createdPaths = [];
  });

  it("loads required fields and fills defaults", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });

    expect(legacyShape(config)).toEqual({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
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
        rebuild_search_after_sync: false,
      },
      charter: {
        runtime: "mock",
      },
      policy: {
        primary_charter: "support_steward",
        allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
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
    });
  });

  it("accepts explicit optional graph credentials and explicit overrides", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        tenant_id: "tenant-1",
        client_id: "client-1",
        client_secret: "secret-1",
        user_id: "user@example.com",
        base_url: "https://graph.microsoft.com/v1.0",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox", "archive"],
        included_item_kinds: ["message"],
      },
      normalize: {
        attachment_policy: "include_content",
        body_policy: "text_and_html",
        include_headers: true,
        tombstones_enabled: false,
      },
      runtime: {
        polling_interval_ms: 5000,
        acquire_lock_timeout_ms: 10000,
        cleanup_tmp_on_startup: false,
        rebuild_views_after_sync: true,
        rebuild_search_after_sync: false,
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });

    expect(config.graph.tenant_id).toBe("tenant-1");
    expect(config.graph.client_id).toBe("client-1");
    expect(config.graph.client_secret).toBe("secret-1");
    expect(config.graph.base_url).toBe("https://graph.microsoft.com/v1.0");
    expect(config.normalize.attachment_policy).toBe("include_content");
    expect(config.normalize.body_policy).toBe("text_and_html");
    expect(config.normalize.include_headers).toBe(true);
    expect(config.normalize.tombstones_enabled).toBe(false);
    expect(config.runtime.polling_interval_ms).toBe(5000);
    expect(config.runtime.acquire_lock_timeout_ms).toBe(10000);
    expect(config.runtime.cleanup_tmp_on_startup).toBe(false);
    expect(config.runtime.rebuild_views_after_sync).toBe(true);
    expect(config.runtime.rebuild_search_after_sync).toBe(false);
  });

  it("trims string values", async () => {
    const path = await writeConfigFile({
      mailbox_id: " mailbox_primary ",
      root_dir: " ./data/mail-sync ",
      graph: {
        tenant_id: " tenant ",
        client_id: " client ",
        client_secret: " secret ",
        user_id: " user@example.com ",
        base_url: " https://graph.microsoft.com/v1.0 ",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: [" inbox ", " archive "],
        included_item_kinds: [" message "],
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });

    expect(config.mailbox_id).toBe("mailbox_primary");
    expect(config.root_dir).toBe("./data/mail-sync");
    expect(config.graph.tenant_id).toBe("tenant");
    expect(config.graph.client_id).toBe("client");
    expect(config.graph.client_secret).toBe("secret");
    expect(config.graph.user_id).toBe("user@example.com");
    expect(config.graph.base_url).toBe("https://graph.microsoft.com/v1.0");
    expect(config.scope.included_container_refs).toEqual(["inbox", "archive"]);
    expect(config.scope.included_item_kinds).toEqual(["message"]);
  });

  it("preserves configured non-inbox folder scope", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["custom-folder-id"],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });

    expect(config.scope.included_container_refs).toEqual(["custom-folder-id"]);
  });

  it("rejects missing required top-level fields", async () => {
    const path = await writeConfigFile({
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /Config must define either scopes\[\] or a legacy scope_id\/mailbox_id/,
    );
  });

  it("rejects missing graph object", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.sources must contain at least one source/,
    );
  });

  it("rejects invalid attachment policy", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      normalize: {
        attachment_policy: "bad-policy",
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.normalize\.attachment_policy must be one of/,
    );
  });

  it("rejects invalid body policy", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      normalize: {
        body_policy: "bad-policy",
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.normalize\.body_policy must be one of/,
    );
  });

  it("rejects invalid booleans", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: "yes",
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.graph\.prefer_immutable_ids must be a boolean/,
    );
  });

  it("rejects invalid number fields", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      runtime: {
        polling_interval_ms: -1,
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.runtime\.polling_interval_ms must be a non-negative finite number/,
    );
  });

  it("rejects non-string arrays in scope", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox", 42],
        included_item_kinds: ["message"],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.scope\.included_container_refs\[1\] must be a non-empty string/,
    );
  });

  it("rejects invalid allowed_actions in policy", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      policy: {
        primary_charter: "support_steward",
        allowed_actions: ["send_reply", "invalid_action"],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.policy\.allowed_actions\[1\] must be a valid allowed action/,
    );
  });

  it("parses webhook configuration when enabled", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      webhook: {
        enabled: true,
        public_url: "https://example.com/webhook",
        port: 3000,
        host: "0.0.0.0",
        path: "/notify",
        client_state: "secret-state",
        hmac_secret: "hmac-secret",
        auto_renew: true,
        hybrid_mode: true,
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });
    expect(config.webhook).toEqual({
      enabled: true,
      public_url: "https://example.com/webhook",
      port: 3000,
      host: "0.0.0.0",
      path: "/notify",
      client_state: "secret-state",
      hmac_secret: "hmac-secret",
      auto_renew: true,
      hybrid_mode: true,
    });
  });

  it("rejects enabled webhook without required fields", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      webhook: {
        enabled: true,
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\.webhook\.public_url is required when webhook is enabled/,
    );
  });

  it("allows disabled webhook with minimal fields", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      webhook: {
        enabled: false,
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });
    expect(config.webhook).toEqual({ enabled: false });
  });

  it("rejects empty allowed_actions in policy", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      policy: {
        primary_charter: "support_steward",
        allowed_actions: [],
      },
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /config\(legacy\)\.policy\.allowed_actions must contain at least one allowed action/,
    );
  });

  it("accepts campaign_request_senders and lookback_days", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      campaign_request_senders: ["marketing@company.com", "boss@company.com"],
      campaign_request_lookback_days: 14,
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });
    const scope = config.scopes[0]!;
    expect(scope.campaign_request_senders).toEqual(["marketing@company.com", "boss@company.com"]);
    expect(scope.campaign_request_lookback_days).toBe(14);
  });

  it("accepts campaign_brief in allowed_actions", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      policy: {
        primary_charter: "campaign_producer",
        allowed_actions: ["campaign_brief", "send_reply", "no_action"],
      },
    });
    createdPaths.push(path);

    const config = await loadConfig({ path });
    const scope = config.scopes[0]!;
    expect(scope.policy.allowed_actions).toContain("campaign_brief");
  });

  it("rejects invalid campaign_request_lookback_days", async () => {
    const path = await writeConfigFile({
      mailbox_id: "mailbox_primary",
      root_dir: "./data/mail-sync",
      graph: {
        user_id: "user@example.com",
        prefer_immutable_ids: true,
      },
      scope: {
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
      },
      campaign_request_lookback_days: -1,
    });
    createdPaths.push(path);

    await expect(loadConfig({ path })).rejects.toThrow(
      /campaign_request_lookback_days must be a non-negative finite number/,
    );
  });
});
