import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "@narada2/sqlite";
import { SqliteFactStore } from "@narada2/control-plane";
import { createScopeService } from "../../src/service.js";
import { createLogger } from "../../src/lib/logger.js";

describe("daemon inbox-drop source startup", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "efs-daemon-inbox-drop-"));
    await mkdir(join(rootDir, ".ai", "inbox-drop"), { recursive: true });
    await writeFile(join(rootDir, ".ai", "inbox-drop", "20260428-001-observation.md"), "hello\n");
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("ingests inbox-drop observations as filesystem facts without mailbox projection", async () => {
    const scope = {
      scope_id: "inbox-drop-test",
      root_dir: rootDir,
      sources: [{ type: "inbox_drop" as const }],
      context_strategy: "filesystem" as const,
      scope: {
        included_container_refs: [] as string[],
        included_item_kinds: ["filesystem.change"],
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
        primary_charter: "site_steward",
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
    expect(result.status).toBe("success");
    expect(result.applied_count).toBe(1);

    const factDb = new Database(join(rootDir, ".narada", "facts.db"));
    const factStore = new SqliteFactStore({ db: factDb });
    factStore.initSchema();
    const facts = factStore.getUnadmittedFacts("inbox-drop-test");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.fact_type).toBe("filesystem.change");
    expect(facts[0]!.payload_json).toContain("20260428-001-observation.md");
    factStore.close();

    await svc.dispatchContext.close();
  });
});
