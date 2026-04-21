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
import { buildEvaluationRecord, persistEvaluation } from "../../../src/charter/envelope.js";
import type { Fact } from "../../../src/facts/types.js";
import type { CharterRunner, CharterInvocationEnvelope, CharterOutputEnvelope } from "@narada2/charters";

interface ScenarioDef {
  name: string;
  contextId: string;
  recordId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  body: string;
  isFlagged: boolean;
  runner: CharterRunner;
  expectedActionClass: string;
  expectedConfidence: "high" | "medium" | "low";
  expectedEscalationCount: number;
  expectedSummaryContains: string;
  expectedResolutionOutcome: "action_created" | "pending_approval" | "escalated";
}

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

const scenarioRunners: Record<string, CharterRunner> = {
  login: {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Customer cannot log in. Password reset attempted twice. Recommend verifying account email and checking for account lockout.",
        classifications: [{ kind: "issue_type", confidence: "high", rationale: "Login/authentication failure" }],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [{
          action_type: "draft_reply",
          authority: "recommended",
          payload_json: JSON.stringify({
            reply_to_message_id: "msg-login-001",
            to: ["alice@external.com"],
            cc: [], bcc: [],
            subject: "Re: Can't log in to my account",
            body_text: "Hi Alice,\n\nThank you for reaching out. Could you confirm the email address associated with your account?\n\nBest regards,\nGlobal Maxima Support",
          }),
          rationale: "Draft a helpful reply that asks for the account email.",
        }],
        tool_requests: [],
        escalations: [],
        reasoning_log: "Support steward evaluated login issue. Draft reply is appropriate.",
      };
    },
  },

  billing: {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Customer reports a duplicate charge on April 15. Needs transaction verification before any refund can be processed.",
        classifications: [{ kind: "issue_type", confidence: "high", rationale: "Billing inquiry" }],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [{
          action_type: "draft_reply",
          authority: "recommended",
          payload_json: JSON.stringify({
            reply_to_message_id: "msg-billing-001",
            to: ["bob@external.com"],
            cc: [], bcc: [],
            subject: "Re: Question about my latest invoice",
            body_text: "Hi Bob,\n\nThank you for reaching out. To help us investigate the duplicate charge, could you please provide the transaction ID or a screenshot of both charges?\n\nBest regards,\nGlobal Maxima Support",
          }),
          rationale: "Request transaction details to verify the duplicate charge.",
        }],
        tool_requests: [],
        escalations: [],
        reasoning_log: "Billing question requires verification before any credit can be issued.",
      };
    },
  },

  refund: {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "medium", uncertainty_flags: ["awaiting_evidence"] },
        summary: "Customer requests refund for order GM-98234 due to damaged item. Needs photo evidence and order verification.",
        classifications: [
          { kind: "issue_type", confidence: "high", rationale: "Refund request" },
          { kind: "priority", confidence: "medium", rationale: "Flagged for review" },
        ],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [{
          action_type: "draft_reply",
          authority: "recommended",
          payload_json: JSON.stringify({
            reply_to_message_id: "msg-refund-001",
            to: ["carol@external.com"],
            cc: [], bcc: [],
            subject: "Re: Refund request for order #GM-98234",
            body_text: "Hi Carol,\n\nWe are sorry to hear the item arrived damaged. To process your refund request, could you please attach photos of the item and packaging? Our team will review within 2 business days.\n\nBest regards,\nGlobal Maxima Support",
          }),
          rationale: "Acknowledge refund request and request evidence per policy.",
        }],
        tool_requests: [],
        escalations: [],
        reasoning_log: "Refund request requires evidence before approval. Draft reply requests photos.",
      };
    },
  },

  escalation: {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Enterprise customer reports third outage this quarter. Sentiment is strongly negative. Requires executive attention and account review.",
        classifications: [
          { kind: "issue_type", confidence: "high", rationale: "Service complaint" },
          { kind: "priority", confidence: "high", rationale: "Enterprise impact" },
          { kind: "sentiment", confidence: "high", rationale: "Negative" },
        ],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [{
          action_type: "draft_reply",
          authority: "recommended",
          payload_json: JSON.stringify({
            reply_to_message_id: "msg-escalation-001",
            to: ["dana@enterprise-client.com"],
            cc: [], bcc: [],
            subject: "Re: Serious complaint about service outage — need executive response",
            body_text: "Hi Dana,\n\nWe sincerely apologize for the impact this outage has had on your team. We have escalated this to our executive leadership and customer success team. Someone will contact you within 24 hours to discuss a root-cause analysis and next steps.\n\nBest regards,\nGlobal Maxima Support",
          }),
          rationale: "Acknowledge severity, flag escalation, avoid specific commitment timelines beyond 24 hours.",
        }],
        tool_requests: [],
        escalations: [{ reason: "executive_attention_required", target_role: "customer_success_lead" }],
        reasoning_log: "Escalation-worthy complaint. Draft reply sent with escalation flag.",
      };
    },
  },

  ambiguous: {
    async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
      return {
        output_version: "2.0",
        execution_id: envelope.execution_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "low", uncertainty_flags: ["insufficient_detail"] },
        summary: "Customer message lacks specifics. Unable to determine product, error, or intent.",
        classifications: [{ kind: "issue_type", confidence: "low", rationale: "Unclear" }],
        facts: [],
        recommended_action_class: "draft_reply",
        proposed_actions: [{
          action_type: "draft_reply",
          authority: "recommended",
          payload_json: JSON.stringify({
            reply_to_message_id: "msg-ambiguous-001",
            to: ["evan@external.com"],
            cc: [], bcc: [],
            subject: "Re: Help!!!",
            body_text: "Hi Evan,\n\nWe are here to help. To assist you faster, could you please let us know which product you are using and what error message you are seeing?\n\nBest regards,\nGlobal Maxima Support",
          }),
          rationale: "Low-confidence message requires clarification before any action.",
        }],
        tool_requests: [],
        escalations: [],
        reasoning_log: "Ambiguous request. Draft reply asks for clarification.",
      };
    },
  },
};

