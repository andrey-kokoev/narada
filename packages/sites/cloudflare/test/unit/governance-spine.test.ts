import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import {
  createSyncStepHandler,
  createDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createHandoffStepHandler,
  fixtureEvaluate,
  type FixtureSourceDelta,
} from "../../src/cycle-step.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createEnv(coordinator: ReturnType<typeof createCoordinator>["coordinator"]) {
  return { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };
}

const sampleDeltas: FixtureSourceDelta[] = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
  {
    sourceId: "graph-mail",
    eventId: "evt-002",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-2", subject: "World" }),
    observedAt: "2024-01-01T00:01:00Z",
  },
];

describe("Governance Spine (Task 347)", () => {
  describe("fixture evaluator", () => {
    it("proposes action when facts are present", () => {
      const result = fixtureEvaluate({
        workItemId: "wi-1",
        contextId: "ctx-1",
        scopeId: "test",
        facts: [
          {
            factId: "f-1",
            sourceId: "src",
            factType: "test.fact",
            payloadJson: "{}",
            observedAt: "2024-01-01T00:00:00Z",
            admitted: true,
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      });

      expect(result.outcome).toBe("propose_action");
      expect(result.charterId).toBe("fixture-charter");
      expect(result.proposedAction).toBe("send_reply");
      expect(result.summary).toContain("wi-1");
    });

    it("returns no_action when no facts are present", () => {
      const result = fixtureEvaluate({
        workItemId: "wi-1",
        contextId: "ctx-1",
        scopeId: "test",
        facts: [],
      });

      expect(result.outcome).toBe("no_action");
      expect(result.proposedAction).toBeUndefined();
    });

    it("does not execute effects", () => {
      // fixtureEvaluate is pure — calling it should not mutate any state
      const input = {
        workItemId: "wi-1",
        contextId: "ctx-1",
        scopeId: "test",
        facts: [],
      };
      const r1 = fixtureEvaluate(input);
      const r2 = fixtureEvaluate(input);
      expect(r1).toEqual(r2);
      expect(r1).not.toBe(r2); // new object each time
    });
  });

  describe("step 3 — derive_work", () => {
    it("creates context and work item from unadmitted facts", async () => {
      const { coordinator } = createCoordinator();

      // Seed facts via step 2
      const syncHandler = createSyncStepHandler(sampleDeltas);
      await syncHandler(createEnv(coordinator), () => true);
      expect(coordinator.getFactCount()).toBe(2);

      // Step 3 derives work
      const deriveHandler = createDeriveWorkStepHandler();
      const result = await deriveHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("completed");
      expect(result.recordsWritten).toBeGreaterThanOrEqual(2); // 1 context + 1 work item
      expect(result.residuals).toContain("derived_1_contexts");
      expect(result.residuals).toContain("opened_1_work_items");

      expect(coordinator.getContextRecordCount()).toBe(1);
      expect(coordinator.getWorkItemCount()).toBe(1);

      // Facts should be marked admitted
      const facts = coordinator.getUnadmittedFacts();
      expect(facts.length).toBe(0);
    });

    it("returns skipped when no unadmitted facts exist", async () => {
      const { coordinator } = createCoordinator();
      const deriveHandler = createDeriveWorkStepHandler();
      const result = await deriveHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("skipped");
      expect(result.residuals).toContain("no_unadmitted_facts");
      expect(coordinator.getContextRecordCount()).toBe(0);
    });
  });

  describe("step 4 — evaluate", () => {
    it("creates evaluation records for open work items", async () => {
      const { coordinator } = createCoordinator();

      // Admit facts and derive work
      await createSyncStepHandler(sampleDeltas)(createEnv(coordinator), () => true);
      await createDeriveWorkStepHandler()(createEnv(coordinator), () => true);
      expect(coordinator.getWorkItemCount()).toBe(1);

      // Step 4 evaluates
      const evalHandler = createEvaluateStepHandler();
      const result = await evalHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("completed");
      expect(result.recordsWritten).toBe(1);
      expect(result.residuals).toContain("evaluated_1_work_items");
      expect(coordinator.getEvaluationCount()).toBe(1);
    });

    it("returns skipped when no open work items exist", async () => {
      const { coordinator } = createCoordinator();
      const evalHandler = createEvaluateStepHandler();
      const result = await evalHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("skipped");
      expect(result.residuals).toContain("no_open_work_items");
      expect(coordinator.getEvaluationCount()).toBe(0);
    });
  });

  describe("step 5 — handoff", () => {
    it("creates decisions and outbound commands for proposed actions", async () => {
      const { coordinator } = createCoordinator();

      // Run steps 2→4
      await createSyncStepHandler(sampleDeltas)(createEnv(coordinator), () => true);
      await createDeriveWorkStepHandler()(createEnv(coordinator), () => true);
      await createEvaluateStepHandler()(createEnv(coordinator), () => true);
      expect(coordinator.getEvaluationCount()).toBe(1);

      // Step 5 handoff
      const handoffHandler = createHandoffStepHandler();
      const result = await handoffHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("completed");
      expect(result.recordsWritten).toBeGreaterThanOrEqual(2); // 1 decision + 1 outbound
      expect(result.residuals).toContain("decided_1_evaluations");
      expect(result.residuals).toContain("created_1_outbound_commands");
      expect(coordinator.getDecisionCount()).toBe(1);
      expect(coordinator.getOutboundCommandCount()).toBe(1);
    });

    it("returns skipped when no pending evaluations exist", async () => {
      const { coordinator } = createCoordinator();
      const handoffHandler = createHandoffStepHandler();
      const result = await handoffHandler(createEnv(coordinator), () => true);

      expect(result.status).toBe("skipped");
      expect(result.residuals).toContain("no_pending_evaluations");
      expect(coordinator.getDecisionCount()).toBe(0);
    });
  });

  describe("IAS boundary preservation", () => {
    it("evaluation is separate from decision", async () => {
      const { coordinator } = createCoordinator();

      // Run full pipeline through evaluation
      await createSyncStepHandler(sampleDeltas)(createEnv(coordinator), () => true);
      await createDeriveWorkStepHandler()(createEnv(coordinator), () => true);
      await createEvaluateStepHandler()(createEnv(coordinator), () => true);

      // Evaluations exist but no decisions yet
      expect(coordinator.getEvaluationCount()).toBe(1);
      expect(coordinator.getDecisionCount()).toBe(0);

      // Handoff creates decisions separately
      await createHandoffStepHandler()(createEnv(coordinator), () => true);
      expect(coordinator.getDecisionCount()).toBe(1);
    });

    it("intent/handoff is separate from decision", async () => {
      const { coordinator } = createCoordinator();

      // Run full pipeline
      await createSyncStepHandler(sampleDeltas)(createEnv(coordinator), () => true);
      await createDeriveWorkStepHandler()(createEnv(coordinator), () => true);
      await createEvaluateStepHandler()(createEnv(coordinator), () => true);
      await createHandoffStepHandler()(createEnv(coordinator), () => true);

      // All three boundary types exist
      expect(coordinator.getEvaluationCount()).toBe(1);
      expect(coordinator.getDecisionCount()).toBe(1);
      expect(coordinator.getOutboundCommandCount()).toBe(1);
    });
  });

  describe("end-to-end governance spine", () => {
    it("runs steps 2→5 in sequence producing durable records", async () => {
      const { coordinator } = createCoordinator();
      const env = createEnv(coordinator);

      const r2 = await createSyncStepHandler(sampleDeltas)(env, () => true);
      const r3 = await createDeriveWorkStepHandler()(env, () => true);
      const r4 = await createEvaluateStepHandler()(env, () => true);
      const r5 = await createHandoffStepHandler()(env, () => true);

      expect(r2.status).toBe("completed");
      expect(r3.status).toBe("completed");
      expect(r4.status).toBe("completed");
      expect(r5.status).toBe("completed");

      expect(coordinator.getFactCount()).toBe(2);
      expect(coordinator.getContextRecordCount()).toBe(1);
      expect(coordinator.getWorkItemCount()).toBe(1);
      expect(coordinator.getEvaluationCount()).toBe(1);
      expect(coordinator.getDecisionCount()).toBe(1);
      expect(coordinator.getOutboundCommandCount()).toBe(1);
    });
  });
});
