import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScopeService } from "../../src/service.js";
import { OUTBOUND_WORKER_IDS } from "../../src/lib/workers.js";
import { createLogger } from "../../src/lib/logger.js";
import type { ScopeConfig, ExchangeFsSyncConfig } from "@narada2/control-plane";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-wiring-"));
}

function buildMinimalScopeConfig(rootDir: string): ScopeConfig {
  return {
    scope_id: "test-mailbox",
    root_dir: rootDir,
    sources: [
      {
        type: "graph",
        tenant_id: "test-tenant",
        client_id: "test-client-id",
        client_secret: "test-secret",
        user_id: "test-mailbox",
        base_url: "https://graph.microsoft.com/v1.0",
        prefer_immutable_ids: true,
      },
    ],
    context_strategy: "mail",
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
    policy: {
      primary_charter: "support_steward",
      allowed_actions: [],
      allowed_tools: [],
    },
  };
}

describe("daemon worker registry wiring", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = createTempDir();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("registers all expected workers including outbound mail workers", async () => {
    const scopeConfig = buildMinimalScopeConfig(rootDir);
    const globalConfig: ExchangeFsSyncConfig = {
      root_dir: rootDir,
      scopes: [scopeConfig],
    };
    const logger = createLogger({ component: "test", verbose: false });

    const { dispatchContext } = await createScopeService(
      scopeConfig,
      globalConfig,
      {},
      logger,
    );

    const apiScope = await dispatchContext.getObservationApiScope();
    const workers = apiScope.workerRegistry.listWorkers();
    const workerIds = workers.map((w) => w.worker_id);

    // Process executor must be present
    expect(workerIds).toContain("process_executor");

    // All outbound workers must be present
    for (const id of OUTBOUND_WORKER_IDS) {
      expect(workerIds).toContain(id);
    }

    // Exact count: process_executor + 3 outbound workers
    expect(workerIds).toHaveLength(1 + OUTBOUND_WORKER_IDS.length);

    // Outbound workers must have the correct executor family
    for (const id of OUTBOUND_WORKER_IDS) {
      const worker = apiScope.workerRegistry.getWorker(id);
      expect(worker).toBeDefined();
      expect(worker!.identity.executor_family).toBe("outbound");
    }

    // process_executor must have the correct executor family
    const processWorker = apiScope.workerRegistry.getWorker("process_executor");
    expect(processWorker).toBeDefined();
    expect(processWorker!.identity.executor_family).toBe("process");

    await dispatchContext.close();
  });

  it("uses the same OUTBOUND_WORKER_IDS constant for dispatch drain loop", () => {
    // This is a compile-time + mechanical assertion: the constant values
    // must match what the service.ts drain loop iterates over. If the
    // constant drifts from the registration sites, the registration test
    // above would still pass but dispatch would miss a worker. The fix is
    // that both sites now import from the same source of truth.
    expect(OUTBOUND_WORKER_IDS).toEqual([
      "send_reply",
      "send_execution",
      "non_send_actions",
      "outbound_reconciler",
    ]);
  });
});
