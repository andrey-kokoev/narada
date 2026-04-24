/**
 * SQLite-backed Task Lifecycle Store
 *
 * Authoritative durable state for task lifecycle, assignments, reports,
 * reviews, and task number allocation. Operates on a dedicated SQLite
 * database separate from the Narada control plane.
 *
 * This store implements the authority model from Decision 547:
 * - SQLite owns lifecycle state (status, provenance, assignments)
 * - Markdown owns authored specification (goal, work, criteria)
 * - No field is independently authoritative in both stores
 */

import { Database } from "@narada2/control-plane";
import { join } from "node:path";

type Db = Database.Database;

export type TaskStatus =
  | "draft"
  | "opened"
  | "claimed"
  | "needs_continuation"
  | "in_review"
  | "closed"
  | "confirmed";

export interface TaskLifecycleRow {
  task_id: string;
  task_number: number;
  status: TaskStatus;
  governed_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  continuation_packet_json: string | null;
  updated_at: string;
}

export type AssignmentIntent = "primary" | "review" | "repair" | "takeover";

export interface TaskAssignmentRow {
  assignment_id: string;
  task_id: string;
  agent_id: string;
  claimed_at: string;
  released_at: string | null;
  release_reason: string | null;
  intent: AssignmentIntent;
}

export interface TaskReportRow {
  report_id: string;
  task_id: string;
  agent_id: string;
  summary: string;
  changed_files_json: string | null;
  verification_json: string | null;
  submitted_at: string;
}

export type ReviewVerdict = "accepted" | "rejected" | "needs_changes";

export type DispatchPacketStatus =
  | "picked_up"
  | "renewed"
  | "executing"
  | "expired"
  | "released"
  | "superseded";

export type DispatchCreatedBy = "agent_pickup" | "auto_on_claim" | "operator_override";

export interface DispatchPacketRow {
  packet_id: string;
  task_id: string;
  assignment_id: string;
  agent_id: string;
  picked_up_at: string;
  lease_expires_at: string;
  heartbeat_at: string | null;
  dispatch_status: DispatchPacketStatus;
  sequence: number;
  created_by: DispatchCreatedBy;
  /** Resolved Kimi CLI session ID for execution targeting */
  target_session_id: string | null;
  /** Advisory human-readable session title */
  target_session_title: string | null;
}

export interface TaskReviewRow {
  review_id: string;
  task_id: string;
  reviewer_agent_id: string;
  verdict: ReviewVerdict;
  findings_json: string | null;
  reviewed_at: string;
}

