/**
 * SQLite-backed Scheduler
 *
 * Implements runnable work scanning, lease acquisition, execution lifecycle,
 * retry/backoff, and stale lease recovery.
 *
 * Spec: .ai/tasks/20260414-015-impl-scheduler-and-leases.md
 * Spec: .ai/tasks/20260414-005-assignment-agent-a-scheduler-and-leases.md
 */

import { randomUUID } from "node:crypto";
import type { Scheduler, SchedulerOptions, LeaseAcquisitionResult } from "./types.js";
import type { CoordinatorStore, WorkItem, WorkItemLease, ExecutionAttempt } from "../coordinator/types.js";

const DEFAULT_OPTIONS: SchedulerOptions = {
  leaseDurationMs: 60_000,
  maxRetries: 3,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  runnerId: "default-runner",
};

export class SqliteScheduler implements Scheduler {
  private readonly opts: SchedulerOptions;

  constructor(
    private readonly store: CoordinatorStore,
    options?: Partial<SchedulerOptions>,
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  scanForRunnableWork(mailboxId?: string, limit = 10): WorkItem[] {
    // Recover stale leases first so they become runnable again
    this.recoverStaleLeases();

    const now = new Date().toISOString();

    // Build runnable set:
    // - status = 'opened'
    // - OR status = 'failed_retryable' AND next_retry_at <= now
    // - conversation not blocked by active leased/executing work on same conversation
    // - no active blocked_policy outbound command for same conversation (skipped in v1 for simplicity)

    let sql: string;
    let params: (string | number)[];

    if (mailboxId) {
      sql = `
        select wi.* from work_items wi
        where wi.mailbox_id = ?
          and wi.status = 'opened'
          and not exists (
            select 1 from work_items wi2
            where wi2.conversation_id = wi.conversation_id
              and wi2.status in ('leased', 'executing')
              and wi2.work_item_id != wi.work_item_id
          )
          and not exists (
            select 1 from work_items wi3
            where wi3.conversation_id = wi.conversation_id
              and wi3.status = 'superseded'
              and wi3.work_item_id = wi.work_item_id
          )
        order by wi.priority desc, wi.created_at asc
        limit ?
      `;
      params = [mailboxId, limit];
    } else {
      sql = `
        select wi.* from work_items wi
        where wi.status = 'opened'
          and not exists (
            select 1 from work_items wi2
            where wi2.conversation_id = wi.conversation_id
              and wi2.status in ('leased', 'executing')
              and wi2.work_item_id != wi.work_item_id
          )
          and not exists (
            select 1 from work_items wi3
            where wi3.conversation_id = wi.conversation_id
              and wi3.status = 'superseded'
              and wi3.work_item_id = wi.work_item_id
          )
        order by wi.priority desc, wi.created_at asc
        limit ?
      `;
      params = [limit];
    }

    const openedRows = this.store.db.prepare(sql).all(...params) as Record<string, unknown>[];

    // Also include failed_retryable items whose retry time has come
    let retrySql: string;
    let retryParams: (string | number)[];

    if (mailboxId) {
      retrySql = `
        select wi.* from work_items wi
        where wi.mailbox_id = ?
          and wi.status = 'failed_retryable'
          and (wi.next_retry_at is null or wi.next_retry_at <= ?)
          and not exists (
            select 1 from work_items wi2
            where wi2.conversation_id = wi.conversation_id
              and wi2.status in ('leased', 'executing')
              and wi2.work_item_id != wi.work_item_id
          )
        order by wi.priority desc, wi.created_at asc
        limit ?
      `;
      retryParams = [mailboxId, now, limit];
    } else {
      retrySql = `
        select wi.* from work_items wi
        where wi.status = 'failed_retryable'
          and (wi.next_retry_at is null or wi.next_retry_at <= ?)
          and not exists (
            select 1 from work_items wi2
            where wi2.conversation_id = wi.conversation_id
              and wi2.status in ('leased', 'executing')
              and wi2.work_item_id != wi.work_item_id
          )
        order by wi.priority desc, wi.created_at asc
        limit ?
      `;
      retryParams = [now, limit];
    }

    const retryRows = this.store.db.prepare(retrySql).all(...retryParams) as Record<string, unknown>[];

    // Combine and deduplicate, respecting limit
    const seen = new Set<string>();
    const combined: WorkItem[] = [];

    const mapper = (row: Record<string, unknown>): WorkItem => ({
      work_item_id: String(row.work_item_id),
      conversation_id: String(row.conversation_id),
      mailbox_id: String(row.mailbox_id),
      status: String(row.status) as WorkItem["status"],
      priority: Number(row.priority),
      opened_for_revision_id: String(row.opened_for_revision_id),
      resolved_revision_id: row.resolved_revision_id ? String(row.resolved_revision_id) : null,
      resolution_outcome: row.resolution_outcome
        ? (String(row.resolution_outcome) as WorkItem["resolution_outcome"])
        : null,
      error_message: row.error_message ? String(row.error_message) : null,
      retry_count: Number(row.retry_count ?? 0),
      next_retry_at: row.next_retry_at ? String(row.next_retry_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    });

    for (const row of [...openedRows, ...retryRows]) {
      const id = String(row.work_item_id);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(mapper(row));
        if (combined.length >= limit) break;
      }
    }

    return combined;
  }

  acquireLease(workItemId: string, runnerId?: string): LeaseAcquisitionResult {
    const id = runnerId || this.opts.runnerId;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.opts.leaseDurationMs).toISOString();
    const leaseId = `ls_${randomUUID()}`;

    try {
      this.store.db.transaction(() => {
        // Verify work item is still opened or failed_retryable
        const row = this.store.db
          .prepare(`select status from work_items where work_item_id = ?`)
          .get(workItemId) as { status: string } | undefined;

        if (!row) {
          throw new Error("Work item not found");
        }
        if (row.status !== "opened" && row.status !== "failed_retryable") {
          throw new Error(`Work item status is ${row.status}`);
        }

        // Check no active lease exists
        const activeLease = this.store.getActiveLeaseForWorkItem(workItemId);
        if (activeLease) {
          throw new Error("Work item already has an active lease");
        }

        // Insert lease and transition work item
        this.store.insertLease({
          lease_id: leaseId,
          work_item_id: workItemId,
          runner_id: id,
          acquired_at: now,
          expires_at: expiresAt,
          released_at: null,
          release_reason: null,
        });

        this.store.updateWorkItemStatus(workItemId, "leased", { updated_at: now });
      })();

      const lease = this.store.getActiveLeaseForWorkItem(workItemId);
      return { success: true, lease: lease ?? undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  renewLease(leaseId: string, expiresAt: string): void {
    this.store.updateLeaseExpiry(leaseId, expiresAt);
  }

  releaseLease(leaseId: string, reason: WorkItemLease["release_reason"]): void {
    const now = new Date().toISOString();
    this.store.releaseLease(leaseId, now, reason);
  }

  startExecution(workItemId: string, revisionId: string, envelopeJson: string): ExecutionAttempt {
    const executionId = `ex_${randomUUID()}`;
    const now = new Date().toISOString();

    this.store.db.transaction(() => {
      // Verify lease is still valid
      const lease = this.store.getActiveLeaseForWorkItem(workItemId);
      if (!lease) {
        throw new Error("No active lease for work item");
      }
      if (lease.expires_at <= now) {
        throw new Error("Lease has expired");
      }

      // Insert execution attempt
      const sessionId = `sess_${randomUUID()}`;
      const workItem = this.store.getWorkItem(workItemId);
      const conversationId = workItem?.conversation_id ?? "";

      this.store.insertAgentSession({
        session_id: sessionId,
        conversation_id: conversationId,
        started_at: now,
        ended_at: null,
        status: "active",
      });

      this.store.insertExecutionAttempt({
        execution_id: executionId,
        work_item_id: workItemId,
        revision_id: revisionId,
        session_id: sessionId,
        status: "active",
        started_at: now,
        completed_at: null,
        runtime_envelope_json: envelopeJson,
        outcome_json: null,
        error_message: null,
      });

      // Transition work item to executing
      this.store.updateWorkItemStatus(workItemId, "executing", { updated_at: now });
    })();

    const attempt = this.store.getExecutionAttempt(executionId);
    if (!attempt) {
      throw new Error("Execution attempt not found after insert");
    }
    return attempt;
  }

  completeExecution(executionId: string, outcomeJson: string): void {
    const now = new Date().toISOString();
    const attempt = this.store.getExecutionAttempt(executionId);
    if (!attempt) {
      throw new Error("Execution attempt not found");
    }

    this.store.db.transaction(() => {
      this.store.updateExecutionAttemptStatus(executionId, "succeeded", {
        completed_at: now,
        outcome_json: outcomeJson,
      });

      // Release lease
      const lease = this.store.getActiveLeaseForWorkItem(attempt.work_item_id);
      if (lease) {
        this.store.releaseLease(lease.lease_id, now, "success");
      }
    })();
  }

  failExecution(executionId: string, errorMessage: string, retryable: boolean): void {
    const now = new Date().toISOString();
    const attempt = this.store.getExecutionAttempt(executionId);
    if (!attempt) {
      throw new Error("Execution attempt not found");
    }

    const workItem = this.store.getWorkItem(attempt.work_item_id);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const newRetryCount = workItem.retry_count + 1;
    const terminal = !retryable || newRetryCount >= this.opts.maxRetries;

    this.store.db.transaction(() => {
      this.store.updateExecutionAttemptStatus(executionId, "crashed", {
        completed_at: now,
        error_message: errorMessage,
      });

      // Release lease
      const lease = this.store.getActiveLeaseForWorkItem(attempt.work_item_id);
      if (lease) {
        this.store.releaseLease(lease.lease_id, now, "crash");
      }

      if (terminal) {
        this.store.updateWorkItemStatus(attempt.work_item_id, "failed_terminal", {
          error_message: errorMessage,
          updated_at: now,
        });
      } else {
        const nextRetryAt = new Date(Date.now() + this.calculateBackoff(newRetryCount)).toISOString();
        this.store.updateWorkItemStatus(attempt.work_item_id, "failed_retryable", {
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt,
          error_message: errorMessage,
          updated_at: now,
        });
      }
    })();
  }

  recoverStaleLeases(now?: string): { leaseId: string; workItemId: string }[] {
    const t = now || new Date().toISOString();
    return this.store.recoverStaleLeases(t);
  }

  calculateBackoff(retryCount: number): number {
    const jitter = Math.floor(Math.random() * 1000);
    const delay = this.opts.baseDelayMs * Math.pow(2, retryCount) + jitter;
    return Math.min(delay, this.opts.maxDelayMs);
  }

  isQuiescent(mailboxId?: string): boolean {
    this.recoverStaleLeases();
    const now = new Date().toISOString();

    let sql: string;
    let params: (string | number)[];

    if (mailboxId) {
      sql = `
        select count(*) as c from work_items
        where mailbox_id = ?
          and (
            status in ('opened', 'leased', 'executing')
            or (status = 'failed_retryable' and (next_retry_at is null or next_retry_at <= ?))
          )
      `;
      params = [mailboxId, now];
    } else {
      sql = `
        select count(*) as c from work_items
        where status in ('opened', 'leased', 'executing')
           or (status = 'failed_retryable' and (next_retry_at is null or next_retry_at <= ?))
      `;
      params = [now];
    }

    const row = this.store.db.prepare(sql).get(...params) as { c: number };
    return row.c === 0;
  }
}
