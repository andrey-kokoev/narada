import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncService, type SyncService } from "../../src/service.js";
import type { GraphAdapter } from "@narada/exchange-fs-sync";

const noopAdapter: GraphAdapter = {
  async fetch_since() {
    return {
      schema_version: 1,
      mailbox_id: "test-mailbox",
      adapter_scope: { mailbox_id: "test-mailbox", included_container_refs: ["inbox"], included_item_kinds: ["message"] },
      fetched_at: new Date().toISOString(),
      events: [],
      next_cursor: "cursor-1",
      has_more: false,
    };
  },
};

function writeConfig(rootDir: string, charterRuntime: string, apiKey?: string): string {
  const configPath = join(rootDir, "config.json");
  const config: Record<string, unknown> = {
    mailbox_id: "test-mailbox",
    root_dir: rootDir,
    graph: {
      tenant_id: "test-tenant",
      client_id: "test-client-id",
      client_secret: "test-secret",
      user_id: "test-mailbox",
      base_url: "https://graph.microsoft.com/v1.0",
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
      tombstones_enabled: false,
    },
    runtime: {
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 5000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
    charter: {
      runtime: charterRuntime,
    },
  };
  if (apiKey !== undefined) {
    (config.charter as Record<string, unknown>).api_key = apiKey;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

describe("daemon runtime config validation", { timeout: 10000 }, () => {
  let rootDir: string;
  let service: SyncService | null = null;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "efs-daemon-runtime-"));
  });

  afterEach(async () => {
    if (service) {
      await service.stop().catch(() => undefined);
      service = null;
    }
  });

  it("fails fast when codex-api is configured without an api key", async () => {
    const configPath = writeConfig(rootDir, "codex-api");
    await expect(createSyncService({ configPath, verbose: false, adapter: noopAdapter })).rejects.toThrow(
      /Charter runtime is configured as codex-api but no API key is provided/,
    );
  });

  it("fails fast for unknown runtime values", async () => {
    const configPath = writeConfig(rootDir, "some-future-runtime");
    await expect(createSyncService({ configPath, verbose: false, adapter: noopAdapter })).rejects.toThrow(
      /Invalid charter runtime: some-future-runtime/,
    );
  });

  it("starts successfully with mock runtime", async () => {
    const configPath = writeConfig(rootDir, "mock");
    service = await createSyncService({ configPath, verbose: false, adapter: noopAdapter });
    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await service.stop();
    await startPromise.catch(() => undefined);
    expect(service.getStats().cyclesCompleted).toBeGreaterThanOrEqual(1);
  });

  it("starts successfully with codex-api runtime and api key", async () => {
    const configPath = writeConfig(rootDir, "codex-api", "test-key");
    service = await createSyncService({ configPath, verbose: false, adapter: noopAdapter });
    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await service.stop();
    await startPromise.catch(() => undefined);
    expect(service.getStats().cyclesCompleted).toBeGreaterThanOrEqual(1);
  });
});
