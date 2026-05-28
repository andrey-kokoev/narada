import { describe, it, expect, afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { DeliverableExecutor } from "../../../src/executors/deliverable-executor.js";

describe("DeliverableExecutor", () => {
  let db: Database.Database;
  let intentStore: SqliteIntentStore;
  let executionStore: SqliteProcessExecutionStore;
  let siteRootDir: string;

  beforeEach(() => {
    db = new Database(":memory:");
    intentStore = new SqliteIntentStore({ db });
    executionStore = new SqliteProcessExecutionStore({ db });
    intentStore.initSchema();
    executionStore.initSchema();
    mkdirSync(tmpdir(), { recursive: true });
    siteRootDir = mkdtempSync(join(tmpdir(), "narada-deliverable-"));
  });

  afterEach(() => {
    if (siteRootDir) {
      rmSync(siteRootDir, { recursive: true, force: true });
    }
    executionStore.close();
    intentStore.close();
    db.close();
  });

  it("writes a markdown artifact and completes the intent", async () => {
    intentStore.admit({
      intent_id: "int-deliverable",
      intent_type: "deliverable.create",
      executor_family: "deliverable",
      payload_json: JSON.stringify({
        operation_slug: "staccato-gtm-strategy",
        deliverable_type: "gtm_framework",
        title: "GTM Framework",
        body_markdown: "## Strategy\n\nUse the attached material.",
        source_message_ids: ["msg-1"],
        source_attachment_names: ["brief.pdf"],
      }),
      idempotency_key: "ctx-create-deliverable",
      status: "admitted",
      context_id: "ctx-1",
      target_id: null,
      terminal_reason: null,
    });

    const executor = new DeliverableExecutor({ intentStore, executionStore, siteRootDir });
    const result = await executor.processNext();

    expect(result.processed).toBe(true);
    const intent = intentStore.getById("int-deliverable");
    expect(intent!.status).toBe("completed");
    expect(intent!.target_id).toBe(result.executionId);

    const execution = executionStore.getById(result.executionId!);
    expect(execution!.executor_family).toBe("deliverable");
    expect(execution!.status).toBe("completed");
    expect(execution!.artifact_id).toBeTruthy();
    expect(existsSync(execution!.artifact_id!)).toBe(true);

    const body = readFileSync(execution!.artifact_id!, "utf8");
    expect(body).toContain("# GTM Framework");
    expect(body).toContain("source_message_ids");
    expect(body).toContain("brief.pdf");
  });

  it("returns false when there is no deliverable intent", async () => {
    const executor = new DeliverableExecutor({ intentStore, executionStore, siteRootDir });
    const result = await executor.processNext();

    expect(result.processed).toBe(false);
  });
});
