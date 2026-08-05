import assert from "node:assert/strict";
import Database from "../../src/sqlite/database.js";
import { NodeSqliteReactorOutputStore } from "../../src/reactor/store-node-sqlite.js";
import type { ReactorOutputRow } from "../../src/coordinator/types.js";

function output(overrides: Partial<ReactorOutputRow> = {}): ReactorOutputRow {
  return {
    output_id: "out-1",
    reactor_id: "reactor-1",
    charter_id: "charter-1",
    context_id: "context-1",
    scope_id: "scope-1",
    evaluated_at: "2026-08-05T00:00:00.000Z",
    outcome: "propose",
    confidence_json: "{}",
    summary: "runtime contract",
    proposals_json: "[]",
    escalation_json: null,
    created_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

const db = new Database(":memory:");
try {
  const store = new NodeSqliteReactorOutputStore(db);
  const first = output();
  const second = output({
    output_id: "out-2",
    evaluated_at: "2026-08-05T00:00:01.000Z",
    summary: "newer runtime contract",
  });

  store.insertReactorOutput(first);
  store.insertReactorOutput(second);

  assert.deepEqual(store.getReactorOutputById(first.output_id), first);
  assert.deepEqual(
    store.getReactorOutputsByContext(first.context_id, first.scope_id).map((row) => row.output_id),
    [second.output_id, first.output_id],
  );
  assert.deepEqual(
    store.getReactorOutputsByReactor(first.reactor_id, 1).map((row) => row.output_id),
    [second.output_id],
  );

  process.stdout.write(`${JSON.stringify({
    schema: "narada.control_plane.reactor_sqlite_runtime.v1",
    runtime: (process.versions as { bun?: string }).bun ? "bun" : "node",
    status: "ok",
  })}\n`);
} finally {
  db.close();
}
