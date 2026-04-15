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
    trace_id: String(row.trace_id),
    execution_id: String(row.execution_id),
    conversation_id: String(row.conversation_id),
    work_item_id: row.work_item_id ? String(row.work_item_id) : null,
    session_id: row.session_id ? String(row.session_id) : null,
    trace_type: String(row.trace_type) as TraceType,
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
      -- Agent Trace Persistence Schema — Canonical Identity Version

      create table if not exists agent_traces (
        trace_id text primary key,
        execution_id text not null,
        conversation_id text not null,
        work_item_id text,
        session_id text,
        trace_type text not null,
        reference_outbound_id text,
        reference_message_id text,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_agent_traces_execution
        on agent_traces(execution_id, created_at asc);

      create index if not exists idx_agent_traces_conversation
        on agent_traces(conversation_id, created_at desc);

      create index if not exists idx_agent_traces_session
        on agent_traces(session_id, created_at asc);

      create index if not exists idx_agent_traces_reference_outbound
        on agent_traces(reference_outbound_id, created_at asc);
    `);
  }

  writeTrace(
    trace: Omit<AgentTrace, "trace_id" | "created_at">,
  ): AgentTrace {
    const traceId = randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      insert into agent_traces (
        trace_id, execution_id, conversation_id, work_item_id, session_id,
        trace_type, reference_outbound_id, reference_message_id,
        payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      traceId,
      trace.execution_id,
      trace.conversation_id,
      trace.work_item_id ?? null,
      trace.session_id ?? null,
      trace.trace_type,
      trace.reference_outbound_id ?? null,
      trace.reference_message_id ?? null,
      trace.payload_json,
      createdAt,
    );

    const row = this.db.prepare(`
      select * from agent_traces where trace_id = ?
    `).get(traceId) as Record<string, unknown>;

    return rowToAgentTrace(row);
  }

  readByExecutionId(executionId: string): AgentTrace[] {
    const rows = this.db.prepare(`
      select * from agent_traces
      where execution_id = ?
      order by created_at asc, trace_id asc
    `).all(executionId) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readByConversation(
    conversationId: string,
    opts?: {
      after?: string;
      before?: string;
      limit?: number;
      types?: TraceType[];
    },
  ): AgentTrace[] {
    const conditions: string[] = ["conversation_id = ?"];
    const params: (string | number)[] = [conversationId];

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
      select * from agent_traces
      where ${conditions.join(" and ")}
      order by created_at desc, trace_id desc
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readBySession(sessionId: string): AgentTrace[] {
    const rows = this.db.prepare(`
      select * from agent_traces
      where session_id = ?
      order by created_at asc, trace_id asc
    `).all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  readByOutboundId(outboundId: string): AgentTrace[] {
    const rows = this.db.prepare(`
      select * from agent_traces
      where reference_outbound_id = ?
      order by created_at asc, trace_id asc
    `).all(outboundId) as Record<string, unknown>[];
    return rows.map(rowToAgentTrace);
  }

  getTrace(traceId: string): AgentTrace | undefined {
    const row = this.db.prepare(`
      select * from agent_traces where trace_id = ?
    `).get(traceId) as Record<string, unknown> | undefined;
    return row ? rowToAgentTrace(row) : undefined;
  }

  close(): void {
    this.db.close();
  }
}