export interface TaskLifecycleStore {
  readonly db: Db;
  initSchema(): void;
  upsertLifecycle(row: TaskLifecycleRow): void;
  getLifecycle(taskId: string): TaskLifecycleRow | undefined;
  getLifecycleByNumber(taskNumber: number): TaskLifecycleRow | undefined;
  getAllLifecycle(): TaskLifecycleRow[];
  updateStatus(
    taskId: string,
    status: TaskStatus,
    actor: string,
    updates?: Partial<Omit<TaskLifecycleRow, "task_id" | "task_number" | "status">>,
  ): void;
  insertAssignment(assignment: TaskAssignmentRow): void;
  getActiveAssignment(taskId: string): TaskAssignmentRow | undefined;
  getAssignments(taskId: string): TaskAssignmentRow[];
  releaseAssignment(assignmentId: string, releaseReason: string): void;
  insertReport(report: TaskReportRow): void;
  listReports(taskId: string): TaskReportRow[];
  insertReview(review: TaskReviewRow): void;
  listReviews(taskId: string): TaskReviewRow[];
  insertDispatchPacket(packet: DispatchPacketRow): void;
  getActiveDispatchPacketForAssignment(assignmentId: string): DispatchPacketRow | undefined;
  getDispatchPacketsForTask(taskId: string): DispatchPacketRow[];
  getDispatchPacketsForAgent(agentId: string): DispatchPacketRow[];
  heartbeatDispatchPacket(packetId: string, extensionMinutes: number, maxLeaseMinutes: number): void;
  updateDispatchStatus(packetId: string, status: DispatchPacketStatus): void;
  allocateTaskNumber(): number;
  getLastAllocated(): number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToLifecycle(row: Record<string, unknown>): TaskLifecycleRow {
  return {
    task_id: String(row.task_id),
    task_number: Number(row.task_number),
    status: String(row.status) as TaskStatus,
    governed_by: row.governed_by ? String(row.governed_by) : null,
    closed_at: row.closed_at ? String(row.closed_at) : null,
    closed_by: row.closed_by ? String(row.closed_by) : null,
    reopened_at: row.reopened_at ? String(row.reopened_at) : null,
    reopened_by: row.reopened_by ? String(row.reopened_by) : null,
    continuation_packet_json: row.continuation_packet_json
      ? String(row.continuation_packet_json)
      : null,
    updated_at: String(row.updated_at),
  };
}

function rowToAssignment(row: Record<string, unknown>): TaskAssignmentRow {
  return {
    assignment_id: String(row.assignment_id),
    task_id: String(row.task_id),
    agent_id: String(row.agent_id),
    claimed_at: String(row.claimed_at),
    released_at: row.released_at ? String(row.released_at) : null,
    release_reason: row.release_reason ? String(row.release_reason) : null,
    intent: String(row.intent) as AssignmentIntent,
  };
}

function rowToReport(row: Record<string, unknown>): TaskReportRow {
  return {
    report_id: String(row.report_id),
    task_id: String(row.task_id),
    agent_id: String(row.agent_id),
    summary: String(row.summary),
    changed_files_json: row.changed_files_json
      ? String(row.changed_files_json)
      : null,
    verification_json: row.verification_json
      ? String(row.verification_json)
      : null,
    submitted_at: String(row.submitted_at),
  };
}

function rowToReview(row: Record<string, unknown>): TaskReviewRow {
  return {
    review_id: String(row.review_id),
    task_id: String(row.task_id),
    reviewer_agent_id: String(row.reviewer_agent_id),
    verdict: String(row.verdict) as ReviewVerdict,
    findings_json: row.findings_json ? String(row.findings_json) : null,
    reviewed_at: String(row.reviewed_at),
  };
}

function rowToDispatchPacket(row: Record<string, unknown>): DispatchPacketRow {
  return {
    packet_id: String(row.packet_id),
    task_id: String(row.task_id),
    assignment_id: String(row.assignment_id),
    agent_id: String(row.agent_id),
    picked_up_at: String(row.picked_up_at),
    lease_expires_at: String(row.lease_expires_at),
    heartbeat_at: row.heartbeat_at ? String(row.heartbeat_at) : null,
    dispatch_status: String(row.dispatch_status) as DispatchPacketStatus,
    sequence: Number(row.sequence),
    created_by: String(row.created_by) as DispatchCreatedBy,
    target_session_id: row.target_session_id ? String(row.target_session_id) : null,
    target_session_title: row.target_session_title ? String(row.target_session_title) : null,
  };
}

export interface SqliteTaskLifecycleStoreOptions {
  db: Db;
}

export function openTaskLifecycleStore(cwd: string): SqliteTaskLifecycleStore {
  const dbPath = join(cwd, ".ai", "tasks", "task-lifecycle.db");
  const db = new Database(dbPath);
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  return store;
}

export class SqliteTaskLifecycleStore implements TaskLifecycleStore {
  readonly db: Db;

  constructor(opts: SqliteTaskLifecycleStoreOptions) {
    this.db = opts.db;
  }

  initSchema(): void {
    this.db.exec(`
      pragma foreign_keys = on;

      create table if not exists task_lifecycle (
        task_id text primary key,
        task_number integer not null unique,
        status text not null,
        governed_by text,
        closed_at text,
        closed_by text,
        reopened_at text,
        reopened_by text,
        continuation_packet_json text,
        updated_at text not null
      );

      create index if not exists idx_task_lifecycle_status
        on task_lifecycle(status);

      create table if not exists task_assignments (
        assignment_id text primary key,
        task_id text not null,
        agent_id text not null,
        claimed_at text not null,
        released_at text,
        release_reason text,
        intent text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_assignments_task_id
        on task_assignments(task_id);

      create table if not exists task_reports (
        report_id text primary key,
        task_id text not null,
        agent_id text not null,
        summary text not null,
        changed_files_json text,
        verification_json text,
        submitted_at text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_reports_task_id
        on task_reports(task_id);

      create table if not exists task_reviews (
        review_id text primary key,
        task_id text not null,
        reviewer_agent_id text not null,
        verdict text not null,
        findings_json text,
        reviewed_at text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_reviews_task_id
        on task_reviews(task_id);

      create table if not exists task_number_sequence (
        singleton integer primary key check (singleton = 1),
        last_allocated integer not null default 0
      );

      insert or ignore into task_number_sequence (singleton, last_allocated)
      values (1, 0);

      create table if not exists dispatch_packets (
        packet_id text primary key,
        task_id text not null,
        assignment_id text not null,
        agent_id text not null,
        picked_up_at text not null,
        lease_expires_at text not null,
        heartbeat_at text,
        dispatch_status text not null,
        sequence integer not null default 1,
        created_by text not null,
        target_session_id text,
        target_session_title text,
        foreign key (task_id) references task_lifecycle(task_id)
        -- assignment_id FK deferred: assignments are still in JSON files (Task 564 follow-up)
      );

      create index if not exists idx_dispatch_packets_task_id
        on dispatch_packets(task_id);

      create index if not exists idx_dispatch_packets_assignment_id
        on dispatch_packets(assignment_id);

      create index if not exists idx_dispatch_packets_agent_status
        on dispatch_packets(agent_id, dispatch_status);

      create index if not exists idx_dispatch_packets_lease_expires
        on dispatch_packets(lease_expires_at)
        where dispatch_status in ('picked_up', 'renewed');
    `);
  }

