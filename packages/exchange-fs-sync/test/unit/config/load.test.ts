import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../src/config/load.js";

async function writeConfigFile(value: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "exchange-fs-sync-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

async function cleanupConfigFile(path: string): Promise<void> {
  await rm(join(path, ".."), { recursive: true, force: true });
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

    expect(config).toEqual({
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
      },
      charter: {
        runtime: "mock",
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
      /config\.mailbox_id must be a non-empty string/,
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
      /config\.graph must be an object/,
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
      /config\.normalize\.attachment_policy must be one of/,
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
      /config\.normalize\.body_policy must be one of/,
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
      /config\.graph\.prefer_immutable_ids must be a boolean/,
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
      /config\.runtime\.polling_interval_ms must be a non-negative finite number/,
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
      /config\.scope\.included_container_refs\[1\] must be a non-empty string/,
    );
  });
});
