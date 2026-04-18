import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSyncService,
  type SyncService,
} from "../../src/service.js";
import type { NormalizedBatch, GraphAdapter } from "@narada2/control-plane";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-wake-"));
}

function writeConfig(rootDir: string, mailboxId: string): string {
  const configPath = join(rootDir, "config.json");
  const config = {
    mailbox_id: mailboxId,
    root_dir: rootDir,
    graph: {
      tenant_id: "test-tenant",
      client_id: "test-client-id",
      client_secret: "test-secret",
      user_id: mailboxId,
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
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

describe("daemon wake controller integration", { timeout: 30000 }, () => {
  let rootDir: string;
  let configPath: string;
  let service: SyncService | null = null;

  beforeEach(() => {
    rootDir = createTempDir();
    configPath = writeConfig(rootDir, "test-mailbox");
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
  });

  it("consumes pending wake between loop iterations", async () => {
    let fetchCount = 0;
    const mockAdapter: GraphAdapter = {
      async fetch_since(): Promise<NormalizedBatch> {
        fetchCount++;
        // Slow enough that we can inject a wake while the sync is running
        await new Promise((r) => setTimeout(r, 400));
        return {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          adapter_scope: {
            mailbox_id: "test-mailbox",
            included_container_refs: ["inbox"],
            included_item_kinds: ["message"],
          },
          fetched_at: new Date().toISOString(),
          events: [],
          next_cursor: "cursor-empty",
          has_more: false,
        };
      },
    };

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: mockAdapter,
      pollingIntervalMs: 10000, // Long enough that only wakes drive extra cycles
    });

    const startPromise = service.start();

    // Wait for initial sync to complete (~400ms + dispatch overhead)
    await new Promise((r) => setTimeout(r, 1000));

    // The daemon is now sleeping. Interrupt sleep with a manual wake.
    service.requestWake("manual");

    // Wait for cycle 2 to start, then inject another manual wake while it's running.
    await new Promise((r) => setTimeout(r, 100));
    service.requestWake("manual");

    // Wait for cycle 2 to finish and cycle 3 to start (pending wake consumed)
    await new Promise((r) => setTimeout(r, 1000));

    await service.stop();
    await startPromise.catch(() => undefined);

    const stats = service.getStats();
    // Initial + cycle 2 + cycle 3 = at least 3 cycles
    expect(stats.cyclesCompleted).toBeGreaterThanOrEqual(3);
    expect(fetchCount).toBeGreaterThanOrEqual(3);
  });

  it("coalesces pending wakes by priority between loop iterations", async () => {
    let fetchCount = 0;
    const mockAdapter: GraphAdapter = {
      async fetch_since(): Promise<NormalizedBatch> {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 400));
        return {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          adapter_scope: {
            mailbox_id: "test-mailbox",
            included_container_refs: ["inbox"],
            included_item_kinds: ["message"],
          },
          fetched_at: new Date().toISOString(),
          events: [],
          next_cursor: "cursor-empty",
          has_more: false,
        };
      },
    };

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: mockAdapter,
      pollingIntervalMs: 10000,
    });

    const startPromise = service.start();

    // Wait for initial sync to complete
    await new Promise((r) => setTimeout(r, 1000));

    // Interrupt sleep to start cycle 2
    service.requestWake("manual");

    // Wait for cycle 2 to start, then inject a low-priority wake followed by high-priority
    await new Promise((r) => setTimeout(r, 100));
    service.requestWake("retry");
    service.requestWake("manual");

    // Wait for cycle 2 to finish. The pending wake should be "manual" (highest priority).
    await new Promise((r) => setTimeout(r, 1000));

    await service.stop();
    await startPromise.catch(() => undefined);

    const stats = service.getStats();
    // At least 3 cycles: initial + cycle 2 + cycle 3 (driven by pending manual wake)
    expect(stats.cyclesCompleted).toBeGreaterThanOrEqual(3);
    expect(fetchCount).toBeGreaterThanOrEqual(3);
  });

  it("skips poll sleep when a pending wake is consumed after success", async () => {
    let fetchCount = 0;
    const mockAdapter: GraphAdapter = {
      async fetch_since(): Promise<NormalizedBatch> {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 300));
        return {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          adapter_scope: {
            mailbox_id: "test-mailbox",
            included_container_refs: ["inbox"],
            included_item_kinds: ["message"],
          },
          fetched_at: new Date().toISOString(),
          events: [],
          next_cursor: "cursor-empty",
          has_more: false,
        };
      },
    };

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: mockAdapter,
      pollingIntervalMs: 10000,
    });

    const startPromise = service.start();

    // Wait for initial sync
    await new Promise((r) => setTimeout(r, 800));

    // Start cycle 2 by waking from poll sleep
    service.requestWake("manual");

    // While cycle 2 is running, queue a retry wake
    await new Promise((r) => setTimeout(r, 100));
    service.requestWake("retry");

    // Cycle 2 completes, pending retry wake causes immediate cycle 3
    await new Promise((r) => setTimeout(r, 800));

    await service.stop();
    await startPromise.catch(() => undefined);

    const stats = service.getStats();
    expect(stats.cyclesCompleted).toBeGreaterThanOrEqual(3);
    expect(fetchCount).toBeGreaterThanOrEqual(3);
  });
});
