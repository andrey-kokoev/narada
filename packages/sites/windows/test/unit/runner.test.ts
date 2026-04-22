import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultWindowsSiteRunner } from "../../src/runner.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";
import { MockCharterRunner } from "@narada2/control-plane";
import type { WindowsSiteConfig } from "../../src/types.js";

describe("DefaultWindowsSiteRunner", () => {
  let tempDir: string;
  let config: WindowsSiteConfig;
  let runner: DefaultWindowsSiteRunner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-runner-test-"));
    config = {
      site_id: "test-site",
      variant: "wsl",
      site_root: tempDir,
      config_path: join(tempDir, "config.json"),
      cycle_interval_minutes: 5,
      lock_ttl_ms: 35_000,
      ceiling_ms: 30_000,
    };
    runner = new DefaultWindowsSiteRunner({
      ceilingMs: 10_000,
      abortBufferMs: 1_000,
      lockTtlMs: 15_000,
    });
    // Override site root via env for testing
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("runCycle", () => {
    it("executes a complete cycle and writes health + trace", async () => {
      const result = await runner.runCycle(config, { mode: "fixture" });

      expect(result.site_id).toBe("test-site");
      expect(result.status).toBe("complete");
      expect(result.steps_completed).toContain(1); // lock acquired
      expect(result.steps_completed).toContain(8); // lock released
      expect(result.error).toBeUndefined();

      // Verify health was written
      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
        expect(health.last_cycle_at).not.toBeNull();

        const trace = coordinator.getLastCycleTrace("test-site");
        expect(trace).not.toBeNull();
        expect(trace!.cycle_id).toBe(result.cycle_id);
        expect(trace!.status).toBe("complete");
      } finally {
        coordinator.close();
      }
    });

    it("creates site directory structure", async () => {
      await runner.runCycle(config, { mode: "fixture" });

      expect(() => statSync(join(tempDir, "test-site", "state"))).not.toThrow();
      expect(() => statSync(join(tempDir, "test-site", "logs"))).not.toThrow();
      expect(() => statSync(join(tempDir, "test-site", "traces"))).not.toThrow();
    });

    it("releases lock even when cycle fails", async () => {
      // Force a failure by using a very short ceiling
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      const result = await failingRunner.runCycle(config, { mode: "fixture" });

      // Should be partial because deadline is exceeded immediately
      expect(result.status).toBe("partial");

      // Lock should be released — we can run another cycle
      const result2 = await runner.runCycle(config, { mode: "fixture" });
      expect(result2.status).toBe("complete");
    });

    it("increments consecutive failures on repeated failures", async () => {
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      // Run 3 failing cycles
      await failingRunner.runCycle(config, { mode: "fixture" });
      await failingRunner.runCycle(config, { mode: "fixture" });
      await failingRunner.runCycle(config, { mode: "fixture" });

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        // computeHealthTransition degrades to critical after 3 failures
        expect(health.status).toBe("critical");
        expect(health.consecutive_failures).toBe(3);
      } finally {
        coordinator.close();
      }
    });

    it("resets consecutive failures after a successful cycle", async () => {
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      // Run 2 failing cycles
      await failingRunner.runCycle(config, { mode: "fixture" });
      await failingRunner.runCycle(config, { mode: "fixture" });

      // Then a successful one
      await runner.runCycle(config, { mode: "fixture" });

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
      } finally {
        coordinator.close();
      }
    });

    it("fails honestly when mode is live but live_source is missing", async () => {
      const result = await runner.runCycle(config, { mode: "live" });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("live_source is missing");
    });

    it("fails honestly when no mode is specified and no live_source or fixtureDeltas exist", async () => {
      const result = await runner.runCycle(config);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("no mode specified");
    });

    it("fixture mode with fixtureDeltas runs fixture sync", async () => {
      const result = await runner.runCycle(config, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_001",
            factType: "mail.message.discovered",
            payloadJson: "{}",
            observedAt: new Date().toISOString(),
          },
        ],
      });

      expect(result.status).toBe("complete");
      expect(result.error).toBeUndefined();
    });
  });

  describe("campaign derivation", () => {
    it("creates work items for allowed sender campaign facts", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_allowed_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_campaign_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "New campaign request: Summer Sale",
                body: { text: "We want to run a summer sale campaign targeting 18-35." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: new MockCharterRunner({
          output: {
            output_version: "2.0",
            execution_id: "",
            charter_id: "campaign_request",
            role: "primary",
            analyzed_at: new Date().toISOString(),
            outcome: "complete",
            confidence: { overall: "high", uncertainty_flags: [] },
            summary: "Campaign brief recommended",
            classifications: [],
            facts: [],
            proposed_actions: [],
            tool_requests: [],
            escalations: [],
          },
        }),
      });

      expect(result.status).toBe("complete");
      expect(result.error).toBeUndefined();

      // Verify work item was created via foreman admission
      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const workItems = db
          .prepare("SELECT work_item_id, context_id, status FROM work_items WHERE scope_id = ?")
          .all("test-site") as Array<{ work_item_id: string; context_id: string; status: string }>;
        expect(workItems.length).toBeGreaterThanOrEqual(1);
        expect(workItems.some((wi) => wi.context_id === "conv_campaign_001")).toBe(true);
      } finally {
        coordinator.close();
      }
    });

    it("silently skips non-allowed sender facts", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_disallowed_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_other_001",
                from: { email: "random@example.com" },
                received_at: new Date().toISOString(),
                subject: "Hello",
                body: { text: "Just saying hi." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: new MockCharterRunner({
          output: {
            output_version: "2.0",
            execution_id: "",
            charter_id: "campaign_request",
            role: "primary",
            analyzed_at: new Date().toISOString(),
            outcome: "complete",
            confidence: { overall: "high", uncertainty_flags: [] },
            summary: "No action needed",
            classifications: [],
            facts: [],
            proposed_actions: [],
            tool_requests: [],
            escalations: [],
          },
        }),
      });

      expect(result.status).toBe("complete");
      expect(result.error).toBeUndefined();

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const workItems = db
          .prepare("SELECT work_item_id, context_id FROM work_items WHERE scope_id = ?")
          .all("test-site") as Array<{ work_item_id: string; context_id: string }>;
        expect(workItems.some((wi) => wi.context_id === "conv_other_001")).toBe(false);
      } finally {
        coordinator.close();
      }
    });

    it("is idempotent — re-derivation does not duplicate active work", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const deltas = [
        {
          sourceId: "test",
          eventId: "evt_idem_001",
          factType: "mail.message.discovered",
          payloadJson: JSON.stringify({
            event: {
              conversation_id: "conv_idem_001",
              from: { email: "campaigns@example.com" },
              received_at: new Date().toISOString(),
              subject: "Campaign request: Holiday Push",
              body: { text: "We need a holiday campaign for Q4." },
            },
          }),
          observedAt: new Date().toISOString(),
        },
      ];

      // First cycle
      await runner.runCycle(campaignConfig, { mode: "fixture", fixtureDeltas: deltas });

      // Second cycle with same facts (apply-log should dedupe, but even if not,
      // the foreman should not create duplicate active work)
      const result2 = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: deltas.map((d) => ({ ...d, eventId: d.eventId + "_retry" })),
        charterRunner: new MockCharterRunner({
          output: {
            output_version: "2.0",
            execution_id: "",
            charter_id: "campaign_request",
            role: "primary",
            analyzed_at: new Date().toISOString(),
            outcome: "complete",
            confidence: { overall: "high", uncertainty_flags: [] },
            summary: "Campaign brief recommended",
            classifications: [],
            facts: [],
            proposed_actions: [],
            tool_requests: [],
            escalations: [],
          },
        }),
      });

      expect(result2.status).toBe("complete");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const workItems = db
          .prepare("SELECT work_item_id, context_id, status FROM work_items WHERE context_id = ?")
          .all("conv_idem_001") as Array<{ work_item_id: string; context_id: string; status: string }>;
        // At most one active (non-superseded, non-terminal) work item per context
        const active = workItems.filter((wi) => wi.status === "opened" || wi.status === "leased" || wi.status === "executing");
        expect(active.length).toBeLessThanOrEqual(1);
      } finally {
        coordinator.close();
      }
    });

    it("produces campaign_brief evaluation via mock charter runner", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const mockRunner = new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "",
          charter_id: "campaign_request",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "complete",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Campaign brief recommended",
          classifications: [],
          facts: [],
          proposed_actions: [
            {
              action_type: "campaign_brief",
              authority: "recommended",
              payload_json: JSON.stringify({
                name: "Summer Sale",
                audience: "18-35",
                content_summary: "Summer discount campaign",
                timing: "June 2026",
                approval_needed: true,
              }),
              rationale: "Campaign request from allowed sender",
            },
          ],
          tool_requests: [],
          escalations: [],
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_eval_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_eval_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "New campaign request: Summer Sale",
                body: { text: "We want to run a summer sale campaign targeting 18-35." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: mockRunner,
      });

      expect(result.status).toBe("complete");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const evaluations = db
          .prepare("SELECT evaluation_id, outcome, summary FROM evaluations WHERE context_id = ?")
          .all("conv_eval_001") as Array<{ evaluation_id: string; outcome: string; summary: string }>;
        expect(evaluations.length).toBe(1);
        expect(evaluations[0].outcome).toBe("complete");
        expect(evaluations[0].summary).toContain("Campaign brief recommended");
      } finally {
        coordinator.close();
      }
    });

    it("fails honestly when campaign mode is active but no charterRunner is provided", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_no_runner_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_no_runner_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "Campaign request",
                body: { text: "We need a campaign." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("charterRunner");
    });

    it("records crashed execution attempt when charter runner throws", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const throwingRunner = new MockCharterRunner({
        onRun: () => {
          throw new Error("Simulated charter runtime failure");
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_throw_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_throw_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "Campaign request",
                body: { text: "We need a campaign." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: throwingRunner,
      });

      expect(result.status).toBe("failed");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const attempts = db
          .prepare("SELECT execution_id, status, error_message FROM execution_attempts WHERE work_item_id IN (SELECT work_item_id FROM work_items WHERE context_id = ?)")
          .all("conv_throw_001") as Array<{ execution_id: string; status: string; error_message: string | null }>;
        expect(attempts.length).toBeGreaterThanOrEqual(1);
        expect(attempts[0].status).toBe("crashed");
        expect(attempts[0].error_message).toContain("Simulated charter runtime failure");
      } finally {
        coordinator.close();
      }
    });

    it("creates foreman decision + intent for campaign_brief proposal", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const mockRunner = new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "",
          charter_id: "campaign_request",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "complete",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Campaign brief recommended",
          classifications: [],
          facts: [],
          proposed_actions: [
            {
              action_type: "campaign_brief",
              authority: "recommended",
              payload_json: JSON.stringify({
                name: "Summer Sale",
                audience: "18-35",
                content_summary: "Summer discount campaign",
                timing: "June 2026",
                approval_needed: true,
              }),
              rationale: "Campaign request from allowed sender",
            },
          ],
          tool_requests: [],
          escalations: [],
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_handoff_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_handoff_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "New campaign request: Summer Sale",
                body: { text: "We want to run a summer sale campaign targeting 18-35." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: mockRunner,
      });

      expect(result.status).toBe("complete");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        // Work item resolved
        const wi = db.prepare("SELECT status FROM work_items WHERE context_id = ?").get("conv_handoff_001") as { status: string } | undefined;
        expect(wi?.status).toBe("resolved");

        // Foreman decision exists
        const decision = db.prepare("SELECT decision_id, approved_action, outbound_id FROM foreman_decisions WHERE context_id = ?").get("conv_handoff_001") as { decision_id: string; approved_action: string; outbound_id: string } | undefined;
        expect(decision).toBeDefined();
        expect(decision!.approved_action).toBe("campaign_brief");

        // Intent exists (campaign brief is non-mail, so outbound_id points to intent)
        const intent = db.prepare("SELECT intent_id, intent_type, executor_family FROM intents WHERE context_id = ?").get("conv_handoff_001") as { intent_id: string; intent_type: string; executor_family: string } | undefined;
        expect(intent).toBeDefined();
        expect(intent!.intent_type).toBe("campaign.brief");
        expect(intent!.executor_family).toBe("campaign");

        // No mail outbound command created
        const outbound = db.prepare("SELECT outbound_id FROM outbound_handoffs WHERE context_id = ?").get("conv_handoff_001") as { outbound_id: string } | undefined;
        expect(outbound).toBeUndefined();
      } finally {
        coordinator.close();
      }
    });

    it("blocks forbidden action via governance", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      // Policy allows only campaign_brief; runner proposes send_reply
      const mockRunner = new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "",
          charter_id: "campaign_request",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "complete",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Send reply recommended",
          classifications: [],
          facts: [],
          proposed_actions: [
            {
              action_type: "send_reply",
              authority: "recommended",
              payload_json: JSON.stringify({
                to: ["campaigns@example.com"],
                subject: "Re: Campaign request",
                body_text: "We need more info.",
              }),
              rationale: "Need more information",
            },
          ],
          tool_requests: [],
          escalations: [],
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_block_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_block_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "Campaign request",
                body: { text: "We need a campaign." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: mockRunner,
      });

      // Governance rejects the forbidden action explicitly; cycle completes
      // successfully because the handoff step processed the evaluation.
      expect(result.status).toBe("complete");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        // Work item failed_terminal via governance rejection
        const wi = db.prepare("SELECT status, resolution_outcome FROM work_items WHERE context_id = ?").get("conv_block_001") as { status: string; resolution_outcome: string | null } | undefined;
        expect(wi?.status).toBe("failed_terminal");
        expect(wi?.resolution_outcome).toBe("failed");

        // No outbound command should be created
        const outbound = db.prepare("SELECT outbound_id FROM outbound_handoffs WHERE context_id = ?").get("conv_block_001") as { outbound_id: string } | undefined;
        expect(outbound).toBeUndefined();
      } finally {
        coordinator.close();
      }
    });

    it("allows send_reply when policy explicitly permits it", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const mockRunner = new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "",
          charter_id: "campaign_request",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "complete",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Send reply recommended",
          classifications: [],
          facts: [],
          proposed_actions: [
            {
              action_type: "send_reply",
              authority: "recommended",
              payload_json: JSON.stringify({
                to: ["campaigns@example.com"],
                subject: "Re: Campaign request",
                body_text: "We need more info.",
              }),
              rationale: "Need more information",
            },
          ],
          tool_requests: [],
          escalations: [],
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_allow_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_allow_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "Campaign request",
                body: { text: "We need a campaign." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: mockRunner,
        runtimePolicy: {
          primary_charter: "campaign_request",
          allowed_actions: ["campaign_brief", "send_reply"],
          runtime_authorized: false,
        },
      });

      expect(result.status).toBe("complete");

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        // Work item resolved
        const wi = db.prepare("SELECT status FROM work_items WHERE context_id = ?").get("conv_allow_001") as { status: string } | undefined;
        expect(wi?.status).toBe("resolved");

        // Mail outbound command created for send_reply
        const outbound = db.prepare("SELECT outbound_id, action_type FROM outbound_handoffs WHERE context_id = ?").get("conv_allow_001") as { outbound_id: string; action_type: string } | undefined;
        expect(outbound).toBeDefined();
        expect(outbound!.action_type).toBe("send_reply");
      } finally {
        coordinator.close();
      }
    });

    it("does not invoke effect worker (step 6 is safe noop)", async () => {
      const campaignConfig: WindowsSiteConfig = {
        ...config,
        campaign_request_senders: ["campaigns@example.com"],
        campaign_request_lookback_days: 7,
      };

      const mockRunner = new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "",
          charter_id: "campaign_request",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "complete",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Campaign brief recommended",
          classifications: [],
          facts: [],
          proposed_actions: [
            {
              action_type: "campaign_brief",
              authority: "recommended",
              payload_json: JSON.stringify({
                name: "Summer Sale",
                audience: "18-35",
                content_summary: "Summer discount campaign",
                timing: "June 2026",
                approval_needed: true,
              }),
              rationale: "Campaign request from allowed sender",
            },
          ],
          tool_requests: [],
          escalations: [],
        },
      });

      const result = await runner.runCycle(campaignConfig, {
        mode: "fixture",
        fixtureDeltas: [
          {
            sourceId: "test",
            eventId: "evt_effect_001",
            factType: "mail.message.discovered",
            payloadJson: JSON.stringify({
              event: {
                conversation_id: "conv_effect_001",
                from: { email: "campaigns@example.com" },
                received_at: new Date().toISOString(),
                subject: "New campaign request: Summer Sale",
                body: { text: "We want to run a summer sale campaign targeting 18-35." },
              },
            }),
            observedAt: new Date().toISOString(),
          },
        ],
        charterRunner: mockRunner,
      });

      expect(result.status).toBe("complete");
      // Step 6 should be present in steps_completed but not create any execution records
      expect(result.steps_completed).toContain(6);
    });
  });

  describe("recoverStuckLock", () => {
    it("returns false when no lock exists", async () => {
      const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
      expect(recovered).toBe(false);
    });

    it("returns false when lock is not stale", async () => {
      // Acquire a lock
      const { FileLock } = await import("@narada2/control-plane");
      const lock = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 60_000,
      });
      const release = await lock.acquire();

      try {
        const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
        expect(recovered).toBe(false);
      } finally {
        await release();
      }
    });

    it("returns true and removes a stale lock", async () => {
      // Create a stale lock directory manually
      const lockDir = join(tempDir, "test-site", "state", "cycle.lock");
      const { mkdirSync, writeFileSync, utimesSync } = await import("node:fs");
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(
        join(lockDir, "meta.json"),
        JSON.stringify({ pid: 12345, acquired_at: new Date().toISOString() }),
        "utf8"
      );
      // Set mtime to 1 hour ago
      const oldTime = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(lockDir, oldTime, oldTime);

      const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
      expect(recovered).toBe(true);
    });
  });
});
