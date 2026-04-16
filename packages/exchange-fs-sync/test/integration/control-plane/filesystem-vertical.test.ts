import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteFactStore } from "../../../src/facts/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { ProcessExecutor } from "../../../src/executors/process-executor.js";
import {
  FilesystemSource,
  InMemoryFilesystemEventQueue,
} from "../../../src/sources/filesystem-source.js";
import { sourceRecordToFact } from "../../../src/facts/record-to-fact.js";
import { FilesystemContextStrategy } from "../../../src/foreman/context.js";
import { FilesystemContextStrategy } from "../../../src/foreman/context.js";
import {
  createHarness,
  insertConversation,
  insertWorkItem,
  insertExecutionAttempt,
  makeEvaluation,
  makeInvocationEnvelope,
  type Harness,
} from "./harness.js";

describe("Filesystem Vertical", () => {
  let h: Harness;
  let factStore: SqliteFactStore;
  let executionStore: SqliteProcessExecutionStore;
  let processExecutor: ProcessExecutor;

  beforeEach(() => {
    h = createHarness();
    factStore = new SqliteFactStore({ db: h.db });
    executionStore = new SqliteProcessExecutionStore({ db: h.db });
    factStore.initSchema();
    executionStore.initSchema();
    processExecutor = new ProcessExecutor({ intentStore: h.intentStore, executionStore });
  });

  afterEach(() => {
    executionStore.close();
    factStore.close();
    h.outboundStore.close();
    h.intentStore.close();
    h.coordinatorStore.close();
    h.db.close();
  });

  it("end-to-end: file change generates a fact", async () => {
    const queue = new InMemoryFilesystemEventQueue();
    const source = new FilesystemSource({ sourceId: "fs:test", queue });

    queue.enqueue("uploads", "/data/uploads/report.csv", "created", 4096);

    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(1);
    const fact = sourceRecordToFact(batch.records[0]!, batch.nextCheckpoint ?? null);
    const ingest = factStore.ingest(fact);

    expect(ingest.isNew).toBe(true);
    expect(ingest.fact.fact_type).toBe("filesystem.change");
  });

  it("end-to-end: foreman opens work item from filesystem fact", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "file_processor",
        allowed_actions: ["process_run", "no_action"],
      }),
      contextFormationStrategy: new FilesystemContextStrategy(),
    });

    const queue = new InMemoryFilesystemEventQueue();
    const source = new FilesystemSource({ sourceId: "fs:test", queue });
    queue.enqueue("uploads", "/data/uploads/report.csv", "created", 4096);

    const batch = await source.pull(null);
    const fact = sourceRecordToFact(batch.records[0]!, batch.nextCheckpoint ?? null);
    factStore.ingest(fact);

    const fsStrategy = new FilesystemContextStrategy();
    const unadmitted = factStore.getUnadmittedFacts();
    const contexts = fsStrategy.formContexts(unadmitted, "scope-1", {
      getLatestRevisionOrdinal: () => null,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("fs:uploads");

    const result = await foreman.onFactsAdmitted(unadmitted, "scope-1");
    expect(result.opened).toHaveLength(1);
    expect(result.opened[0]!.context_id).toBe("fs:uploads");

    const workItem = h.coordinatorStore.getActiveWorkItemForContext("fs:uploads");
    expect(workItem).toBeDefined();
    expect(workItem!.scope_id).toBe("scope-1");
  });

  it("end-to-end: filesystem vertical resolves process_run into a process intent", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "file_processor",
        allowed_actions: ["process_run", "no_action"],
      }),
      contextFormationStrategy: new FilesystemContextStrategy(),
    });

    insertConversation(h, "fs:uploads");
    const wi = insertWorkItem(h, { context_id: "fs:uploads", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      context_id: "fs:uploads",
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({
            command: process.platform === "win32" ? "cmd" : "/bin/echo",
            args: process.platform === "win32" ? ["/c", "file-processed"] : ["file-processed"],
          }),
          rationale: "Process uploaded file",
        },
      ],
    });

    const result = await foreman.resolveWorkItem({
      work_item_id: wi.work_item_id,
      execution_id: exId,
      evaluation,
    });

    expect(result.success).toBe(true);
    expect(result.resolution_outcome).toBe("action_created");

    const decision = h.coordinatorStore.getDecisionById(`fd_${wi.work_item_id}_process_run`)!;
    expect(decision).toBeDefined();

    const intent =
      h.intentStore.getById(`int_${decision.outbound_id}`) ??
      h.intentStore.getById(decision.outbound_id!) ??
      h.intentStore.getByIdempotencyKey(decision.outbound_id!);
    expect(intent).toBeDefined();
    const resolvedIntent = intent!;
    expect(resolvedIntent.intent_type).toBe("process.run");
    expect(resolvedIntent.executor_family).toBe("process");
    expect(resolvedIntent.status).toBe("admitted");
  });

  it("end-to-end: process executor runs filesystem-driven intent durably", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "file_processor",
        allowed_actions: ["process_run", "no_action"],
      }),
      contextFormationStrategy: new FilesystemContextStrategy(),
    });

    insertConversation(h, "fs:uploads");
    const wi = insertWorkItem(h, { context_id: "fs:uploads", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      context_id: "fs:uploads",
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({
            command: process.platform === "win32" ? "cmd" : "/bin/echo",
            args: process.platform === "win32" ? ["/c", "fs-executed"] : ["fs-executed"],
          }),
          rationale: "",
        },
      ],
    });

    // Policy → Intent
    const resolveResult = await foreman.resolveWorkItem({
      work_item_id: wi.work_item_id,
      execution_id: exId,
      evaluation,
    });
    expect(resolveResult.success).toBe(true);

    // Intent → Execution
    const execResult = await processExecutor.processNext();
    expect(execResult.processed).toBe(true);
    expect(execResult.executionId).toBeDefined();

    // Durable result
    const execution = executionStore.getById(execResult.executionId!)!;
    expect(execution.status).toBe("completed");
    expect(execution.exit_code).toBe(0);
    expect(execution.stdout.trim()).toBe("fs-executed");

    // Intent updated
    const decision = h.coordinatorStore.getDecisionById(`fd_${wi.work_item_id}_process_run`)!;
    const intent = h.intentStore.getById(decision.outbound_id!)!;
    expect(intent.status).toBe("completed");
    expect(intent.target_id).toBe(execResult.executionId);
  });

  it("replay safety: duplicate intent does not re-execute", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "file_processor",
        allowed_actions: ["process_run", "no_action"],
      }),
      contextFormationStrategy: new FilesystemContextStrategy(),
    });

    insertConversation(h, "fs:uploads");
    const wi = insertWorkItem(h, { context_id: "fs:uploads", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      context_id: "fs:uploads",
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({ command: "/bin/echo", args: ["once"] }),
          rationale: "",
        },
      ],
    });

    // First resolution
    const r1 = await foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r1.success).toBe(true);

    // Execute once
    const e1 = await processExecutor.processNext();
    expect(e1.processed).toBe(true);

    // Replay: resolve same work item again
    h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });
    const r2 = await foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r2.success).toBe(true);

    // Should not create a second intent
    const intents = h.db.prepare("select count(*) as c from intents").get() as { c: number };
    expect(intents.c).toBe(1);

    // Executor should not process again
    const e2 = await processExecutor.processNext();
    expect(e2.processed).toBe(false);

    // Only one execution record
    const executions = h.db.prepare("select count(*) as c from process_executions").get() as { c: number };
    expect(executions.c).toBe(1);
  });
});
