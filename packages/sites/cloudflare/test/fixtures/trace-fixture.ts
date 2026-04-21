/**
 * Trace fixture factory.
 *
 * Produces canonical health record + cycle trace pairs for testing
 * observation endpoints and status responses.
 */

import type { SiteHealthRecord, CycleTraceRecord } from "../../src/types.js";

export interface TraceFixture {
  health: SiteHealthRecord;
  trace: CycleTraceRecord;
}

/** Complete Cycle that finished successfully. */
export function createCompleteTrace(cycleId = "cycle-complete-001", siteId = "help"): TraceFixture {
  const now = new Date().toISOString();
  const health: SiteHealthRecord = {
    status: "healthy",
    lastCycleAt: now,
    lastCycleDurationMs: 12_000,
    consecutiveFailures: 0,
    pendingWorkItems: 2,
    locked: false,
    lockedByCycleId: null,
    message: `Cycle ${cycleId} completed steps [1, 2, 3, 4, 5, 6, 7, 8]`,
    updatedAt: now,
  };
  const trace: CycleTraceRecord = {
    cycleId,
    startedAt: now,
    finishedAt: now,
    status: "complete",
    stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8],
    error: null,
    traceKey: `${siteId}/traces/${cycleId}/trace.json`,
  };
  return { health, trace };
}

/** Partial Cycle that aborted mid-way due to timeout. */
export function createPartialTrace(cycleId = "cycle-partial-001", siteId = "help"): TraceFixture {
  const now = new Date().toISOString();
  const health: SiteHealthRecord = {
    status: "degraded",
    lastCycleAt: now,
    lastCycleDurationMs: 28_000,
    consecutiveFailures: 1,
    pendingWorkItems: 5,
    locked: false,
    lockedByCycleId: null,
    message: `Cycle ${cycleId} completed steps [1, 2, 3]`,
    updatedAt: now,
  };
  const trace: CycleTraceRecord = {
    cycleId,
    startedAt: now,
    finishedAt: now,
    status: "partial",
    stepsCompleted: [1, 2, 3],
    error: null,
    traceKey: `${siteId}/traces/${cycleId}/trace.json`,
  };
  return { health, trace };
}

/** Failed Cycle that encountered an exception. */
export function createFailedTrace(cycleId = "cycle-failed-001", siteId = "help", error = "Graph API unreachable"): TraceFixture {
  const now = new Date().toISOString();
  const health: SiteHealthRecord = {
    status: "critical",
    lastCycleAt: now,
    lastCycleDurationMs: 5_000,
    consecutiveFailures: 3,
    pendingWorkItems: 0,
    locked: false,
    lockedByCycleId: null,
    message: `Cycle ${cycleId} failed: ${error}`,
    updatedAt: now,
  };
  const trace: CycleTraceRecord = {
    cycleId,
    startedAt: now,
    finishedAt: now,
    status: "failed",
    stepsCompleted: [1, 2],
    error,
    traceKey: `${siteId}/traces/${cycleId}/trace.json`,
  };
  return { health, trace };
}

/** Stuck Cycle that acquired the lock but never released it. */
export function createStuckTrace(cycleId = "cycle-stuck-001", siteId = "help"): TraceFixture {
  const now = new Date().toISOString();
  const health: SiteHealthRecord = {
    status: "critical",
    lastCycleAt: now,
    lastCycleDurationMs: 60_000,
    consecutiveFailures: 2,
    pendingWorkItems: 0,
    locked: true,
    lockedByCycleId: cycleId,
    message: `Cycle ${cycleId} stuck: lock held beyond TTL`,
    updatedAt: now,
  };
  const trace: CycleTraceRecord = {
    cycleId,
    startedAt: now,
    finishedAt: null,
    status: "failed",
    stepsCompleted: [1, 2, 3, 4],
    error: "Stuck cycle: lock not released before TTL expiry",
    traceKey: `${siteId}/traces/${cycleId}/trace.json`,
  };
  return { health, trace };
}