  upsertLifecycle(row: TaskLifecycleRow): void {
    const stmt = this.db.prepare(`
      insert into task_lifecycle (
        task_id, task_number, status, governed_by, closed_at, closed_by,
        reopened_at, reopened_by, continuation_packet_json, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(task_id) do update set
        status = excluded.status,
        governed_by = excluded.governed_by,
        closed_at = excluded.closed_at,
        closed_by = excluded.closed_by,
        reopened_at = excluded.reopened_at,
        reopened_by = excluded.reopened_by,
        continuation_packet_json = excluded.continuation_packet_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      row.task_id,
      row.task_number,
      row.status,
      row.governed_by,
      row.closed_at,
      row.closed_by,
      row.reopened_at,
      row.reopened_by,
      row.continuation_packet_json,
      row.updated_at,
    );
  }

  getLifecycle(taskId: string): TaskLifecycleRow | undefined {
    const row = this.db
      .prepare("select * from task_lifecycle where task_id = ?")
      .get(taskId) as Record<string, unknown> | undefined;
    return row ? rowToLifecycle(row) : undefined;
  }

  getLifecycleByNumber(taskNumber: number): TaskLifecycleRow | undefined {
    const row = this.db
      .prepare("select * from task_lifecycle where task_number = ?")
      .get(taskNumber) as Record<string, unknown> | undefined;
    return row ? rowToLifecycle(row) : undefined;
  }

  getAllLifecycle(): TaskLifecycleRow[] {
    const rows = this.db
      .prepare("select * from task_lifecycle")
      .all() as Record<string, unknown>[];
    return rows.map(rowToLifecycle);
  }

  updateStatus(
    taskId: string,
    status: TaskStatus,
    actor: string,
    updates?: Partial<Omit<TaskLifecycleRow, "task_id" | "task_number" | "status">>,
  ): void {
    const existing = this.getLifecycle(taskId);
    if (!existing) {
      throw new Error(`Cannot update status: task ${taskId} not found in lifecycle store`);
    }

    const merged: TaskLifecycleRow = {
      ...existing,
      status,
      updated_at: nowIso(),
      governed_by: updates?.governed_by ?? existing.governed_by,
      closed_at: updates?.closed_at ?? existing.closed_at,
      closed_by: updates?.closed_by ?? existing.closed_by,
      reopened_at: updates?.reopened_at ?? existing.reopened_at,
      reopened_by: updates?.reopened_by ?? existing.reopened_by,
      continuation_packet_json: updates?.continuation_packet_json ?? existing.continuation_packet_json,
    };

    this.upsertLifecycle(merged);
  }

  insertAssignment(assignment: TaskAssignmentRow): void {
    const stmt = this.db.prepare(`
      insert into task_assignments (
        assignment_id, task_id, agent_id, claimed_at, released_at, release_reason, intent
      ) values (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      assignment.assignment_id,
      assignment.task_id,
      assignment.agent_id,
      assignment.claimed_at,
      assignment.released_at,
      assignment.release_reason,
      assignment.intent,
    );
  }

  getActiveAssignment(taskId: string): TaskAssignmentRow | undefined {
    const row = this.db
      .prepare(
        `select * from task_assignments
         where task_id = ? and released_at is null
         order by claimed_at desc
         limit 1`,
      )
      .get(taskId) as Record<string, unknown> | undefined;
    return row ? rowToAssignment(row) : undefined;
  }

  getAssignments(taskId: string): TaskAssignmentRow[] {
    const rows = this.db
      .prepare(
        `select * from task_assignments
         where task_id = ?
         order by claimed_at desc`,
      )
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToAssignment);
  }

  releaseAssignment(assignmentId: string, releaseReason: string): void {
    const stmt = this.db.prepare(`
      update task_assignments
      set released_at = ?, release_reason = ?
      where assignment_id = ?
    `);
    const result = stmt.run(nowIso(), releaseReason, assignmentId);
    if (result.changes === 0) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }
  }