describe("mailbox scenario library — evaluation and resolution shapes", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let scheduler: SqliteScheduler;
  let rootDir: string;

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
    rootDir = await mkdtemp(join(tmpdir(), "narada-scenarios-"));
  });

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  async function seedMessage(recordId: string, conversationId: string, subject: string, fromName: string, fromAddress: string, body: string, isFlagged: boolean) {
    const msgDir = join(rootDir, "messages", recordId);
    await mkdir(msgDir, { recursive: true });
    await writeFile(
      join(msgDir, "record.json"),
      JSON.stringify({
        schema_version: 1,
        mailbox_id: "help@global-maxima.com",
        message_id: recordId,
        conversation_id: conversationId,
        internet_message_id: `<${recordId}@example.com>`,
        subject,
        from: { display_name: fromName, email: fromAddress },
        sender: { display_name: fromName, email: fromAddress },
        reply_to: [],
        to: [{ display_name: "Help", email: "help@global-maxima.com" }],
        cc: [],
        bcc: [],
        receivedDateTime: "2026-04-19T10:00:00Z",
        sentDateTime: "2026-04-19T10:00:00Z",
        body: { contentType: "text", content: body },
        isRead: false,
        isDraft: false,
        hasAttachments: false,
        folder_refs: ["inbox"],
        category_refs: [],
        flags: { is_read: false, is_draft: false, is_flagged: isFlagged, has_attachments: false },
      }),
      "utf-8",
    );
  }

  const scenarios: ScenarioDef[] = [
    {
      name: "login/access issue",
      contextId: "conv-support-login-001",
      recordId: "msg-login-001",
      subject: "Can't log in to my account",
      fromName: "Alice Customer",
      fromAddress: "alice@external.com",
      body: "Hi, I've been trying to log in for the last hour but I keep getting an 'invalid credentials' error. I reset my password twice already. Can someone help?\n\n— Alice",
      isFlagged: false,
      runner: scenarioRunners.login,
      expectedActionClass: "draft_reply",
      expectedConfidence: "high",
      expectedEscalationCount: 0,
      expectedSummaryContains: "cannot log in",
      expectedResolutionOutcome: "action_created",
    },
    {
      name: "billing question",
      contextId: "conv-support-billing-001",
      recordId: "msg-billing-001",
      subject: "Question about my latest invoice",
      fromName: "Bob Customer",
      fromAddress: "bob@external.com",
      body: "Hi there,\n\nI noticed I was charged twice for my subscription on April 15. I only have one account, so this looks like a duplicate charge. Can you help me understand what happened and refund the extra charge?\n\nMy card ending in 4242 was used for both transactions.\n\nThanks,\nBob",
      isFlagged: false,
      runner: scenarioRunners.billing,
      expectedActionClass: "draft_reply",
      expectedConfidence: "high",
      expectedEscalationCount: 0,
      expectedSummaryContains: "duplicate charge",
      expectedResolutionOutcome: "action_created",
    },
    {
      name: "refund request",
      contextId: "conv-support-refund-001",
      recordId: "msg-refund-001",
      subject: "Refund request for order #GM-98234",
      fromName: "Carol Customer",
      fromAddress: "carol@external.com",
      body: "Hello,\n\nI would like to request a refund for order #GM-98234 placed on April 10. The item arrived damaged and does not match the description on your site. I have photos if needed.\n\nPlease let me know the next steps.\n\nBest,\nCarol",
      isFlagged: true,
      runner: scenarioRunners.refund,
      expectedActionClass: "draft_reply",
      expectedConfidence: "medium",
      expectedEscalationCount: 0,
      expectedSummaryContains: "refund",
      expectedResolutionOutcome: "pending_approval",
    },
    {
      name: "escalation-worthy complaint",
      contextId: "conv-support-escalation-001",
      recordId: "msg-escalation-001",
      subject: "Serious complaint about service outage — need executive response",
      fromName: "Dana Enterprise",
      fromAddress: "dana@enterprise-client.com",
      body: "To whom it may concern,\n\nOur team lost six hours of productive work yesterday due to an unannounced service outage. This is the third incident this quarter. We are an enterprise customer and this level of reliability is unacceptable.\n\nI am escalating this to executive leadership. We need a root-cause analysis, a credit on our account, and a call with your head of customer success by end of week.\n\nDana\nDirector of Operations, Enterprise Client",
      isFlagged: true,
      runner: scenarioRunners.escalation,
      expectedActionClass: "draft_reply",
      expectedConfidence: "high",
      expectedEscalationCount: 1,
      expectedSummaryContains: "executive attention",
      expectedResolutionOutcome: "action_created",
    },
    {
      name: "ambiguous request",
      contextId: "conv-support-ambiguous-001",
      recordId: "msg-ambiguous-001",
      subject: "Help!!!",
      fromName: "Evan Customer",
      fromAddress: "evan@external.com",
      body: "something is broken please fix it asap",
      isFlagged: false,
      runner: scenarioRunners.ambiguous,
      expectedActionClass: "draft_reply",
      expectedConfidence: "low",
      expectedEscalationCount: 0,
      expectedSummaryContains: "lacks specifics",
      expectedResolutionOutcome: "escalated",
    },
  ];

  scenarios.forEach((scenario) => {
    it(`${scenario.name}: fixture → charter → expected action class and resolution`, async () => {
      await seedMessage(
        scenario.recordId,
        scenario.contextId,
        scenario.subject,
        scenario.fromName,
        scenario.fromAddress,
        scenario.body,
        scenario.isFlagged,
      );

      const foreman = new DefaultForemanFacade({
        coordinatorStore,
        outboundStore,
        intentStore,
        db,
        foremanId: `fm-${scenario.recordId}`,
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

      // Stage 1: Dispatch
      const facts = [makeMailFact(scenario.contextId, scenario.recordId)];
      const openResult = await foreman.onFactsAdmitted(facts, "help-global-maxima");
      expect(openResult.opened).toHaveLength(1);
      const opened = openResult.opened[0]!;
      expect(opened.context_id).toBe(scenario.contextId);

      const workItem = coordinatorStore.getWorkItem(opened.work_item_id);
      expect(workItem).toBeDefined();
      expect(workItem!.status).toBe("opened");

      // Stage 2: Lease
      const leaseResult = scheduler.acquireLease(opened.work_item_id, "runner-test");
      expect(leaseResult.success).toBe(true);

      // Stage 3: Charter evaluation (scenario-specific runner)
      const invocationEnvelope = {
        invocation_version: "2.0" as const,
        execution_id: `exec_${opened.work_item_id}`,
        work_item_id: opened.work_item_id,
        context_id: opened.context_id,
        scope_id: "help-global-maxima",
        charter_id: "support_steward" as const,
        role: "primary" as const,
        invoked_at: new Date().toISOString(),
        revision_id: opened.revision_id,
        context_materialization: {},
        vertical_hints: {},
        allowed_actions: ["draft_reply", "mark_read", "no_action", "tool_request", "extract_obligations", "create_followup"] as const,
        available_tools: [],
        coordinator_flags: [],
        prior_evaluations: [],
        max_prior_evaluations: 3,
      };

      const attempt = scheduler.startExecution(
        opened.work_item_id,
        opened.revision_id,
        JSON.stringify(invocationEnvelope),
      );
      expect(attempt.status).toBe("active");

      const output = await scenario.runner.run(invocationEnvelope);

      expect(output.outcome).toBe("complete");
      expect(output.recommended_action_class).toBe(scenario.expectedActionClass);
      expect(output.confidence.overall).toBe(scenario.expectedConfidence);
      expect(output.escalations).toHaveLength(scenario.expectedEscalationCount);
      expect(output.summary.toLowerCase()).toContain(scenario.expectedSummaryContains.toLowerCase());
      expect(output.proposed_actions).toHaveLength(1);
      expect(output.proposed_actions[0]!.action_type).toBe(scenario.expectedActionClass);

      scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));

      // Persist evaluation
      const evaluation = buildEvaluationRecord(output, {
        execution_id: attempt.execution_id,
        work_item_id: opened.work_item_id,
        context_id: opened.context_id,
      });
      persistEvaluation(evaluation, coordinatorStore, "help-global-maxima");

      // Stage 4: Foreman resolution
      const resolveResult = await foreman.resolveWorkItem({
        work_item_id: opened.work_item_id,
        execution_id: attempt.execution_id,
        evaluation_id: evaluation.evaluation_id,
      });

      expect(resolveResult.success).toBe(true);
      expect(resolveResult.resolution_outcome).toBe(scenario.expectedResolutionOutcome);

      if (scenario.expectedResolutionOutcome === "action_created") {
        expect(resolveResult.outbound_id).toBeDefined();

        // Verify outbound command shape
        const outboundCommand = outboundStore.getCommand(resolveResult.outbound_id!);
        expect(outboundCommand).toBeDefined();
        expect(outboundCommand!.action_type).toBe(scenario.expectedActionClass);
        expect(outboundCommand!.status).toBe("pending");

        const outboundVersion = outboundStore.getLatestVersion(resolveResult.outbound_id!);
        expect(outboundVersion).toBeDefined();
        expect(outboundVersion!.to).toEqual([scenario.fromAddress]);
        expect(outboundVersion!.subject).toBe(`Re: ${scenario.subject}`);
      } else if (scenario.expectedResolutionOutcome === "pending_approval") {
        expect(resolveResult.outbound_id).toBeUndefined();
        const outbounds = db
          .prepare("select * from outbound_handoffs where context_id = ?")
          .all(scenario.contextId) as Array<Record<string, unknown>>;
        expect(outbounds).toHaveLength(0);
      } else if (scenario.expectedResolutionOutcome === "escalated") {
        expect(resolveResult.outbound_id).toBeUndefined();
        const outbounds = db
          .prepare("select * from outbound_handoffs where context_id = ?")
          .all(scenario.contextId) as Array<Record<string, unknown>>;
        expect(outbounds).toHaveLength(0);
      }

      const resolvedItem = coordinatorStore.getWorkItem(opened.work_item_id);
      expect(resolvedItem!.status).toBe("resolved");
      expect(resolvedItem!.resolution_outcome).toBe(scenario.expectedResolutionOutcome);

      if (scenario.expectedResolutionOutcome === "action_created") {
        // Verify outbound command shape
        const outboundCommand = outboundStore.getCommand(resolveResult.outbound_id!);
        expect(outboundCommand).toBeDefined();
        expect(outboundCommand!.action_type).toBe(scenario.expectedActionClass);
        expect(outboundCommand!.status).toBe("pending");

        const outboundVersion = outboundStore.getLatestVersion(resolveResult.outbound_id!);
        expect(outboundVersion).toBeDefined();
        expect(outboundVersion!.to).toEqual([scenario.fromAddress]);
        expect(outboundVersion!.subject).toBe(`Re: ${scenario.subject}`);
      }
    });
  });

  it("all scenarios default to pending_approval when require_human_approval=true", async () => {
    const safeForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-safe",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["draft_reply", "mark_read", "no_action"],
        require_human_approval: true,
      }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    // Use the login scenario as the representative case for safe posture
    // (high confidence, no uncertainty flags, no escalations)
    const scenario = scenarios[0]!;
    await seedMessage(
      scenario.recordId + "-safe",
      scenario.contextId + "-safe",
      scenario.subject,
      scenario.fromName,
      scenario.fromAddress,
      scenario.body,
      scenario.isFlagged,
    );

    const facts = [makeMailFact(scenario.contextId + "-safe", scenario.recordId + "-safe")];
    const openResult = await safeForeman.onFactsAdmitted(facts, "help-global-maxima");
    expect(openResult.opened).toHaveLength(1);
    const opened = openResult.opened[0]!;

    const leaseResult = scheduler.acquireLease(opened.work_item_id, "runner-test");
    expect(leaseResult.success).toBe(true);

    const invocationEnvelope = {
      invocation_version: "2.0" as const,
      execution_id: `exec_${opened.work_item_id}`,
      work_item_id: opened.work_item_id,
      context_id: opened.context_id,
      scope_id: "help-global-maxima",
      charter_id: "support_steward" as const,
      role: "primary" as const,
      invoked_at: new Date().toISOString(),
      revision_id: opened.revision_id,
      context_materialization: {},
      vertical_hints: {},
      allowed_actions: ["draft_reply", "mark_read", "no_action"] as const,
      available_tools: [],
      coordinator_flags: [],
      prior_evaluations: [],
      max_prior_evaluations: 3,
    };

    const attempt = scheduler.startExecution(
      opened.work_item_id,
      opened.revision_id,
      JSON.stringify(invocationEnvelope),
    );
    expect(attempt.status).toBe("active");

    const output = await scenario.runner.run(invocationEnvelope);

    scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));

    const evaluation = buildEvaluationRecord(output, {
      execution_id: attempt.execution_id,
      work_item_id: opened.work_item_id,
      context_id: opened.context_id,
    });
    persistEvaluation(evaluation, coordinatorStore, "help-global-maxima");

    const resolveResult = await safeForeman.resolveWorkItem({
      work_item_id: opened.work_item_id,
      execution_id: attempt.execution_id,
      evaluation_id: evaluation.evaluation_id,
    });

    expect(resolveResult.success).toBe(true);
    expect(resolveResult.resolution_outcome).toBe("pending_approval");
    expect(resolveResult.outbound_id).toBeUndefined();

    const resolvedItem = coordinatorStore.getWorkItem(opened.work_item_id);
    expect(resolvedItem!.status).toBe("resolved");
    expect(resolvedItem!.resolution_outcome).toBe("pending_approval");

    const outbounds = db
      .prepare("select * from outbound_handoffs where context_id = ?")
      .all(scenario.contextId + "-safe") as Array<Record<string, unknown>>;
    expect(outbounds).toHaveLength(0);
  });
});
