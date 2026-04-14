/**
 * SQLite-backed Agent Trace Store
 *
 * Durable append-only storage for agent traces.
 */

import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { AgentTrace, AgentTraceStore, TraceType } from "./types.js";

function rowToAgentTrace(row: Record<string, unknown>): AgentTrace {
  return {
    rowid: Number(row.rowid),
    trace_id: String(row.trace_id),
    thread_id: String(row.thread_id),
    mailbox_id: String(row.mailbox_id),
    agent_id: String(row.agent_id),
    session_id: row.session_id ? String(row.session_id) : null,
    trace_type: String(row.trace_type) as TraceType,
    parent_trace_id: row.parent_trace_id ? String(row.parent_trace_id) : null,
    reference_outbound_id: row.reference_outbound_id
      ? String(row.reference_outbound_id)
      : null,
    reference_message_id: row.reference_message_id
      ? String(row.reference_message_id)
      : null,
    payload_json: String(row.payload_json),
    created_at: String(row.created_at),
  };
}

export interface SqliteAgentTraceStoreOptions {
  db: Database.Database;
}

export class SqliteAgentTraceStore implements AgentTraceStore {
  readonly db: Database.Database;

  constructor(opts: SqliteAgentTraceStoreOptions) {
    this.db = opts.db;
  }

  initSchema(): void {
    this.db.exec(`
      -- Agent Trace Persistence Schema
      --
      -- Append-only local commentary for agent reasoning, decisions, and observations.
      -- Lives in the same SQLite database as outbound state but is loaded independently.
      --
      -- Semantics:
      -- - Traces are NOT authoritative sync state, workflow state, command state, or recovery state.
      -- - thread_id in this table is the Exchange conversation_id used by the filesystem view layer.
      -- - reference_outbound_id and parent_trace_id are logical references only (no FK constraints)
      --   so that trace retention is not coupled to command or parent trace retention.

      create table if not exists agent_traces (
        trace_id text primary key,
        thread_id text not null,
        mailbox_id text not null,
        agent_id text not null,
        session_id text,
        trace_type text not null,
        parent_trace_id text,
        reference_outbound_id text,
        reference_message_id text,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_agent_traces_thread
        on agent_traces(thread_id, created_at desc);

      create index if not exists idx_agent_traces_session
        on agent_traces(session_id, created_at asc);

      create index if not exists idx_agent_traces_agent
        on agent_traces(agent_id, created_at desc);

      create index if not exists idx_agent_traces_reference_outbound
        on agent_traces(reference_outbound_id, created_at asc);
    `);
  }

  writeTrace(
    trace: Omit<AgentTrace, "rowid" | "trace_id" | "created_at">,
  ): AgentTrace {
    const traceId = randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      insert into agent_traces (
        trace_id, thread_id, mailbox_id, agent_id, session_id,
        trace_type, parent_trace_id, reference_outbound_id, reference_message_id,
        payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      traceId,
      trace.thread_id,
      trace.mailbox_id,
      trace.agent_id,
      trace.session_id ?? null,
      trace.trace_type,
      trace.parent_trace_id ?? null,
      trace.reference_outbound_id ?? null,
      trace.reference_message_id ?? null,
      trace.payload_json,
      createdAt,
    );

    const row = this.db.prepare(`
      select rowid, * from agent_traces where trace_id = ?
    `).get(traceId) as Record<string, unknown>;

    return rowToAgentTrace(row);
  }

  readByThread(
    threadId: string,
    opts?: {
      after?: string;
      before?: string;
      limit?: number;
      types?: TraceType[];
    },
  ): AgentTrace[] {
    const conditions: string[] = ["thread_id = ?"];
    const params: (string | number)[] = [threadId];

    if (opts?.after) {
      conditions.push("created_at > ?");
      params.push(opts.after);
    }
    if (opts?.before) {
      conditions.push("created_at < ?");
      params.push(opts.before);
    }
    if (opts?.types && opts.types.length > 0) {
      conditions.push(`trace_type in (${opts.types.map(() => "?").join(", ")})`);
      params.push(...opts.types);
    }

    const limitClause = opts?.limit !== undefined ? "limit ?" : "";
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
    }

    const sql = `
      select rowid, * from agent_traces
      where ${conditions.join(" and ")}
      order by created_at desc, rowid desc
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readBySession(sessionId: string): AgentTrace[] {
    const rows = this.db.prepare(`
      select rowid, * from agent_traces
      where session_id = ?
      order by created_at asc, rowid asc
    `).all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readByOutboundId(outboundId: string): AgentTrace[] {
    const rows = this.db.prepare(`
      select rowid, * from agent_traces
      where reference_outbound_id = ?
      order by created_at asc, rowid asc
    `).all(outboundId) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readUnlinkedDecisions(opts?: {
    types?: TraceType[];
    limit?: number;
  }): AgentTrace[] {
    const conditions: string[] = ["reference_outbound_id is null"];
    const params: (string | number)[] = [];

    if (opts?.types && opts.types.length > 0) {
      conditions.push(`trace_type in (${opts.types.map(() => "?").join(", ")})`);
      params.push(...opts.types);
    }

    const limitClause = opts?.limit !== undefined ? "limit ?" : "";
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
    }

    const sql = `
      select rowid, * from agent_traces
      where ${conditions.join(" and ")}
      order by created_at desc, rowid desc
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  getTrace(traceId: string): AgentTrace | undefined {
    const row = this.db.prepare(`
      select rowid, * from agent_traces where trace_id = ?
    `).get(traceId) as Record<string, unknown> | undefined;
    return row ? rowToAgentTrace(row) : undefined;
  }

  close(): void {
    this.db.close();
  }
}
