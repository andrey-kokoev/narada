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
import type { VerificationRunRow } from "./testing-intent.js";

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

export interface AssignmentRecordRow {
  task_id: string;
  record_json: string;
  updated_at: string;
}

export interface ReportRecordRow {
  report_id: string;
  task_id: string;
  assignment_id: string;
  agent_id: string;
  reported_at: string;
  report_json: string;
}

export interface PromotionRecordRow {
  promotion_id: string;
  task_id: string;
  task_number: number | null;
  agent_id: string;
  requested_by: string;
  requested_at: string;
  status: string;
  promotion_json: string;
}

export interface AgentRosterRow {
  agent_id: string;
  role: string;
  capabilities_json: string;
  first_seen_at: string;
  last_active_at: string;
  status: string;
  task_number: number | null;
  last_done: number | null;
  updated_at: string;
}

export interface TaskNumberReservationRow {
  range_start: number;
  range_end: number;
  purpose: string;
  reserved_by: string;
  reserved_at: string;
  expires_at: string;
  status: "active" | "released" | "expired";
}

export interface TaskSpecRow {
  task_id: string;
  task_number: number;
  title: string;
  chapter_markdown: string | null;
  goal_markdown: string | null;
  context_markdown: string | null;
  required_work_markdown: string | null;
  non_goals_markdown: string | null;
  acceptance_criteria_json: string;
  dependencies_json: string;
  updated_at: string;
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
  upsertAssignmentRecord(record: AssignmentRecordRow): void;
  getAssignmentRecord(taskId: string): AssignmentRecordRow | undefined;
  insertReport(report: TaskReportRow): void;
  listReports(taskId: string): TaskReportRow[];
  upsertReportRecord(record: ReportRecordRow): void;
  getReportRecord(reportId: string): ReportRecordRow | undefined;
  listReportRecords(taskId: string): ReportRecordRow[];
  upsertPromotionRecord(record: PromotionRecordRow): void;
  getPromotionRecord(promotionId: string): PromotionRecordRow | undefined;
  listPromotionRecords(taskId?: string): PromotionRecordRow[];
  insertReview(review: TaskReviewRow): void;
  listReviews(taskId: string): TaskReviewRow[];
  listAllReviews(): TaskReviewRow[];
  insertDispatchPacket(packet: DispatchPacketRow): void;
  getActiveDispatchPacketForAssignment(assignmentId: string): DispatchPacketRow | undefined;
  getDispatchPacketsForTask(taskId: string): DispatchPacketRow[];
  getDispatchPacketsForAgent(agentId: string): DispatchPacketRow[];
  heartbeatDispatchPacket(packetId: string, extensionMinutes: number, maxLeaseMinutes: number): void;
  updateDispatchStatus(packetId: string, status: DispatchPacketStatus): void;
  allocateTaskNumber(): number;
  getLastAllocated(): number;
  ensureTaskNumberFloor(minValue: number): number;
  // Verification runs (Testing Intent Zone)
  insertVerificationRun(run: VerificationRunRow): void;
  updateVerificationRun(runId: string, updates: Partial<Omit<VerificationRunRow, 'run_id'>>): void;
  getVerificationRun(runId: string): VerificationRunRow | undefined;
  listVerificationRunsForTask(taskId: string): VerificationRunRow[];
  listRecentVerificationRuns(limit: number): VerificationRunRow[];
  hasVerificationRunsForTask(taskId: string): boolean;
  // Agent roster (Task 611 — SQLite authority)
  getRoster(): AgentRosterRow[];
  getRosterEntry(agentId: string): AgentRosterRow | undefined;
  upsertRosterEntry(entry: AgentRosterRow): void;
  listTaskNumberReservations(): TaskNumberReservationRow[];
  upsertTaskNumberReservation(entry: TaskNumberReservationRow): void;
  upsertTaskSpec(row: TaskSpecRow): void;
  getTaskSpec(taskId: string): TaskSpecRow | undefined;
  getTaskSpecByNumber(taskNumber: number): TaskSpecRow | undefined;
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

function rowToAssignmentRecord(row: Record<string, unknown>): AssignmentRecordRow {
  return {
    task_id: String(row.task_id),
    record_json: String(row.record_json),
    updated_at: String(row.updated_at),
  };
}

function rowToReportRecord(row: Record<string, unknown>): ReportRecordRow {
  return {
    report_id: String(row.report_id),
    task_id: String(row.task_id),
    assignment_id: String(row.assignment_id),
    agent_id: String(row.agent_id),
    reported_at: String(row.reported_at),
    report_json: String(row.report_json),
  };
}

function rowToPromotionRecord(row: Record<string, unknown>): PromotionRecordRow {
  return {
    promotion_id: String(row.promotion_id),
    task_id: String(row.task_id),
    task_number: row.task_number === null || row.task_number === undefined
      ? null
      : Number(row.task_number),
    agent_id: String(row.agent_id),
    requested_by: String(row.requested_by),
    requested_at: String(row.requested_at),
    status: String(row.status),
    promotion_json: String(row.promotion_json),
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

function rowToTaskNumberReservation(row: Record<string, unknown>): TaskNumberReservationRow {
  return {
    range_start: Number(row.range_start),
    range_end: Number(row.range_end),
    purpose: String(row.purpose),
    reserved_by: String(row.reserved_by),
    reserved_at: String(row.reserved_at),
    expires_at: String(row.expires_at),
    status: String(row.status) as TaskNumberReservationRow["status"],
  };
}

function rowToTaskSpec(row: Record<string, unknown>): TaskSpecRow {
  return {
    task_id: String(row.task_id),
    task_number: Number(row.task_number),
    title: String(row.title),
    chapter_markdown: row.chapter_markdown ? String(row.chapter_markdown) : null,
    goal_markdown: row.goal_markdown ? String(row.goal_markdown) : null,
    context_markdown: row.context_markdown ? String(row.context_markdown) : null,
    required_work_markdown: row.required_work_markdown ? String(row.required_work_markdown) : null,
    non_goals_markdown: row.non_goals_markdown ? String(row.non_goals_markdown) : null,
    acceptance_criteria_json: String(row.acceptance_criteria_json),
    dependencies_json: String(row.dependencies_json),
    updated_at: String(row.updated_at),
  };
}

export interface SqliteTaskLifecycleStoreOptions {
  db: Db;
}

const initializedLifecycleDbPaths = new Set<string>();

export function openTaskLifecycleStore(cwd: string): SqliteTaskLifecycleStore {
  const dbPath = join(cwd, ".ai", "task-lifecycle.db");
  const db = new Database(dbPath);
  const store = new SqliteTaskLifecycleStore({ db });
  if (!initializedLifecycleDbPaths.has(dbPath)) {
    store.initSchema();
    initializedLifecycleDbPaths.add(dbPath);
  }
  return store;
}

export class SqliteTaskLifecycleStore implements TaskLifecycleStore {
  readonly db: Db;

  constructor(opts: SqliteTaskLifecycleStoreOptions) {
    this.db = opts.db;
  }

  initSchema(): void {
    this.db.exec('pragma foreign_keys = on;');
    try {
    this.db.exec(`
      begin;

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

      create table if not exists task_assignment_records (
        task_id text primary key,
        record_json text not null,
        updated_at text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

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

      create table if not exists task_report_records (
        report_id text primary key,
        task_id text not null,
        assignment_id text not null,
        agent_id text not null,
        reported_at text not null,
        report_json text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_report_records_task_id
        on task_report_records(task_id);

      create table if not exists task_promotion_records (
        promotion_id text primary key,
        task_id text not null,
        task_number integer,
        agent_id text not null,
        requested_by text not null,
        requested_at text not null,
        status text not null,
        promotion_json text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_promotion_records_task_id
        on task_promotion_records(task_id);

      create index if not exists idx_task_promotion_records_requested_at
        on task_promotion_records(requested_at);

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

      create table if not exists verification_runs (
        run_id text primary key,
        request_id text not null,
        task_id text,
        target_command text not null,
        scope text not null,
        timeout_seconds integer not null,
        requester_identity text not null,
        requested_at text not null,
        status text not null,
        exit_code integer,
        duration_ms integer,
        metrics_json text,
        stdout_digest text,
        stderr_digest text,
        stdout_excerpt text,
        stderr_excerpt text,
        completed_at text
      );

      create index if not exists idx_verification_runs_task_id
        on verification_runs(task_id);

      create index if not exists idx_verification_runs_status
        on verification_runs(status);

      create index if not exists idx_verification_runs_requested_at
        on verification_runs(requested_at);

      create table if not exists agent_roster (
        agent_id text primary key,
        role text not null,
        capabilities_json text not null,
        first_seen_at text not null,
        last_active_at text not null,
        status text not null default 'idle',
        task_number integer,
        last_done integer,
        updated_at text not null
      );

      create index if not exists idx_agent_roster_status
        on agent_roster(status);

      create table if not exists task_number_reservations (
        range_start integer not null,
        range_end integer not null,
        purpose text not null,
        reserved_by text not null,
        reserved_at text not null,
        expires_at text not null,
        status text not null,
        primary key (range_start, range_end)
      );

      create index if not exists idx_task_number_reservations_status
        on task_number_reservations(status);

      create table if not exists task_specs (
        task_id text primary key,
        task_number integer not null unique,
        title text not null,
        chapter_markdown text,
        goal_markdown text,
        context_markdown text,
        required_work_markdown text,
        non_goals_markdown text,
        acceptance_criteria_json text not null,
        dependencies_json text not null,
        updated_at text not null,
        foreign key (task_id) references task_lifecycle(task_id)
      );

      create index if not exists idx_task_specs_task_number
        on task_specs(task_number);

      commit;
    `);
    } catch (error) {
      try {
        this.db.exec('rollback;');
      } catch {
        // Ignore rollback failure; the original schema error is more useful.
      }
      throw error;
    }
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
    if (rows.length > 0) {
      return rows.map(rowToAssignment);
    }
    const record = this.getAssignmentRecord(taskId);
    if (!record) return [];
    try {
      const parsed = JSON.parse(record.record_json) as {
        assignments?: Array<{
          agent_id: string;
          claimed_at: string;
          released_at: string | null;
          release_reason: string | null;
          intent?: AssignmentIntent;
        }>;
      };
      return (parsed.assignments ?? []).map((a) => ({
        assignment_id: `${taskId}-${a.claimed_at}`,
        task_id: taskId,
        agent_id: a.agent_id,
        claimed_at: a.claimed_at,
        released_at: a.released_at ?? null,
        release_reason: a.release_reason ?? null,
        intent: a.intent ?? "primary",
      }));
    } catch {
      return [];
    }
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

  upsertAssignmentRecord(record: AssignmentRecordRow): void {
    const stmt = this.db.prepare(`
      insert into task_assignment_records (
        task_id, record_json, updated_at
      ) values (?, ?, ?)
      on conflict(task_id) do update set
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(record.task_id, record.record_json, record.updated_at);
  }

  getAssignmentRecord(taskId: string): AssignmentRecordRow | undefined {
    const row = this.db
      .prepare("select * from task_assignment_records where task_id = ?")
      .get(taskId) as Record<string, unknown> | undefined;
    return row ? rowToAssignmentRecord(row) : undefined;
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
    if (rows.length > 0) {
      return rows.map(rowToReport);
    }
    const records = this.listReportRecords(taskId);
    return records.map((record) => {
      try {
        const parsed = JSON.parse(record.report_json) as {
          summary?: string;
          changed_files?: string[];
          verification?: unknown;
        };
        return {
          report_id: record.report_id,
          task_id: record.task_id,
          agent_id: record.agent_id,
          summary: parsed.summary ?? "",
          changed_files_json: Array.isArray(parsed.changed_files)
            ? JSON.stringify(parsed.changed_files)
            : null,
          verification_json: parsed.verification !== undefined
            ? JSON.stringify(parsed.verification)
            : null,
          submitted_at: record.reported_at,
        };
      } catch {
        return {
          report_id: record.report_id,
          task_id: record.task_id,
          agent_id: record.agent_id,
          summary: "",
          changed_files_json: null,
          verification_json: null,
          submitted_at: record.reported_at,
        };
      }
    });
  }

  upsertReportRecord(record: ReportRecordRow): void {
    const stmt = this.db.prepare(`
      insert into task_report_records (
        report_id, task_id, assignment_id, agent_id, reported_at, report_json
      ) values (?, ?, ?, ?, ?, ?)
      on conflict(report_id) do update set
        task_id = excluded.task_id,
        assignment_id = excluded.assignment_id,
        agent_id = excluded.agent_id,
        reported_at = excluded.reported_at,
        report_json = excluded.report_json
    `);
    stmt.run(
      record.report_id,
      record.task_id,
      record.assignment_id,
      record.agent_id,
      record.reported_at,
      record.report_json,
    );
  }

  getReportRecord(reportId: string): ReportRecordRow | undefined {
    const row = this.db
      .prepare("select * from task_report_records where report_id = ?")
      .get(reportId) as Record<string, unknown> | undefined;
    return row ? rowToReportRecord(row) : undefined;
  }

  listReportRecords(taskId: string): ReportRecordRow[] {
    const rows = this.db
      .prepare(
        `select * from task_report_records
         where task_id = ?
         order by reported_at desc`,
      )
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToReportRecord);
  }

  upsertPromotionRecord(record: PromotionRecordRow): void {
    const stmt = this.db.prepare(`
      insert into task_promotion_records (
        promotion_id, task_id, task_number, agent_id, requested_by, requested_at, status, promotion_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(promotion_id) do update set
        task_id = excluded.task_id,
        task_number = excluded.task_number,
        agent_id = excluded.agent_id,
        requested_by = excluded.requested_by,
        requested_at = excluded.requested_at,
        status = excluded.status,
        promotion_json = excluded.promotion_json
    `);
    stmt.run(
      record.promotion_id,
      record.task_id,
      record.task_number,
      record.agent_id,
      record.requested_by,
      record.requested_at,
      record.status,
      record.promotion_json,
    );
  }

  getPromotionRecord(promotionId: string): PromotionRecordRow | undefined {
    const row = this.db
      .prepare("select * from task_promotion_records where promotion_id = ?")
      .get(promotionId) as Record<string, unknown> | undefined;
    return row ? rowToPromotionRecord(row) : undefined;
  }

  listPromotionRecords(taskId?: string): PromotionRecordRow[] {
    const rows = taskId
      ? this.db
          .prepare(
            `select * from task_promotion_records
             where task_id = ?
             order by requested_at desc`,
          )
          .all(taskId) as Record<string, unknown>[]
      : this.db
          .prepare(
            `select * from task_promotion_records
             order by requested_at desc`,
          )
          .all() as Record<string, unknown>[];
    return rows.map(rowToPromotionRecord);
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

  listAllReviews(): TaskReviewRow[] {
    const rows = this.db
      .prepare(
        `select * from task_reviews
         order by reviewed_at desc`,
      )
      .all() as Record<string, unknown>[];
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

  ensureTaskNumberFloor(minValue: number): number {
    const tx = this.db.transaction((floorValue: number) => {
      const row = this.db
        .prepare("select last_allocated from task_number_sequence where singleton = 1")
        .get() as { last_allocated: number } | undefined;
      const current = row?.last_allocated ?? 0;
      if (current < floorValue) {
        this.db
          .prepare("update task_number_sequence set last_allocated = ? where singleton = 1")
          .run(floorValue);
        return floorValue;
      }
      return current;
    });
    return tx(minValue);
  }

  // Verification runs (Testing Intent Zone)
  insertVerificationRun(run: VerificationRunRow): void {
    const stmt = this.db.prepare(`
      insert into verification_runs (
        run_id, request_id, task_id, target_command, scope, timeout_seconds,
        requester_identity, requested_at, status, exit_code, duration_ms,
        metrics_json, stdout_digest, stderr_digest, stdout_excerpt, stderr_excerpt, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.run_id,
      run.request_id,
      run.task_id,
      run.target_command,
      run.scope,
      run.timeout_seconds,
      run.requester_identity,
      run.requested_at,
      run.status,
      run.exit_code,
      run.duration_ms,
      run.metrics_json,
      run.stdout_digest,
      run.stderr_digest,
      run.stdout_excerpt,
      run.stderr_excerpt,
      run.completed_at,
    );
  }

  updateVerificationRun(runId: string, updates: Partial<Omit<VerificationRunRow, 'run_id'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (fields.length === 0) return;
    values.push(runId);
    const stmt = this.db.prepare(`
      update verification_runs set ${fields.join(', ')} where run_id = ?
    `);
    const result = stmt.run(...values);
    if (result.changes === 0) {
      throw new Error(`Verification run ${runId} not found`);
    }
  }

  getVerificationRun(runId: string): VerificationRunRow | undefined {
    const row = this.db
      .prepare("select * from verification_runs where run_id = ?")
      .get(runId) as Record<string, unknown> | undefined;
    return row ? rowToVerificationRun(row) : undefined;
  }

  listVerificationRunsForTask(taskId: string): VerificationRunRow[] {
    const rows = this.db
      .prepare("select * from verification_runs where task_id = ? order by requested_at desc")
      .all(taskId) as Record<string, unknown>[];
    return rows.map(rowToVerificationRun);
  }

  listRecentVerificationRuns(limit: number): VerificationRunRow[] {
    const rows = this.db
      .prepare("select * from verification_runs order by requested_at desc limit ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToVerificationRun);
  }

  hasVerificationRunsForTask(taskId: string): boolean {
    const row = this.db
      .prepare("select 1 from verification_runs where task_id = ? limit 1")
      .get(taskId) as { 1: number } | undefined;
    return row !== undefined;
  }

  // Agent roster (Task 611 — SQLite authority)
  getRoster(): AgentRosterRow[] {
    const rows = this.db
      .prepare("select * from agent_roster order by agent_id")
      .all() as Record<string, unknown>[];
    return rows.map(rowToRosterEntry);
  }

  getRosterEntry(agentId: string): AgentRosterRow | undefined {
    const row = this.db
      .prepare("select * from agent_roster where agent_id = ?")
      .get(agentId) as Record<string, unknown> | undefined;
    return row ? rowToRosterEntry(row) : undefined;
  }

  upsertRosterEntry(entry: AgentRosterRow): void {
    const stmt = this.db.prepare(`
      insert into agent_roster (
        agent_id, role, capabilities_json, first_seen_at, last_active_at,
        status, task_number, last_done, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(agent_id) do update set
        role = excluded.role,
        capabilities_json = excluded.capabilities_json,
        first_seen_at = excluded.first_seen_at,
        last_active_at = excluded.last_active_at,
        status = excluded.status,
        task_number = excluded.task_number,
        last_done = excluded.last_done,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      entry.agent_id,
      entry.role,
      entry.capabilities_json,
      entry.first_seen_at,
      entry.last_active_at,
      entry.status,
      entry.task_number,
      entry.last_done,
      entry.updated_at,
    );
  }

  listTaskNumberReservations(): TaskNumberReservationRow[] {
    const rows = this.db
      .prepare(
        `select * from task_number_reservations
         order by range_start asc, range_end asc`,
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToTaskNumberReservation);
  }

  upsertTaskNumberReservation(entry: TaskNumberReservationRow): void {
    const stmt = this.db.prepare(`
      insert into task_number_reservations (
        range_start, range_end, purpose, reserved_by, reserved_at, expires_at, status
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(range_start, range_end) do update set
        purpose = excluded.purpose,
        reserved_by = excluded.reserved_by,
        reserved_at = excluded.reserved_at,
        expires_at = excluded.expires_at,
        status = excluded.status
    `);
    stmt.run(
      entry.range_start,
      entry.range_end,
      entry.purpose,
      entry.reserved_by,
      entry.reserved_at,
      entry.expires_at,
      entry.status,
    );
  }

  upsertTaskSpec(row: TaskSpecRow): void {
    const stmt = this.db.prepare(`
      insert into task_specs (
        task_id, task_number, title, chapter_markdown, goal_markdown,
        context_markdown, required_work_markdown, non_goals_markdown,
        acceptance_criteria_json, dependencies_json, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(task_id) do update set
        task_number = excluded.task_number,
        title = excluded.title,
        chapter_markdown = excluded.chapter_markdown,
        goal_markdown = excluded.goal_markdown,
        context_markdown = excluded.context_markdown,
        required_work_markdown = excluded.required_work_markdown,
        non_goals_markdown = excluded.non_goals_markdown,
        acceptance_criteria_json = excluded.acceptance_criteria_json,
        dependencies_json = excluded.dependencies_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      row.task_id,
      row.task_number,
      row.title,
      row.chapter_markdown,
      row.goal_markdown,
      row.context_markdown,
      row.required_work_markdown,
      row.non_goals_markdown,
      row.acceptance_criteria_json,
      row.dependencies_json,
      row.updated_at,
    );
  }

  getTaskSpec(taskId: string): TaskSpecRow | undefined {
    const row = this.db
      .prepare('select * from task_specs where task_id = ?')
      .get(taskId) as Record<string, unknown> | undefined;
    return row ? rowToTaskSpec(row) : undefined;
  }

  getTaskSpecByNumber(taskNumber: number): TaskSpecRow | undefined {
    const row = this.db
      .prepare('select * from task_specs where task_number = ?')
      .get(taskNumber) as Record<string, unknown> | undefined;
    return row ? rowToTaskSpec(row) : undefined;
  }
}

function rowToVerificationRun(row: Record<string, unknown>): VerificationRunRow {
  return {
    run_id: String(row.run_id),
    request_id: String(row.request_id),
    task_id: row.task_id ? String(row.task_id) : null,
    target_command: String(row.target_command),
    scope: String(row.scope) as VerificationRunRow['scope'],
    timeout_seconds: Number(row.timeout_seconds),
    requester_identity: String(row.requester_identity),
    requested_at: String(row.requested_at),
    status: String(row.status) as VerificationRunRow['status'],
    exit_code: row.exit_code !== null && row.exit_code !== undefined ? Number(row.exit_code) : null,
    duration_ms: row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : 0,
    metrics_json: row.metrics_json ? String(row.metrics_json) : null,
    stdout_digest: row.stdout_digest ? String(row.stdout_digest) : null,
    stderr_digest: row.stderr_digest ? String(row.stderr_digest) : null,
    stdout_excerpt: row.stdout_excerpt ? String(row.stdout_excerpt) : null,
    stderr_excerpt: row.stderr_excerpt ? String(row.stderr_excerpt) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

function rowToRosterEntry(row: Record<string, unknown>): AgentRosterRow {
  return {
    agent_id: String(row.agent_id),
    role: String(row.role),
    capabilities_json: String(row.capabilities_json),
    first_seen_at: String(row.first_seen_at),
    last_active_at: String(row.last_active_at),
    status: String(row.status),
    task_number: row.task_number !== null && row.task_number !== undefined ? Number(row.task_number) : null,
    last_done: row.last_done !== null && row.last_done !== undefined ? Number(row.last_done) : null,
    updated_at: String(row.updated_at),
  };
}
