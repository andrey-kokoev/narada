import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteAgentTraceStore } from "../../../src/agent/traces/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteScheduler } from "../../../src/scheduler/scheduler.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import { MailboxContextStrategy } from "../../../src/foreman/mailbox/context-strategy.js";
import type { SyncCompletionSignal, EvaluationEnvelope, CharterInvocationEnvelope } from "../../../src/foreman/types.js";
import type { WorkItem, ExecutionAttempt } from "../../../src/coordinator/types.js";
import type { RuntimePolicy } from "../../../src/config/types.js";

export function makeRuntimePolicy(overrides?: Partial<RuntimePolicy>): RuntimePolicy {
  return {
    primary_charter: "support_steward",
    allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
    ...overrides,
  };
}

export interface Harness {
  db: Database.Database;
  coordinatorStore: SqliteCoordinatorStore;
  outboundStore: SqliteOutboundStore;
  intentStore: SqliteIntentStore;
  traceStore: SqliteAgentTraceStore;
  scheduler: SqliteScheduler;
  foreman: DefaultForemanFacade;
}

export function createHarness(runnerId = "runner-test"): Harness {
  const db = new Database(":memory:");
  const coordinatorStore = new SqliteCoordinatorStore({ db });
  const outboundStore = new SqliteOutboundStore({ db });
  const intentStore = new SqliteIntentStore({ db });
  const traceStore = new SqliteAgentTraceStore({ db });
  coordinatorStore.initSchema();
  outboundStore.initSchema();
  intentStore.initSchema();
  traceStore.initSchema();
  const scheduler = new SqliteScheduler(coordinatorStore, { leaseDurationMs: 60_000, runnerId });
  const foreman = new DefaultForemanFacade({
    coordinatorStore,
    outboundStore,
    intentStore,
    db,
    foremanId: "fm-test",
    getRuntimePolicy: () => makeRuntimePolicy(),
    contextFormationStrategy: new MailboxContextStrategy(),
  });
  return { db, coordinatorStore, outboundStore, intentStore, traceStore, scheduler, foreman };
}

export function insertConversation(h: Harness, conversationId: string, mailboxId = "mb-1"): void {
  const now = new Date().toISOString();
  h.coordinatorStore.upsertContextRecord({
    context_id: conversationId,
    scope_id: mailboxId,
    primary_charter: "support_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: now,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: now,
    updated_at: now,
  });
}

export function insertWorkItem(h: Harness, overrides?: Partial<WorkItem>): WorkItem {
  const now = new Date().toISOString();
  const item: WorkItem = {
    work_item_id: `wi_${Math.random().toString(36).slice(2)}`,
    context_id: "conv-1",
    scope_id: "mb-1",
    status: "opened",
    priority: 0,
    opened_for_revision_id: "conv-1:rev:1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  h.coordinatorStore.insertWorkItem(item);
  return item;
}

export function insertExecutionAttempt(
  h: Harness,
  workItemId: string,
  executionId: string,
  envelope: CharterInvocationEnvelope,
  status: ExecutionAttempt["status"] = "active",
): void {
  h.coordinatorStore.insertExecutionAttempt({
    execution_id: executionId,
    work_item_id: workItemId,
    revision_id: envelope.revision_id,
    session_id: null,
    status,
    started_at: new Date().toISOString(),
    completed_at: status !== "active" && status !== "started" ? new Date().toISOString() : null,
    runtime_envelope_json: JSON.stringify(envelope),
    outcome_json: null,
    error_message: null,
  });
}

export function makeInvocationEnvelope(
  workItemId: string,
  executionId: string,
  allowedActions: string[] = ["send_reply"],
): CharterInvocationEnvelope {
  return {
    invocation_version: "2.0",
    execution_id: executionId,
    work_item_id: workItemId,
    context_id: "conv-1",
    scope_id: "mb-1",
    charter_id: "support_steward",
    role: "primary",
    invoked_at: new Date().toISOString(),
    revision_id: "conv-1:rev:1",
    context_materialization: { messages: [] },
    vertical_hints: { vertical: "mail" },
    allowed_actions: allowedActions as any,
    available_tools: [],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 5,
  };
}

export function makeEvaluation(
  workItemId: string,
  executionId: string,
  overrides?: Partial<EvaluationEnvelope>,
): EvaluationEnvelope {
  return {
    evaluation_id: `eval_${executionId}`,
    execution_id: executionId,
    work_item_id: workItemId,
    context_id: "conv-1",
    charter_id: "support_steward",
    role: "primary",
    output_version: "2.0",
    analyzed_at: new Date().toISOString(),
    outcome: "complete",
    confidence: { overall: "high", uncertainty_flags: [] },
    summary: "test evaluation",
    classifications: [],
    facts: [],
    proposed_actions: [
      { action_type: "send_reply", authority: "recommended", payload_json: JSON.stringify({ to: ["a@example.com"], body_text: "Hi" }), rationale: "" },
    ],
    tool_requests: [],
    escalations: [],
    ...overrides,
  };
}

export function insertEvaluation(h: Harness, evaluation: EvaluationEnvelope, scopeId = "mb-1"): void {
  h.coordinatorStore.insertEvaluation({
    evaluation_id: evaluation.evaluation_id,
    execution_id: evaluation.execution_id,
    work_item_id: evaluation.work_item_id,
    context_id: evaluation.context_id,
    scope_id: scopeId,
    charter_id: evaluation.charter_id,
    role: evaluation.role,
    output_version: evaluation.output_version,
    analyzed_at: evaluation.analyzed_at,
    outcome: evaluation.outcome,
    confidence_json: JSON.stringify(evaluation.confidence),
    summary: evaluation.summary,
    classifications_json: JSON.stringify(evaluation.classifications),
    facts_json: JSON.stringify(evaluation.facts),
    escalations_json: JSON.stringify(evaluation.escalations),
    proposed_actions_json: JSON.stringify(evaluation.proposed_actions),
    tool_requests_json: JSON.stringify(evaluation.tool_requests),
    recommended_action_class: evaluation.recommended_action_class ?? null,
    created_at: new Date().toISOString(),
  });
}

export function makeSignal(changed: SyncCompletionSignal["changed_contexts"], scopeId = "mb-1"): SyncCompletionSignal {
  return {
    signal_id: "sn-1",
    scope_id: scopeId,
    synced_at: new Date().toISOString(),
    changed_contexts: changed,
  };
}

export function countActiveLeases(h: Harness, workItemId: string): number {
  const row = h.db.prepare(
    "select count(*) as c from work_item_leases where work_item_id = ? and released_at is null",
  ).get(workItemId) as { c: number };
  return row.c;
}

export function countDecisionsForWorkItem(h: Harness, workItemId: string): number {
  const row = h.db.prepare(
    "select count(*) as c from foreman_decisions where decision_id like ?",
  ).get(`%${workItemId}%`) as { c: number };
  return row.c;
}

export function countOutboundCommandsForThread(h: Harness, threadId: string): number {
  const row = h.db.prepare(
    "select count(*) as c from outbound_commands where conversation_id = ?",
  ).get(threadId) as { c: number };
  return row.c;
}
