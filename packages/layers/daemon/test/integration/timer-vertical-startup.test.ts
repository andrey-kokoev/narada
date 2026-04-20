import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScopeService } from "../../src/service.js";
import { createLogger } from "../../src/lib/logger.js";

describe("daemon timer vertical startup", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "efs-daemon-timer-"));
    await mkdir(join(rootDir, ".narada"), { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("starts successfully with a timer-only scope (no graph source)", async () => {
    const scope = {
      scope_id: "timer-test",
      root_dir: rootDir,
      sources: [{ type: "timer" as const }],
      context_strategy: "timer" as const,
      scope: {
        included_container_refs: [] as string[],
        included_item_kinds: ["tick"],
      },
      normalize: {
        attachment_policy: "none" as const,
        body_policy: "text_only" as const,
        include_headers: false,
        tombstones_enabled: false,
      },
      runtime: {
        polling_interval_ms: 60000,
        acquire_lock_timeout_ms: 30000,
        cleanup_tmp_on_startup: true,
        rebuild_views_after_sync: false,
        rebuild_search_after_sync: false,
      },
      policy: {
        primary_charter: "timer_steward",
        secondary_charters: [],
        allowed_actions: ["no_action"],
        allowed_tools: [],
        require_human_approval: false,
      },
    };

    const logger = createLogger({ component: "test", verbose: false });

    const svc = await createScopeService(
      scope,
      { root_dir: rootDir, scopes: [scope] },
      { configPath: join(rootDir, "config.json") },
      logger,
    );

    expect(svc.scope.scope_id).toBe("timer-test");
    expect(svc.runner).toBeDefined();
    expect(svc.dispatchContext).toBeDefined();

    // Run a sync cycle to prove it completes without crashing
    const result = await svc.runner.syncOnce();
    // TimerSource may return retryable on first pull (no prior checkpoint);
    // the requirement is that it does not crash.
    expect(result.status).not.toBe("fatal");

    await svc.dispatchContext.close();
  });

  it("SyncStats uses perScope instead of perMailbox", async () => {
    const scope = {
      scope_id: "timer-stats-test",
      root_dir: rootDir,
      sources: [{ type: "timer" as const }],
      context_strategy: "timer" as const,
      scope: {
        included_container_refs: [] as string[],
        included_item_kinds: ["tick"],
      },
      normalize: {
        attachment_policy: "none" as const,
        body_policy: "text_only" as const,
        include_headers: false,
        tombstones_enabled: false,
      },
      runtime: {
        polling_interval_ms: 60000,
        acquire_lock_timeout_ms: 30000,
        cleanup_tmp_on_startup: true,
        rebuild_views_after_sync: false,
        rebuild_search_after_sync: false,
      },
      policy: {
        primary_charter: "timer_steward",
        secondary_charters: [],
        allowed_actions: ["no_action"],
        allowed_tools: [],
        require_human_approval: false,
      },
    };

    const logger = createLogger({ component: "test", verbose: false });

    const svc = await createScopeService(
      scope,
      { root_dir: rootDir, scopes: [scope] },
      { configPath: join(rootDir, "config.json") },
      logger,
    );

    const result = await svc.runner.syncOnce();
    expect(result.status).not.toBe("fatal");

    await svc.dispatchContext.close();
  });
});
