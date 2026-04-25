/**
 * Scheduler Types
 *
 * Spec: .ai/do-not-open/tasks/20260414-015-impl-scheduler-and-leases.md
 * Spec: .ai/do-not-open/tasks/20260414-005-assignment-agent-a-scheduler-and-leases.md
 */

import type { WorkItem, WorkItemLease, ExecutionAttempt } from "../coordinator/types.js";

export interface LeaseAcquisitionResult {
  success: boolean;
  lease?: WorkItemLease;
  error?: string;
}

export interface SchedulerOptions {
  leaseDurationMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  runnerId: string;
}

export interface Scheduler {
  scanForRunnableWork(scopeId?: string, limit?: number): WorkItem[];
  acquireLease(workItemId: string, runnerId?: string): LeaseAcquisitionResult;
  renewLease(leaseId: string, expiresAt: string): void;
  releaseLease(leaseId: string, reason: WorkItemLease["release_reason"]): void;
  startExecution(workItemId: string, revisionId: string, envelopeJson: string): ExecutionAttempt;
  completeExecution(executionId: string, outcomeJson: string): void;
  failExecution(executionId: string, errorMessage: string, retryable: boolean): void;
  recoverStaleLeases(now?: string): { leaseId: string; workItemId: string }[];
  calculateBackoff(retryCount: number): number;
  isQuiescent(scopeId?: string): boolean;
}
