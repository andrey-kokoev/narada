import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "../../../src/sqlite/database.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteFactStore } from "../../../src/facts/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { SqliteScheduler } from "../../../src/scheduler/scheduler.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import { MailboxContextStrategy } from "../../../src/foreman/mailbox/context-strategy.js";
import { MailboxContextMaterializer } from "../../../src/charter/mailbox/materializer.js";
import { FileMessageStore } from "../../../src/persistence/messages.js";
import { FileCursorStore } from "../../../src/persistence/cursor.js";
import { FileApplyLogStore } from "../../../src/persistence/apply-log.js";
import { DefaultProjector } from "../../../src/projector/apply-event.js";
import { DefaultSyncRunner } from "../../../src/runner/sync-once.js";
import { ExchangeSource } from "../../../src/adapter/graph/exchange-source.js";
import { DefaultWorkerRegistry } from "../../../src/workers/registry.js";
import { ObservationPlane } from "../../../src/observability/plane.js";
import { SendReplyWorker } from "../../../src/outbound/send-reply-worker.js";
import {
  buildInvocationEnvelope,
  buildEvaluationRecord,
  persistEvaluation,
  VerticalMaterializerRegistry,
} from "../../../src/charter/envelope.js";
import type {
  CharterRunner,
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
} from "@narada2/charters";
import type { GraphAdapter, NormalizedBatch, NormalizedEvent } from "../../../src/types/index.js";
import { SCHEMA_VERSION } from "../../../src/types/index.js";
import type { GraphDraftClient, DraftReadResult } from "../../../src/outbound/graph-draft-client.js";
import type { ParticipantResolver } from "../../../src/outbound/send-reply-worker.js";

