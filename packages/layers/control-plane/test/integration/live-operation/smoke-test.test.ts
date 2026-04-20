import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteScheduler } from "../../../src/scheduler/scheduler.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import { MailboxContextStrategy } from "../../../src/foreman/mailbox/context-strategy.js";
import { MailboxContextMaterializer } from "../../../src/charter/mailbox/materializer.js";
import { FileMessageStore } from "../../../src/persistence/messages.js";
import { SendReplyWorker } from "../../../src/outbound/send-reply-worker.js";
import {
  buildInvocationEnvelope,
  buildEvaluationRecord,
  persistEvaluation,
  VerticalMaterializerRegistry,
} from "../../../src/charter/envelope.js";
import type { Fact } from "../../../src/facts/types.js";
import type {
  CharterRunner,
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
} from "@narada2/charters";
import type { GraphDraftClient, DraftReadResult } from "../../../src/outbound/graph-draft-client.js";
import type { ParticipantResolver } from "../../../src/outbound/send-reply-worker.js";

describe("live operation smoke test — support-thread-login-issue", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let scheduler: SqliteScheduler;
  let rootDir: string;
  let messageStore: FileMessageStore;

  beforeEach(async () => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    scheduler = new SqliteScheduler(coordinatorStore, {
      leaseDurationMs: 60_000,
      runnerId: "runner-test",
    });

    rootDir = await mkdtemp(join(tmpdir(), "narada-smoke-"));
    messageStore = new FileMessageStore({ rootDir });

    // Seed the support-thread-login-issue fixture on disk
    const conversationId = "conv-support-login-001";
    const messageId = "msg-login-001";
    const msgDir = join(rootDir, "messages", messageId);
    await mkdir(msgDir, { recursive: true });
    await writeFile(
      join(msgDir, "record.json"),
      JSON.stringify({
        schema_version: 1,
        mailbox_id: "help@global-maxima.com",
        message_id: messageId,
        conversation_id: conversationId,
        internet_message_id: "<msg-login-001@example.com>",
        subject: "Can't log in to my account",
        from: { display_name: "Alice Customer", email: "alice@external.com" },
        sender: { display_name: "Alice Customer", email: "alice@external.com" },
        reply_to: [],
        to: [{ display_name: "Help", email: "help@global-maxima.com" }],
        cc: [],
        bcc: [],
        receivedDateTime: "2026-04-19T10:00:00Z",
        sentDateTime: "2026-04-19T10:00:00Z",
        body: {
          contentType: "text",
          content:
            "Hi, I've been trying to log in for the last hour but I keep getting an 'invalid credentials' error. I reset my password twice already. Can someone help?\n\n— Alice",
        },
        isRead: false,
        isDraft: false,
        hasAttachments: false,
        folder_refs: ["inbox"],
        category_refs: [],
        flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
      }),
      "utf-8",
    );
  });

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeMailFact(contextId: string, recordId: string): Fact {
    return {
      fact_id: `fact_mail_${contextId}_${recordId}`,
      fact_type: "mail.message.discovered",
      provenance: {
        source_id: "help-global-maxima",
        source_record_id: recordId,
        source_version: null,
        source_cursor: "cursor-1",
        observed_at: "2026-04-19T10:00:00Z",
      },
      payload_json: JSON.stringify({
        record_id: recordId,
        ordinal: "2026-04-19T10:00:00Z",
        event: {
          event_id: recordId,
          event_kind: "created",
          conversation_id: contextId,
          thread_id: contextId,
        },
      }),
      created_at: "2026-04-19T10:00:00Z",
    };
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

    const facts = [makeMailFact("conv-support-login-001", "msg-login-001")];
    const openResult = await foreman.onFactsAdmitted(facts, "help-global-maxima");

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

    // -----------------------------------------------------------------
    // Stage 5: Send-reply worker with mock Graph client
    // -----------------------------------------------------------------
    let createdDraftId = "";
    const mockDraftClient: GraphDraftClient = {
      async createDraft(_userId, payload): Promise<{ id: string }> {
        createdDraftId = `draft-${Math.random().toString(36).slice(2)}`;
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

    const facts = [makeMailFact("conv-support-login-002", "msg-login-002")];
    const openResult = await foreman.onFactsAdmitted(facts, "help-global-maxima");
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
    expect(resolveResult.outbound_id).toBeUndefined();

    const resolvedItem = coordinatorStore.getWorkItem(workItem.work_item_id);
    expect(resolvedItem!.status).toBe("resolved");
    expect(resolvedItem!.resolution_outcome).toBe("pending_approval");

    // No outbound command should be created
    const outbounds = db
      .prepare("select * from outbound_handoffs where context_id = ?")
      .all("conv-support-login-002") as Array<Record<string, unknown>>;
    expect(outbounds).toHaveLength(0);
  });
});