  insertReport(report: TaskReportRow): void {
    const stmt = this.db.prepare(`
      insert into task_reports (
        report_id, task_id, agent_id, summary, changed_files_json, verification_json, submitted_at
      ) values (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      report.report_id,
      report.task_id,
      report.agent_id,
      report.summary,
      report.changed_files_json,
      report.verification_json,
      report.submitted_at,
    );
  }

  listReports(taskId: string): TaskReportRow[] {
    const rows = this.db
      .prepare(
        `select * from task_reports
         where task_id = ?
         order by submitted_at desc`,
      )
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToReport);
  }

  insertReview(review: TaskReviewRow): void {
    const stmt = this.db.prepare(`
      insert into task_reviews (
        review_id, task_id, reviewer_agent_id, verdict, findings_json, reviewed_at
      ) values (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      review.review_id,
      review.task_id,
      review.reviewer_agent_id,
      review.verdict,
      review.findings_json,
      review.reviewed_at,
    );
  }

  listReviews(taskId: string): TaskReviewRow[] {
    const rows = this.db
      .prepare(
        `select * from task_reviews
         where task_id = ?
         order by reviewed_at desc`,
      )
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToReview);
  }

  insertDispatchPacket(packet: DispatchPacketRow): void {
    const stmt = this.db.prepare(`
      insert into dispatch_packets (
        packet_id, task_id, assignment_id, agent_id, picked_up_at, lease_expires_at,
        heartbeat_at, dispatch_status, sequence, created_by, target_session_id, target_session_title
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      packet.packet_id,
      packet.task_id,
      packet.assignment_id,
      packet.agent_id,
      packet.picked_up_at,
      packet.lease_expires_at,
      packet.heartbeat_at,
      packet.dispatch_status,
      packet.sequence,
      packet.created_by,
      packet.target_session_id,
      packet.target_session_title,
    );
  }

  getActiveDispatchPacketForAssignment(assignmentId: string): DispatchPacketRow | undefined {
    const row = this.db
      .prepare(
        `select * from dispatch_packets
         where assignment_id = ? and dispatch_status in ('picked_up', 'renewed')
         order by sequence desc
         limit 1`,
      )
      .get(assignmentId) as Record<string, unknown> | undefined;
    return row ? rowToDispatchPacket(row) : undefined;
  }

  getDispatchPacketsForTask(taskId: string): DispatchPacketRow[] {
    const rows = this.db
      .prepare(
        `select * from dispatch_packets
         where task_id = ?
         order by sequence desc`,
      )
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToDispatchPacket);
  }

  getDispatchPacketsForAgent(agentId: string): DispatchPacketRow[] {
    const rows = this.db
      .prepare(
        `select * from dispatch_packets
         where agent_id = ?
         order by picked_up_at desc`,
      )
      .all(agentId) as Record<string, unknown>[];
    return rows.map(rowToDispatchPacket);
  }

  heartbeatDispatchPacket(packetId: string, extensionMinutes: number, maxLeaseMinutes: number): void {
    const packet = this.db
      .prepare("select * from dispatch_packets where packet_id = ?")
      .get(packetId) as Record<string, unknown> | undefined;
    if (!packet) {
      throw new Error(`Dispatch packet ${packetId} not found`);
    }

    const currentExpiry = new Date(String(packet.lease_expires_at));
    const now = new Date();
    const extensionMs = extensionMinutes * 60 * 1000;
    const maxLeaseMs = maxLeaseMinutes * 60 * 1000;
    const pickedUpAt = new Date(String(packet.picked_up_at));

    // Calculate new expiry: extend from current expiry by extensionMinutes, but cap at maxLeaseMinutes from pickup
    const candidateExpiry = new Date(currentExpiry.getTime() + extensionMs);
    const maxExpiry = new Date(pickedUpAt.getTime() + maxLeaseMs);
    const newExpiry = candidateExpiry > maxExpiry ? maxExpiry : candidateExpiry;

    this.db.prepare(`
      update dispatch_packets
      set heartbeat_at = ?, lease_expires_at = ?
      where packet_id = ?
    `).run(nowIso(), newExpiry.toISOString(), packetId);
  }

  updateDispatchStatus(packetId: string, status: DispatchPacketStatus): void {
    const stmt = this.db.prepare(`
      update dispatch_packets
      set dispatch_status = ?
      where packet_id = ?
    `);
    const result = stmt.run(status, packetId);
    if (result.changes === 0) {
      throw new Error(`Dispatch packet ${packetId} not found`);
    }
  }

  allocateTaskNumber(): number {
    const txn = this.db.transaction(() => {
      const row = this.db
        .prepare("select last_allocated from task_number_sequence where singleton = 1")
        .get() as { last_allocated: number } | undefined;
      const current = row?.last_allocated ?? 0;
      const next = current + 1;
      this.db
        .prepare("update task_number_sequence set last_allocated = ? where singleton = 1")
        .run(next);
      return next;
    });
    return txn();
  }

  getLastAllocated(): number {
    const row = this.db
      .prepare("select last_allocated from task_number_sequence where singleton = 1")
      .get() as { last_allocated: number } | undefined;
    return row?.last_allocated ?? 0;
  }
}
