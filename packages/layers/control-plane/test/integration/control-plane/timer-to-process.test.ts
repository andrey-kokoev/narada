import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteFactStore } from "../../../src/facts/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { ProcessExecutor } from "../../../src/executors/process-executor.js";
import { TimerSource } from "../../../src/sources/timer-source.js";
import { sourceRecordToFact } from "../../../src/facts/record-to-fact.js";
import {
  createHarness,
  insertConversation,
  insertWorkItem,
  insertExecutionAttempt,
  makeEvaluation,
  insertEvaluation,
  makeInvocationEnvelope,
  type Harness,
} from "./harness.js";

describe("Timer to Process Execution", () => {
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

  it("end-to-end: timer tick generates a fact", async () => {
    const source = new TimerSource({
      sourceId: "timer:test",
      scheduleId: "maintenance",
      intervalMs: 60_000,
      getNow: () => new Date("2024-01-15T12:05:30.000Z").getTime(),
    });

    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(1);
    const fact = sourceRecordToFact(batch.records[0]!, batch.nextCheckpoint ?? null);
    const ingest = factStore.ingest(fact);

    expect(ingest.isNew).toBe(true);
    expect(ingest.fact.fact_type).toBe("timer.tick");
  });

  it("end-to-end: foreman resolves process_run into a process intent", async () => {
    // Use a foreman that allows process_run
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["process_run", "no_action"],
      }),
    });

    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({ command: "/bin/echo", args: ["from-timer-policy"] }),
          rationale: "Run maintenance script",
        },
      ],
    });
    insertEvaluation(h, evaluation);

    const result = await foreman.resolveWorkItem({
      work_item_id: wi.work_item_id,
      execution_id: exId,
      evaluation_id: evaluation.evaluation_id,
    });

    expect(result.success).toBe(true);
    expect(result.resolution_outcome).toBe("action_created");

    // Verify intent was admitted
    const decision = h.coordinatorStore.getDecisionById(`fd_${wi.work_item_id}_process_run`)!;
    expect(decision).toBeDefined();

    const intent = h.intentStore.getById(`int_${decision.outbound_id}`) ?? h.intentStore.getById(decision.outbound_id!);
    // For non-mailbox intents, outbound_id contains the intent_id
    expect(intent ?? h.intentStore.getByIdempotencyKey(decision.outbound_id!)).toBeDefined();
    const resolvedIntent = intent ?? h.intentStore.getByIdempotencyKey(decision.outbound_id!)!;
    expect(resolvedIntent.intent_type).toBe("process.run");
    expect(resolvedIntent.executor_family).toBe("process");
    expect(resolvedIntent.status).toBe("admitted");
  });

  it("end-to-end: process executor runs timer-driven intent durably", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["process_run", "no_action"],
      }),
    });

    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({
            command: process.platform === "win32" ? "cmd" : "/bin/echo",
            args: process.platform === "win32" ? ["/c", "timer-executed"] : ["timer-executed"],
          }),
          rationale: "",
        },
      ],
    });
    insertEvaluation(h, evaluation);

    // Policy → Intent
    const resolveResult = await foreman.resolveWorkItem({
      work_item_id: wi.work_item_id,
      execution_id: exId,
      evaluation_id: evaluation.evaluation_id,
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
    expect(execution.stdout.trim()).toBe("timer-executed");

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
        primary_charter: "support_steward",
        allowed_actions: ["process_run", "no_action"],
      }),
    });

    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId, ["process_run"]);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId, {
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({ command: "/bin/echo", args: ["once"] }),
          rationale: "",
        },
      ],
    });
    insertEvaluation(h, evaluation);

    // First resolution
    const r1 = await foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation_id: evaluation.evaluation_id });
    expect(r1.success).toBe(true);

    // Execute once
    const e1 = await processExecutor.processNext();
    expect(e1.processed).toBe(true);

    // Replay: resolve same work item again (simulating crash recovery retry)
    h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });
    const r2 = await foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation_id: evaluation.evaluation_id });
    expect(r2.success).toBe(true);

    // Should not create a second intent
    const intents = h.db.prepare("select count(*) as c from intents").get() as { c: number };
    expect(intents.c).toBe(1);

    // Executor should not process again because intent is already completed
    const e2 = await processExecutor.processNext();
    expect(e2.processed).toBe(false);

    // Only one execution record
    const executions = h.db.prepare("select count(*) as c from process_executions").get() as { c: number };
    expect(executions.c).toBe(1);
  });
});