describe("live operation smoke test — support-thread-login-issue", () => {
  let db: Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let factStore: SqliteFactStore;
  let executionStore: SqliteProcessExecutionStore;
  let scheduler: SqliteScheduler;
  let rootDir: string;
  let messageStore: FileMessageStore;

  beforeEach(async () => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    factStore = new SqliteFactStore({ db });
    executionStore = new SqliteProcessExecutionStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    factStore.initSchema();
    executionStore.initSchema();
    scheduler = new SqliteScheduler(coordinatorStore, {
      leaseDurationMs: 60_000,
      runnerId: "runner-test",
    });

    rootDir = await mkdtemp(join(tmpdir(), "narada-smoke-"));
    messageStore = new FileMessageStore({ rootDir });
  });

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeFixtureEvent(messageId: string, conversationId: string, eventId: string): NormalizedEvent {
    const observedAt = "2026-04-19T10:00:00.000Z";
    return {
      schema_version: SCHEMA_VERSION,
      event_id: eventId,
      event_kind: "created",
      mailbox_id: "help@global-maxima.com",
      message_id: messageId,
      source_item_id: `source-${messageId}`,
      source_version: "graph-v1",
      conversation_id: conversationId,
      observed_at: observedAt,
      received_at: observedAt,
      payload: {
        schema_version: SCHEMA_VERSION,
        mailbox_id: "help@global-maxima.com",
        message_id: messageId,
        event_id: eventId,
        kind: "created",
        source_version: "graph-v1",
        received_at: observedAt,
        observed_at: observedAt,
        conversation_id: conversationId,
        subject: "Can't log in to my account",
        from: { display_name: "Alice Customer", email: "alice@external.com" },
        reply_to: [],
        to: [{ display_name: "Help", email: "help@global-maxima.com" }],
        cc: [],
        bcc: [],
        folder_refs: ["inbox"],
        category_refs: [],
        flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
        body: {
          body_kind: "text",
          text:
            "Hi, I've been trying to log in for the last hour but I keep getting an invalid credentials error. I reset my password twice already. Can someone help? - Alice",
        },
        attachments: [],
      },
    };
  }

  function makeFixtureSync(event: NormalizedEvent): DefaultSyncRunner {
    const batch: NormalizedBatch = {
      schema_version: SCHEMA_VERSION,
      mailbox_id: event.mailbox_id,
      adapter_scope: {
        mailbox_id: event.mailbox_id,
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      fetched_at: event.observed_at ?? "2026-04-19T10:00:00.000Z",
      events: [event],
      prior_cursor: null,
      next_cursor: "cursor-1",
      has_more: false,
    };
    const adapter: GraphAdapter = {
      async fetch_since(cursor): Promise<NormalizedBatch> {
        return { ...batch, prior_cursor: cursor ?? null };
      },
    };
    return new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "help-global-maxima" }),
      cursorStore: new FileCursorStore({ rootDir, scopeId: "help-global-maxima" }),
      applyLogStore: new FileApplyLogStore({ rootDir }),
      projector: new DefaultProjector({ rootDir }),
      factStore,
    });
  }

  // Charter runner that produces a valid draft_reply payload matching the fixture
  const supportCharterRunner: CharterRunner = {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary:
          "Customer cannot log in. Password reset attempted twice. Recommend verifying account email and checking for account lockout.",
        classifications: [
          {
            kind: "issue_type",
            confidence: "high",
            rationale: "Login/authentication failure",
          },
        ],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [
          {
            action_type: "draft_reply",
            authority: "recommended",
            payload_json: JSON.stringify({
              reply_to_message_id: "msg-login-001",
              to: ["alice@external.com"],
              cc: [],
              bcc: [],
              subject: "Re: Can't log in to my account",
              body_text:
                "Hi Alice,\n\nThank you for reaching out. I'm sorry you're having trouble logging in.\n\nTo help you further, could you please confirm the email address associated with your account? Sometimes the account email differs from the one used to send this message.\n\nIn the meantime, I can see you've already tried resetting your password twice. Our team will look into whether there might be an account lockout or system issue on our end.\n\nBest regards,\nGlobal Maxima Support",
            }),
            rationale:
              "Draft a helpful reply that acknowledges the issue, asks for the account email, and does not promise a specific resolution timeline.",
          },
        ],
        tool_requests: [],
        escalations: [],
        reasoning_log:
          "Support steward evaluated login issue. No tools needed. Draft reply is appropriate.",
      };
    },
  };

  it("full pipeline: fixture → sync → dispatch → charter → foreman → worker → confirmed draft", async () => {
    // -----------------------------------------------------------------
    // Stage 0: Source adapter + sync runner — source record → fact + state
    // -----------------------------------------------------------------
    const sourceEvent = makeFixtureEvent(
      "msg-login-001",
      "conv-support-login-001",
      "evt-login-001",
    );
    const syncRunner = makeFixtureSync(sourceEvent);
    const syncResult = await syncRunner.syncOnce();

    expect(syncResult.status).toBe("success");
    expect(syncResult.event_count).toBe(1);
    expect(syncResult.applied_count).toBe(1);
    expect(syncResult.skipped_count).toBe(0);
    expect(syncResult.next_cursor).toBe("cursor-1");

    const fact = factStore.getBySourceRecord("help-global-maxima", "evt-login-001");
    expect(fact).toBeDefined();
    expect(fact!.fact_type).toBe("mail.message.discovered");
    expect(fact!.provenance.source_record_id).toBe("evt-login-001");
    expect(fact!.provenance.source_cursor).toBe("cursor-1");

    const materializedMessage = await messageStore.readRecord("msg-login-001");
    expect(materializedMessage).toBeDefined();
    expect(materializedMessage!.conversation_id).toBe("conv-support-login-001");
    expect(materializedMessage!.subject).toBe("Can't log in to my account");

    // Re-fetching the same source delta must not duplicate facts or projections.
    const replayResult = await syncRunner.syncOnce();
    expect(replayResult.status).toBe("success");
    expect(replayResult.applied_count).toBe(0);
    expect(replayResult.skipped_count).toBe(1);
    expect(factStore.getBySourceRecord("help-global-maxima", "evt-login-001")!.fact_id).toBe(
      fact!.fact_id,
    );

    // -----------------------------------------------------------------
    // Stage 1: Foreman dispatch — facts → context → work item
    // -----------------------------------------------------------------
    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-smoke",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: [
          "draft_reply",
          "mark_read",
          "no_action",
          "tool_request",
          "extract_obligations",
          "create_followup",
        ],
        require_human_approval: false,
      }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const openResult = await foreman.onFactsAdmitted([fact!], "help-global-maxima");
    factStore.markAdmitted([fact!.fact_id]);
    expect(factStore.getUnadmittedFacts("help-global-maxima")).toHaveLength(0);

    expect(openResult.opened).toHaveLength(1);
    const opened = openResult.opened[0]!;
    expect(opened.context_id).toBe("conv-support-login-001");

    // Verify context record
    const contextRecord = coordinatorStore.getContextRecord("conv-support-login-001");
    expect(contextRecord).toBeDefined();
    expect(contextRecord!.primary_charter).toBe("support_steward");
    expect(contextRecord!.scope_id).toBe("help-global-maxima");

    // Verify revision
    const revision = db
      .prepare("select * from context_revisions where context_id = ?")
      .get("conv-support-login-001") as Record<string, unknown> | undefined;
    expect(revision).toBeDefined();
    expect(revision!.ordinal).toBe(1);

    // Verify work item
    const workItem = coordinatorStore.getWorkItem(opened.work_item_id);
    expect(workItem).toBeDefined();
    expect(workItem!.status).toBe("opened");
    expect(workItem!.context_id).toBe("conv-support-login-001");
    expect(workItem!.scope_id).toBe("help-global-maxima");

    // -----------------------------------------------------------------
    // Stage 2: Scheduler — lease + execution start
    // -----------------------------------------------------------------
    const runnable = scheduler.scanForRunnableWork("help-global-maxima", 10);
    expect(runnable).toHaveLength(1);
    expect(runnable[0]!.work_item_id).toBe(opened.work_item_id);

    const leaseResult = scheduler.acquireLease(opened.work_item_id, "runner-test");
    expect(leaseResult.success).toBe(true);

    // -----------------------------------------------------------------
    // Stage 3: Charter evaluation
    // -----------------------------------------------------------------
    const materializerRegistry = new VerticalMaterializerRegistry();
    materializerRegistry.register(
      "mail",
      () => new MailboxContextMaterializer(rootDir, messageStore),
    );

    const envelope = await buildInvocationEnvelope(
      {
        coordinatorStore,
        rootDir,
        getRuntimePolicy: () => ({
          primary_charter: "support_steward",
          allowed_actions: [
            "draft_reply",
            "mark_read",
            "no_action",
            "tool_request",
            "extract_obligations",
            "create_followup",
          ],
          require_human_approval: false,
        }),
        materializerRegistry,
      },
      {
        executionId: `exec_${opened.work_item_id}`,
        workItem: workItem!,
        tools: [],
      },
    );

    const attempt = scheduler.startExecution(
      opened.work_item_id,
      opened.revision_id,
      JSON.stringify(envelope),
    );
    expect(attempt.status).toBe("active");
    expect(envelope.charter_id).toBe("support_steward");
    expect(envelope.allowed_actions).toContain("draft_reply");

    const output = await supportCharterRunner.run(envelope);
    expect(output.outcome).toBe("complete");
    expect(output.proposed_actions).toHaveLength(1);
    expect(output.proposed_actions[0]!.action_type).toBe("draft_reply");

    scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));

    const evaluation = buildEvaluationRecord(output, {
      execution_id: attempt.execution_id,
      work_item_id: opened.work_item_id,
      context_id: opened.context_id,
    });
    persistEvaluation(evaluation, coordinatorStore, "help-global-maxima");

    // Verify evaluation record
    const evalRow = coordinatorStore.getEvaluationByExecutionId(attempt.execution_id);
    expect(evalRow).toBeDefined();
    expect(evalRow!.charter_id).toBe("support_steward");
    expect(evalRow!.outcome).toBe("complete");
    expect(evalRow!.summary).toContain("cannot log in");

    // -----------------------------------------------------------------
    // Stage 4: Foreman resolution → decision + outbound command
    // -----------------------------------------------------------------
    const resolveResult = await foreman.resolveWorkItem({
      work_item_id: opened.work_item_id,
      execution_id: attempt.execution_id,
      evaluation_id: evaluation.evaluation_id,
    });

    expect(resolveResult.success).toBe(true);
    expect(resolveResult.resolution_outcome).toBe("action_created");
    expect(resolveResult.outbound_id).toBeDefined();

    const resolvedWorkItem = coordinatorStore.getWorkItem(opened.work_item_id);
    expect(resolvedWorkItem!.status).toBe("resolved");
    expect(resolvedWorkItem!.resolution_outcome).toBe("action_created");

    const decision = coordinatorStore.getDecisionById(
      `fd_${opened.work_item_id}_draft_reply`,
    );
    expect(decision).toBeDefined();
    expect(decision!.approved_action).toBe("draft_reply");
    expect(decision!.rationale).toBeDefined();

    // Verify outbound command
    const outboundId = resolveResult.outbound_id!;
    const outboundCommand = outboundStore.getCommand(outboundId);
    expect(outboundCommand).toBeDefined();
    expect(outboundCommand!.action_type).toBe("draft_reply");
    expect(outboundCommand!.status).toBe("pending");

    const outboundVersion = outboundStore.getLatestVersion(outboundId);
    expect(outboundVersion).toBeDefined();
    expect(outboundVersion!.to).toEqual(["alice@external.com"]);
    expect(outboundVersion!.subject).toBe("Re: Can't log in to my account");

    const intent = intentStore.getByTargetId(outboundId);
    expect(intent).toBeDefined();
    expect(intent!.intent_type).toBe("mail.draft_reply");
    expect(intent!.executor_family).toBe("mail");
    expect(intent!.status).toBe("admitted");

    // -----------------------------------------------------------------
    // Stage 4b: Restart recovery — committed handoff, unresolved work item
    // -----------------------------------------------------------------
    coordinatorStore.updateWorkItemStatus(opened.work_item_id, "executing", {
      resolution_outcome: null,
    });
    const restartedForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-smoke-restarted",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: [
          "draft_reply",
          "mark_read",
          "no_action",
          "tool_request",
          "extract_obligations",
          "create_followup",
        ],
        require_human_approval: false,
      }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });
    const recoveredResult = await restartedForeman.resolveWorkItem({
      work_item_id: opened.work_item_id,
      execution_id: attempt.execution_id,
      evaluation_id: evaluation.evaluation_id,
    });
    expect(recoveredResult.success).toBe(true);
    expect(recoveredResult.outbound_id).toBe(outboundId);
    expect(coordinatorStore.getWorkItem(opened.work_item_id)!.status).toBe("resolved");
    expect(
      db.prepare("select count(*) as count from outbound_handoffs").get() as { count: number },
    ).toEqual({ count: 1 });
    expect(
      db.prepare("select count(*) as count from intents").get() as { count: number },
    ).toEqual({ count: 1 });

    // Observation is a read-only projection over the durable state above.
    const observation = new ObservationPlane({
      registry: new DefaultWorkerRegistry(),
      coordinatorStore,
      outboundStore,
      intentStore,
      executionStore,
    }).snapshot("help-global-maxima");
    expect(observation.control_plane.work_items.total_count).toBe(1);
    expect(observation.control_plane.outbound.total_count).toBe(1);
    expect(observation.control_plane.outbound.by_status.pending).toBe(1);
    expect(observation.intents.total_count).toBe(1);
    expect(observation.intents.pending).toHaveLength(1);
    expect(observation._meta?.source_classifications.intents).toBe("authoritative");

    // -----------------------------------------------------------------
    // Stage 5: Send-reply worker with mock Graph client
    // -----------------------------------------------------------------
    let createdDraftId = "";
    const mockDraftClient: GraphDraftClient = {
      async createDraft(_userId, _payload): Promise<{ id: string }> {
        createdDraftId = "draft-login-001";
        return { id: createdDraftId };
      },
      async getDraft(_userId, draftId): Promise<DraftReadResult> {
        return {
          id: draftId,
          subject: outboundVersion!.subject,
          body: {
            contentType: outboundVersion!.body_html ? "HTML" : "Text",
            content: outboundVersion!.body_html || outboundVersion!.body_text,
          },
          toRecipients: outboundVersion!.to.map((email) => ({
            emailAddress: { address: email },
          })),
          ccRecipients: outboundVersion!.cc.map((email) => ({
            emailAddress: { address: email },
          })),
          bccRecipients: outboundVersion!.bcc.map((email) => ({
            emailAddress: { address: email },
          })),
          internetMessageHeaders: [
            { name: "X-Outbound-Id", value: outboundId },
          ],
        };
      },
      async sendDraft(_userId, _draftId): Promise<void> {
        // no-op for draft_reply — confirmDraft does not call sendDraft
      },
    };

    const mockParticipantResolver: ParticipantResolver = {
      async getParticipants(): Promise<Set<string>> {
        return new Set(["alice@external.com", "help@global-maxima.com"]);
      },
    };

    const worker = new SendReplyWorker({
      store: outboundStore,
      draftClient: mockDraftClient,
      participantResolver: mockParticipantResolver,
      resolveUserId: () => "help@global-maxima.com",
    });

    const workerResult = await worker.processNext("help-global-maxima");
    expect(workerResult.processed).toBe(true);
    expect(workerResult.outboundId).toBe(outboundId);

    // -----------------------------------------------------------------
    // Stage 6: Verify final state
    // -----------------------------------------------------------------
    const finalCommand = outboundStore.getCommand(outboundId);
    expect(finalCommand).toBeDefined();
    // For draft_reply, the worker transitions: pending → draft_creating → draft_ready → confirmed
    expect(finalCommand!.status).toBe("confirmed");

    // Verify managed draft record exists
    const managedDraft = outboundStore.getManagedDraft(outboundId, finalCommand!.latest_version);
    expect(managedDraft).toBeDefined();
    expect(managedDraft!.draft_id).toBe(createdDraftId);

    // Verify transitions
    const transitions = db
      .prepare("select * from outbound_transitions where outbound_id = ? order by transition_at asc")
      .all(outboundId) as Array<{ to_status: string }>;
    const statuses = transitions.map((t) => t.to_status);
    expect(statuses).toContain("draft_creating");
    expect(statuses).toContain("draft_ready");
    expect(statuses).toContain("confirmed");

    // Verify draft body characteristics
    const finalVersion = outboundStore.getLatestVersion(outboundId);
    expect(finalVersion).toBeDefined();
    expect(finalVersion!.body_text).toContain("Alice");
    expect(finalVersion!.body_text).toContain("account");
    expect(finalVersion!.body_text).toContain("Global Maxima Support");
  });

  it("safe posture: require_human_approval=true stops at pending_approval", async () => {
    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-smoke-safe",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["draft_reply", "mark_read", "no_action"],
        require_human_approval: true,
      }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const sourceEvent = makeFixtureEvent(
      "msg-login-002",
      "conv-support-login-002",
      "evt-login-002",
    );
    const syncResult = await makeFixtureSync(sourceEvent).syncOnce();
    expect(syncResult.status).toBe("success");
    expect(syncResult.applied_count).toBe(1);
    const fact = factStore.getBySourceRecord("help-global-maxima", "evt-login-002");
    expect(fact).toBeDefined();

    const openResult = await foreman.onFactsAdmitted([fact!], "help-global-maxima");
    factStore.markAdmitted([fact!.fact_id]);
    expect(openResult.opened).toHaveLength(1);

    const workItem = coordinatorStore.getWorkItem(openResult.opened[0]!.work_item_id)!;

    // Simulate charter evaluation
    const leaseResult = scheduler.acquireLease(workItem.work_item_id, "runner-test");
    expect(leaseResult.success).toBe(true);

    const materializerRegistry = new VerticalMaterializerRegistry();
    materializerRegistry.register(
      "mail",
      () => new MailboxContextMaterializer(rootDir, messageStore),
    );
    const envelope = await buildInvocationEnvelope(
      {
        coordinatorStore,
        rootDir,
        getRuntimePolicy: () => ({
          primary_charter: "support_steward",
          allowed_actions: ["draft_reply", "mark_read", "no_action"],
          require_human_approval: true,
        }),
        materializerRegistry,
      },
      {
        executionId: `exec_${workItem.work_item_id}`,
        workItem: workItem!,
        tools: [],
      },
    );

    const attempt = scheduler.startExecution(
      workItem.work_item_id,
      workItem.opened_for_revision_id,
      JSON.stringify(envelope),
    );

    const evaluation = buildEvaluationRecord(
      await supportCharterRunner.run({
        invocation_version: "2.0",
        execution_id: attempt.execution_id,
        work_item_id: workItem.work_item_id,
        context_id: workItem.context_id,
        scope_id: workItem.scope_id,
        charter_id: "support_steward",
        role: "primary",
        invoked_at: new Date().toISOString(),
        revision_id: workItem.opened_for_revision_id,
        context_materialization: {},
        vertical_hints: {},
        allowed_actions: ["draft_reply", "mark_read", "no_action"],
        available_tools: [],
        coordinator_flags: [],
        prior_evaluations: [],
        max_prior_evaluations: 3,
      }),
      {
        execution_id: attempt.execution_id,
        work_item_id: workItem.work_item_id,
        context_id: workItem.context_id,
      },
    );
    persistEvaluation(evaluation, coordinatorStore, "help-global-maxima");

    const resolveResult = await foreman.resolveWorkItem({
      work_item_id: workItem.work_item_id,
      execution_id: attempt.execution_id,
      evaluation_id: evaluation.evaluation_id,
    });

    expect(resolveResult.success).toBe(true);
    expect(resolveResult.resolution_outcome).toBe("pending_approval");
    expect(resolveResult.outbound_id).toBeDefined();

    const resolvedItem = coordinatorStore.getWorkItem(workItem.work_item_id);
    expect(resolvedItem!.status).toBe("resolved");
    expect(resolvedItem!.resolution_outcome).toBe("pending_approval");

    // The outbound command is pending and remains behind the approval boundary.
    const outbounds = db
      .prepare("select * from outbound_handoffs where context_id = ?")
      .all("conv-support-login-002") as Array<Record<string, unknown>>;
    expect(outbounds).toHaveLength(1);
    expect(outbounds[0]!.action_type).toBe("draft_reply");
    expect(outbounds[0]!.status).toBe("pending");
  });
});
