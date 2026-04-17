import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  WebhookSource,
  InMemoryWebhookEventQueue,
  FileCursorStore,
  FileApplyLogStore,
  SqliteFactStore,
  DefaultSyncRunner,
  SqliteCoordinatorStore,
  SqliteScheduler,
  DefaultForemanFacade,
  WebhookContextStrategy,
  SqliteIntentStore,
  SqliteOutboundStore,
  SqliteProcessExecutionStore,
  ProcessExecutor,
  type ApplyEventResult,
  type SourceRecord,
  type EvaluationEnvelope,
  type CharterInvocationEnvelope,
} from "../../src/index.js";

function createNoOpProjector(): {
  applyRecord: (record: SourceRecord) => Promise<ApplyEventResult>;
} {
  return {
    applyRecord: async (record) => ({
      event_id: `evt_${record.recordId}`,
      message_id: record.recordId,
      applied: true,
      dirty_views: {
        by_thread: [],
        by_folder: [],
        unread_changed: false,
        flagged_changed: false,
      },
    }),
  };
}

describe("Webhook Vertical Integration", () => {
  let rootDir: string;
  let db: Database.Database;
  let factDb: Database.Database;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "efs-webhook-"));
    db = new Database(":memory:");
    factDb = new Database(":memory:");
  });

  afterEach(async () => {
    db.close();
    factDb.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("should flow webhook events through source -> fact -> foreman -> work -> intent -> execution", async () => {
    const scopeId = "test-scope";
    const queue = new InMemoryWebhookEventQueue();
    const source = new WebhookSource({ sourceId: scopeId, queue });

    const cursorStore = new FileCursorStore({ rootDir, scopeId: scopeId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const factStore = new SqliteFactStore({ db: factDb });
    factStore.initSchema();

    const runner = new DefaultSyncRunner({
      rootDir,
      source,
      cursorStore,
      applyLogStore,
      factStore,
      projector: createNoOpProjector(),
    });

    // Enqueue a webhook event
    queue.enqueue("alerts", { severity: "high", alert: "cpu spike" });

    // Run sync to ingest facts
    const syncResult = await runner.syncOnce();
    expect(syncResult.status).toBe("success");
    expect(syncResult.applied_count).toBe(1);

    // Verify fact was ingested
    const facts = factStore.getUnadmittedFacts(scopeId);
    expect(facts.length).toBe(1);
    expect(facts[0]!.fact_type).toBe("webhook.received");

    // Set up control plane stores
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();
    const outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();
    const intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();
    const processExecutionStore = new SqliteProcessExecutionStore({ db });
    processExecutionStore.initSchema();

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scopeId,
      getRuntimePolicy: () => ({
        primary_charter: "webhook_handler",
        allowed_actions: ["process_run", "no_action"],
      }),
      contextFormationStrategy: new WebhookContextStrategy(),
    });

    // Admit facts through foreman
    const openResult = await foreman.onFactsAdmitted(facts, scopeId);
    expect(openResult.opened.length).toBe(1);
    expect(openResult.opened[0]!.context_id).toBe("webhook:alerts");

    // Mark facts admitted
    factStore.markAdmitted(facts.map((f) => f.fact_id));

    // Lease and execute work item
    const scheduler = new SqliteScheduler(coordinatorStore, { runnerId: scopeId });
    const runnable = scheduler.scanForRunnableWork(scopeId, 1);
    expect(runnable.length).toBe(1);

    const workItem = runnable[0]!;
    const leaseResult = scheduler.acquireLease(workItem.work_item_id, scopeId);
    expect(leaseResult.success).toBe(true);

    const invocation: CharterInvocationEnvelope = {
      invocation_version: "2.0",
      execution_id: `ex_${workItem.work_item_id}_${Date.now()}`,
      work_item_id: workItem.work_item_id,
      context_id: workItem.context_id,
      scope_id: scopeId,
      charter_id: "webhook_handler",
      role: "primary",
      invoked_at: new Date().toISOString(),
      revision_id: workItem.opened_for_revision_id,
      context_materialization: { messages: [] },
      vertical_hints: { vertical: "webhook" },
      allowed_actions: ["process_run", "no_action"],
      available_tools: [],
      coordinator_flags: [],
      prior_evaluations: [],
      max_prior_evaluations: 0,
    };

    const attempt = scheduler.startExecution(
      workItem.work_item_id,
      workItem.opened_for_revision_id,
      JSON.stringify(invocation),
    );

    // Build evaluation with process_run action
    const evaluation: EvaluationEnvelope = {
      evaluation_id: `eval_${workItem.work_item_id}`,
      execution_id: attempt.execution_id,
      work_item_id: workItem.work_item_id,
      context_id: workItem.context_id,
      charter_id: "webhook_handler",
      role: "primary",
      output_version: "2.0",
      analyzed_at: new Date().toISOString(),
      outcome: "complete",
      confidence: { overall: "high", uncertainty_flags: [] },
      summary: "Webhook triggered process execution",
      classifications: [],
      facts: [],
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({
            command: process.platform === "win32" ? "cmd" : "/bin/echo",
            args: ["webhook-processed"],
          }),
          rationale: "Execute webhook handler",
        },
      ],
      tool_requests: [],
      escalations: [],
    };

    scheduler.completeExecution(attempt.execution_id, JSON.stringify(evaluation));

    // Resolve work item
    const resolveResult = await foreman.resolveWorkItem({
      work_item_id: workItem.work_item_id,
      execution_id: attempt.execution_id,
      evaluation,
    });

    expect(resolveResult.success).toBe(true);
    expect(resolveResult.resolution_outcome).toBe("action_created");

    // Verify intent was created
    const intents = intentStore.db
      .prepare("select * from intents where context_id = ?")
      .all(workItem.context_id) as { intent_id: string; intent_type: string; status: string }[];
    expect(intents.length).toBe(1);
    expect(intents[0]!.intent_type).toBe("process.run");
    expect(intents[0]!.status).toBe("admitted");

    // Execute the process intent
    const processExecutor = new ProcessExecutor({ intentStore, executionStore: processExecutionStore });
    await processExecutor.processNext();

    // Verify execution completed
    const execution = processExecutionStore.getByIntentId(intents[0]!.intent_id);
    expect(execution).toBeDefined();
    expect(execution!.status).toBe("completed");
    expect(execution!.executor_family).toBe("process");

    // Verify intent status updated
    const updatedIntent = intentStore.getById(intents[0]!.intent_id);
    expect(updatedIntent!.status).toBe("completed");
  });

  it("should not duplicate effects on replay", async () => {
    const scopeId = "test-replay";
    const queue = new InMemoryWebhookEventQueue();
    const source = new WebhookSource({ sourceId: scopeId, queue });

    const cursorStore = new FileCursorStore({ rootDir, scopeId: scopeId });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const factStore = new SqliteFactStore({ db: factDb });
    factStore.initSchema();

    const runner = new DefaultSyncRunner({
      rootDir,
      source,
      cursorStore,
      applyLogStore,
      factStore,
      projector: createNoOpProjector(),
    });

    // Enqueue and sync once
    queue.enqueue("alerts", { severity: "high" });
    const r1 = await runner.syncOnce();
    expect(r1.applied_count).toBe(1);
    expect(r1.event_count).toBe(1);

    // Sync again - checkpoint prevents re-fetching same events
    const r2 = await runner.syncOnce();
    expect(r2.applied_count).toBe(0);
    expect(r2.event_count).toBe(0);

    // Verify checkpoint advanced
    const cursor = await cursorStore.read();
    expect(cursor).toBe("1");

    // Reset cursor to force re-fetch, but apply-log should skip
    await cursorStore.reset();
    const r3 = await runner.syncOnce();
    expect(r3.applied_count).toBe(0);
    expect(r3.skipped_count).toBe(1);
    expect(r3.event_count).toBe(1);

    // Facts should still be exactly one (idempotent ingest)
    const facts = factStore.getUnadmittedFacts(scopeId);
    expect(facts.length).toBe(1);
  });
});
