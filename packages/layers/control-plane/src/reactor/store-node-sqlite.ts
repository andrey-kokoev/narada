/**
 * Node:sqlite Reactor Output Store
 *
 * Adapter-first node:sqlite implementation of ReactorOutputStore.
 *
 * This is intended as a migration step alongside the better-sqlite3-based
 * SqliteCoordinatorStore. It owns only the reactor_outputs table.
 */

import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { ReactorOutputRow } from "../coordinator/types.js";
import type { ReactorOutputStore } from "./types.js";

const SCHEMA_SQL = `
  create table if not exists reactor_outputs (
    output_id text primary key,
    reactor_id text not null,
    charter_id text not null,
    context_id text not null,
    scope_id text not null,
    evaluated_at text not null,
    outcome text not null,
    confidence_json text not null default '{}',
    summary text not null,
    proposals_json text not null default '[]',
    escalation_json text,
    created_at text not null default (datetime('now'))
  );

  create index if not exists idx_reactor_outputs_context
    on reactor_outputs(context_id, scope_id, evaluated_at desc);
  create index if not exists idx_reactor_outputs_reactor
    on reactor_outputs(reactor_id, evaluated_at desc);
`;

export class NodeSqliteReactorOutputStore implements ReactorOutputStore {
  private readonly insertStmt: StatementSync;
  private readonly getByIdStmt: StatementSync;
  private readonly getByContextStmt: StatementSync;
  private readonly getByReactorStmt: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.db.exec(SCHEMA_SQL);
    this.insertStmt = this.db.prepare(`
      insert into reactor_outputs (
        output_id, reactor_id, charter_id, context_id, scope_id, evaluated_at,
        outcome, confidence_json, summary, proposals_json, escalation_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.getByIdStmt = this.db.prepare(`
      select * from reactor_outputs where output_id = ?
    `);
    this.getByContextStmt = this.db.prepare(`
      select * from reactor_outputs
      where context_id = ? and scope_id = ?
      order by evaluated_at desc
    `);
    this.getByReactorStmt = this.db.prepare(`
      select * from reactor_outputs
      where reactor_id = ?
      order by evaluated_at desc
      limit ?
    `);
  }

  insertReactorOutput(output: ReactorOutputRow): void {
    this.insertStmt.run(
      output.output_id,
      output.reactor_id,
      output.charter_id,
      output.context_id,
      output.scope_id,
      output.evaluated_at,
      output.outcome,
      output.confidence_json,
      output.summary,
      output.proposals_json,
      output.escalation_json,
      output.created_at,
    );
  }

  getReactorOutputById(outputId: string): ReactorOutputRow | undefined {
    const row = this.getByIdStmt.get(outputId) as Record<string, unknown> | undefined;
    return row ? rowToReactorOutput(row) : undefined;
  }

  getReactorOutputsByContext(contextId: string, scopeId: string): ReactorOutputRow[] {
    const rows = this.getByContextStmt.all(contextId, scopeId) as Record<string, unknown>[];
    return rows.map(rowToReactorOutput);
  }

  getReactorOutputsByReactor(reactorId: string, limit: number = 100): ReactorOutputRow[] {
    const rows = this.getByReactorStmt.all(reactorId, limit) as Record<string, unknown>[];
    return rows.map(rowToReactorOutput);
  }
}

function rowToReactorOutput(row: Record<string, unknown>): ReactorOutputRow {
  return {
    output_id: String(row.output_id),
    reactor_id: String(row.reactor_id),
    charter_id: String(row.charter_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    evaluated_at: String(row.evaluated_at),
    outcome: String(row.outcome),
    confidence_json: String(row.confidence_json),
    summary: String(row.summary),
    proposals_json: String(row.proposals_json),
    escalation_json: row.escalation_json ? String(row.escalation_json) : null,
    created_at: String(row.created_at),
  };
}
