import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "./mock-sqlite.js";

export interface SiteFixture {
  siteId: string;
  coordinator: NaradaSiteCoordinator;
  db: Database.Database;

  seedContext(contextId: string, scopeId: string, primaryCharter: string): void;
  seedWorkItem(workItemId: string, contextId: string, scopeId: string, status: string): void;
  seedEvaluation(evaluationId: string, workItemId: string, scopeId: string, charterId: string, outcome: string, summary: string): void;
  seedDecision(decisionId: string, evaluationId: string | null, contextId: string, scopeId: string, approvedAction: string, outboundId: string | null): void;
  seedOutboundCommand(outboundId: string, contextId: string, scopeId: string, actionType: string, status: string): void;

  getContextCount(): number;
  getWorkItemCount(): number;
  getEvaluationCount(): number;
  getDecisionCount(): number;
  getOutboundCommandCount(): number;

  // Operator action helpers (Task 355)
  getOperatorActionCount(): number;
  getPendingOperatorActionCount(): number;
}

export function createSiteFixture(siteId: string): SiteFixture {
  const db = new Database(":memory:");
  const coordinator = new NaradaSiteCoordinator(createMockState(db));
  return {
    siteId,
    coordinator,
    db,
    seedContext: (c, s, p) => coordinator.insertContextRecord(c, s, p),
    seedWorkItem: (w, c, s, st) => coordinator.insertWorkItem(w, c, s, st),
    seedEvaluation: (e, w, s, ch, o, sm) => coordinator.insertEvaluation(e, w, s, ch, o, sm),
    seedDecision: (d, e, c, s, a, o) => coordinator.insertDecision(d, e, c, s, a, o),
    seedOutboundCommand: (o, c, s, a, st) => coordinator.insertOutboundCommand(o, c, s, a, st),
    getContextCount: () => coordinator.getContextRecordCount(),
    getWorkItemCount: () => coordinator.getWorkItemCount(),
    getEvaluationCount: () => coordinator.getEvaluationCount(),
    getDecisionCount: () => coordinator.getDecisionCount(),
    getOutboundCommandCount: () => coordinator.getOutboundCommandCount(),
    getOperatorActionCount: () => coordinator.getPendingOperatorActionRequests().length,
    getPendingOperatorActionCount: () => coordinator.getPendingOperatorActionRequests().length,
  };
}
