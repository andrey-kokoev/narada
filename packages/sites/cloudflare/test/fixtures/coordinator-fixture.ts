/**
 * Coordinator fixture factories.
 *
 * Provides both:
 * - A lightweight in-memory mock for unit tests (fast, no SQLite)
 * - A real SqlStorage-backed mock for integration tests (schema-accurate)
 */

import { vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "./mock-sqlite.js";
import type { CycleCoordinator, SiteCoordinator } from "../../src/coordinator.js";
import type { SiteHealthRecord, CycleTraceRecord, RecoveryTraceRecord, FactRecord } from "../../src/types.js";

/** Lightweight in-memory mock CycleCoordinator for fast unit tests. */
export function createMockCycleCoordinator(
  overrides?: Partial<{
    health: SiteHealthRecord;
    trace: CycleTraceRecord | null;
  }>,
): CycleCoordinator {
  const lockStore = new Map<string, { cycleId: string; expiresAt: number; acquiredAt: number }>();
  let health: SiteHealthRecord | null = overrides?.health ?? null;
  let trace: CycleTraceRecord | null = overrides?.trace ?? null;
  let recoveryTrace: RecoveryTraceRecord | null = null;

  const cooldownStore = new Map<string, number>();
  const factStore = new Map<string, FactRecord>();
  const applyLog = new Set<string>();
  const cursorStore = new Map<string, string>();
  const workItemStore = new Map<string, { workItemId: string; contextId: string; scopeId: string; status: string }>();
  const evaluationStore = new Map<string, { evaluationId: string; workItemId: string }>();

  const makeCooldownKey = (siteId: string, scopeId: string, channel: string, healthStatus: string) =>
    `${siteId}|${scopeId}|${channel}|${healthStatus}`;

  return {
    acquireLock: vi.fn((cycleId: string, ttlMs: number) => {
      const now = Date.now();
      const expiresAt = now + ttlMs;
      const existing = lockStore.get("site_lock");
      if (existing) {
        if (existing.cycleId === cycleId) {
          lockStore.set("site_lock", { cycleId, expiresAt, acquiredAt: existing.acquiredAt });
          return { acquired: true };
        }
        if (existing.expiresAt > now) {
          return { acquired: false, previousCycleId: existing.cycleId };
        }
        // Expired — recover
        const stuckDurationMs = now - existing.acquiredAt;
        lockStore.delete("site_lock");
        lockStore.set("site_lock", { cycleId, expiresAt, acquiredAt: now });
        return { acquired: true, previousCycleId: existing.cycleId, recovered: true, stuckDurationMs };
      }
      lockStore.set("site_lock", { cycleId, expiresAt, acquiredAt: now });
      return { acquired: true };
    }),
    releaseLock: vi.fn((cycleId: string) => {
      const existing = lockStore.get("site_lock");
      if (existing && existing.cycleId === cycleId) lockStore.delete("site_lock");
    }),
    getHealth: vi.fn(() => health ?? {
      status: "unknown", lastCycleAt: null, lastCycleDurationMs: null,
      consecutiveFailures: 0, pendingWorkItems: 0, locked: false, lockedByCycleId: null,
      message: null, updatedAt: new Date(0).toISOString(),
    }),
    setHealth: vi.fn((h) => { health = h; }),
    getLastCycleTrace: vi.fn(() => trace),
    setLastCycleTrace: vi.fn((t) => { trace = t; }),
    recordRecoveryTrace: vi.fn((t) => { recoveryTrace = t; }),
    getLastRecoveryTrace: vi.fn(() => recoveryTrace),
    isCooldownActive: vi.fn((siteId: string, scopeId: string, channel: string, healthStatus: string, cooldownMs: number) => {
      const lastSent = cooldownStore.get(makeCooldownKey(siteId, scopeId, channel, healthStatus));
      if (!lastSent) return false;
      return Date.now() - lastSent < cooldownMs;
    }),
    recordSent: vi.fn((siteId: string, scopeId: string, channel: string, healthStatus: string) => {
      cooldownStore.set(makeCooldownKey(siteId, scopeId, channel, healthStatus), Date.now());
    }),

    // Task 346: fact / cursor / apply-log mocks
    insertFact: vi.fn((fact) => {
      const now = new Date().toISOString();
      factStore.set(fact.factId, { ...fact, createdAt: now } as FactRecord);
    }),
    getFactById: vi.fn((factId: string) => factStore.get(factId) ?? null),
    getFactCount: vi.fn(() => factStore.size),
    getUnadmittedFacts: vi.fn(() => Array.from(factStore.values()).filter((f) => !f.admitted)),
    markFactAdmitted: vi.fn((factId: string) => {
      const f = factStore.get(factId);
      if (f) factStore.set(factId, { ...f, admitted: true });
    }),
    isEventApplied: vi.fn((eventId: string) => applyLog.has(eventId)),
    markEventApplied: vi.fn((eventId: string) => { applyLog.add(eventId); }),
    getAppliedEventCount: vi.fn(() => applyLog.size),
    setCursor: vi.fn((sourceId: string, cursorValue: string) => { cursorStore.set(sourceId, cursorValue); }),
    getCursor: vi.fn((sourceId: string) => cursorStore.get(sourceId) ?? null),

    // Task 347: governance mocks
    insertContextRecord: vi.fn(() => {}),
    insertWorkItem: vi.fn((workItemId: string, contextId: string, scopeId: string, status: string) => {
      workItemStore.set(workItemId, { workItemId, contextId, scopeId, status });
    }),
    getOpenWorkItems: vi.fn(() =>
      Array.from(workItemStore.values())
        .filter((wi) => wi.status === 'opened' && !evaluationStore.has(wi.workItemId))
    ),
    insertEvaluation: vi.fn((evaluationId: string, workItemId: string) => {
      evaluationStore.set(workItemId, { evaluationId, workItemId });
    }),
    getPendingEvaluations: vi.fn(() => []),
    insertDecision: vi.fn(() => {}),
    insertOutboundCommand: vi.fn((_outboundId: string, _contextId: string, _scopeId: string, _actionType: string, _status: string, _payloadJson?: string | null, _internetMessageId?: string | null) => {}),
    getContextRecordCount: vi.fn(() => 0),
    getWorkItemCount: vi.fn(() => workItemStore.size),
    getEvaluationCount: vi.fn(() => evaluationStore.size),
    getDecisionCount: vi.fn(() => 0),
    getOutboundCommandCount: vi.fn(() => 0),

    // Task 348: reconciliation mocks
    getPendingOutboundCommands: vi.fn(() => [] as { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[]),
    getSubmittedOutboundCommands: vi.fn(() => [] as { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[]),
    updateOutboundCommandStatus: vi.fn(() => {}),
    insertFixtureObservation: vi.fn(() => {}),
    getFixtureObservations: vi.fn(() => []),

    // Task 359: effect worker mocks
    getApprovedOutboundCommands: vi.fn(() => [] as { outboundId: string; contextId: string; scopeId: string; actionType: string; status: string; payloadJson: string | null; internetMessageId: string | null }[]),
    getExecutionAttemptsForOutbound: vi.fn(() => []),
    getLatestExecutionAttempt: vi.fn(() => null),
    countRetryableAttempts: vi.fn(() => 0),
    insertExecutionAttempt: vi.fn(() => {}),
    updateExecutionAttemptStatus: vi.fn(() => {}),
  };
}

/** Async SiteCoordinator stub mock (for handler integration tests). */
export function createMockSiteCoordinator(
  overrides?: Partial<{
    health: SiteHealthRecord;
    trace: CycleTraceRecord | null;
  }>,
): SiteCoordinator {
  const defaultHealth: SiteHealthRecord = {
    status: "healthy",
    lastCycleAt: "2026-04-20T12:00:00Z",
    lastCycleDurationMs: 15_000,
    consecutiveFailures: 0,
    pendingWorkItems: 0,
    locked: false,
    lockedByCycleId: null,
    message: null,
    updatedAt: "2026-04-20T12:00:00Z",
  };

  const defaultTrace: CycleTraceRecord = {
    cycleId: "cycle-123",
    startedAt: "2026-04-20T12:00:00Z",
    finishedAt: "2026-04-20T12:00:15Z",
    status: "complete",
    stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    error: null,
    traceKey: "help/traces/cycle-123",
  };

  return {
    getHealth: vi.fn(() =>
      Promise.resolve({ ...defaultHealth, ...(overrides?.health ?? {}) }),
    ),
    getLastCycleTrace: vi.fn(() =>
      Promise.resolve(
        overrides?.trace === null
          ? null
          : { ...defaultTrace, ...(overrides?.trace ?? {}) },
      ),
    ),
  };
}

/** Real SQLite-backed NaradaSiteCoordinator for schema-accurate integration tests. */
export function createRealCoordinator(db?: Database.Database): NaradaSiteCoordinator {
  const database = db ?? new Database(":memory:");
  return new NaradaSiteCoordinator(createMockState(database));
}
