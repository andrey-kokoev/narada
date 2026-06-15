#!/usr/bin/env node
/**
 * verify-agent-context-schema.mjs
 *
 * Schema smoke test + invariant test for agent-context materialization migration.
 * Uses in-memory SQLite. No CLI command. No MCP facade. No runtime service.
 *
 * Usage:
 *   node tools/incubation/verify-agent-context-schema.mjs
 */

import Database from '@narada2/sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const MIGRATION_PATH = join(rootDir, '.ai', 'db', 'migrations', '001-agent-context-materializations.sql');

const REQUIRED_TABLES = [
  'agent_start_events',
  'execution_context_materializations',
  'intelligence_context_materializations',
  'proposal_records',
  'residual_records',
  'artifact_refs',
];

const FORBIDDEN_TABLES = [
  'agent_memory',
  'belief_state',
  'mind_state',
];

function tableColumns(db, tableName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  return stmt.all().map((row) => row.name);
}

function tableExists(db, tableName) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
  return !!stmt.get(tableName);
}

function main() {
  const findings = [];
  let db;

  try {
    db = new Database(':memory:');
    findings.push({ ok: true, stage: 'db_open', detail: 'In-memory SQLite opened' });
  } catch (error) {
    findings.push({ ok: false, stage: 'db_open', error: error.message });
    return printResults(findings);
  }

  // 1. Apply migration
  try {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    db.exec(sql);
    findings.push({ ok: true, stage: 'migration_apply', detail: 'Migration applied successfully' });
  } catch (error) {
    findings.push({ ok: false, stage: 'migration_apply', error: error.message });
    return printResults(findings);
  }

  // 2. Required tables exist
  for (const table of REQUIRED_TABLES) {
    if (tableExists(db, table)) {
      findings.push({ ok: true, stage: `table_exists_${table}`, detail: `${table} exists` });
    } else {
      findings.push({ ok: false, stage: `table_exists_${table}`, error: `${table} missing` });
    }
  }

  // 3. Forbidden tables do not exist
  for (const table of FORBIDDEN_TABLES) {
    if (tableExists(db, table)) {
      findings.push({ ok: false, stage: `table_forbidden_${table}`, error: `${table} exists (forbidden)` });
    } else {
      findings.push({ ok: true, stage: `table_forbidden_${table}`, detail: `${table} absent (correct)` });
    }
  }

  // 4. intelligence_context_materializations columns
  const icCols = tableColumns(db, 'intelligence_context_materializations');
  const icRequired = ['event_id', 'schema_id', 'payload_json', 'created_at', 'expires_at'];
  for (const col of icRequired) {
    if (icCols.includes(col)) {
      findings.push({ ok: true, stage: `ic_col_${col}`, detail: `intelligence_context_materializations.${col} exists` });
    } else {
      findings.push({ ok: false, stage: `ic_col_${col}`, error: `intelligence_context_materializations.${col} missing` });
    }
  }

  // 5. execution_context_materializations columns
  const ecCols = tableColumns(db, 'execution_context_materializations');
  const ecRequired = ['event_id', 'runtime', 'payload_json', 'created_at', 'expires_at'];
  for (const col of ecRequired) {
    if (ecCols.includes(col)) {
      findings.push({ ok: true, stage: `ec_col_${col}`, detail: `execution_context_materializations.${col} exists` });
    } else {
      findings.push({ ok: false, stage: `ec_col_${col}`, error: `execution_context_materializations.${col} missing` });
    }
  }

  // 6. proposal_records columns
  const prCols = tableColumns(db, 'proposal_records');
  const prRequired = ['proposal_type', 'verdict', 'verdict_at', 'verdict_by'];
  for (const col of prRequired) {
    if (prCols.includes(col)) {
      findings.push({ ok: true, stage: `pr_col_${col}`, detail: `proposal_records.${col} exists` });
    } else {
      findings.push({ ok: false, stage: `pr_col_${col}`, error: `proposal_records.${col} missing` });
    }
  }

  // 7. residual_records columns
  const rrCols = tableColumns(db, 'residual_records');
  const rrRequired = ['status', 'promoted_task_id'];
  for (const col of rrRequired) {
    if (rrCols.includes(col)) {
      findings.push({ ok: true, stage: `rr_col_${col}`, detail: `residual_records.${col} exists` });
    } else {
      findings.push({ ok: false, stage: `rr_col_${col}`, error: `residual_records.${col} missing` });
    }
  }

  // 8. Cascade test: deleting event deletes ephemeral materializations
  try {
    const insertEvent = db.prepare(`INSERT INTO agent_start_events (event_id, identity_id, runtime, created_at, status) VALUES (?, ?, ?, ?, ?)`);
    insertEvent.run('evt-test-001', 'narada-andrey.architect', 'kimi-cli', '2026-05-04T19:00:00Z', 'active');

    const insertIC = db.prepare(`INSERT INTO intelligence_context_materializations (materialization_id, event_id, schema_id, payload_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insertIC.run('ic-test-001', 'evt-test-001', 'narada.intelligence_context.v0', '{}', '2026-05-04T19:00:00Z', '2026-05-04T20:00:00Z');

    const insertEC = db.prepare(`INSERT INTO execution_context_materializations (materialization_id, event_id, runtime, payload_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insertEC.run('ec-test-001', 'evt-test-001', 'kimi-cli', '{}', '2026-05-04T19:00:00Z', '2026-05-04T20:00:00Z');

    const deleteEvent = db.prepare(`DELETE FROM agent_start_events WHERE event_id = ?`);
    deleteEvent.run('evt-test-001');

    const icAfter = db.prepare(`SELECT COUNT(*) as count FROM intelligence_context_materializations WHERE event_id = ?`).get('evt-test-001');
    const ecAfter = db.prepare(`SELECT COUNT(*) as count FROM execution_context_materializations WHERE event_id = ?`).get('evt-test-001');

    if (icAfter.count === 0 && ecAfter.count === 0) {
      findings.push({ ok: true, stage: 'cascade_event_delete', detail: 'Deleting event cascades to ephemeral materializations' });
    } else {
      findings.push({ ok: false, stage: 'cascade_event_delete', error: `Event deletion did not cascade: ic=${icAfter.count}, ec=${ecAfter.count}` });
    }
  } catch (error) {
    findings.push({ ok: false, stage: 'cascade_event_delete', error: error.message });
  }

  // 9. SET NULL test: deleting materialization leaves proposal/residual with null ref
  try {
    const insertEvent2 = db.prepare(`INSERT INTO agent_start_events (event_id, identity_id, runtime, created_at, status) VALUES (?, ?, ?, ?, ?)`);
    insertEvent2.run('evt-test-002', 'narada-andrey.architect', 'kimi-cli', '2026-05-04T19:00:00Z', 'active');

    const insertIC2 = db.prepare(`INSERT INTO intelligence_context_materializations (materialization_id, event_id, schema_id, payload_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insertIC2.run('ic-test-002', 'evt-test-002', 'narada.intelligence_context.v0', '{}', '2026-05-04T19:00:00Z', '2026-05-04T20:00:00Z');

    const insertProposal = db.prepare(`INSERT INTO proposal_records (proposal_id, event_id, materialization_id, proposal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insertProposal.run('prop-test-001', 'evt-test-002', 'ic-test-002', 'decision_request', '{}', '2026-05-04T19:00:00Z');

    const insertResidual = db.prepare(`INSERT INTO residual_records (residual_id, event_id, materialization_id, label, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insertResidual.run('res-test-001', 'evt-test-002', 'ic-test-002', 'session_resume_boundary', '{}', '2026-05-04T19:00:00Z');

    const deleteIC = db.prepare(`DELETE FROM intelligence_context_materializations WHERE materialization_id = ?`);
    deleteIC.run('ic-test-002');

    const proposalAfter = db.prepare(`SELECT materialization_id FROM proposal_records WHERE proposal_id = ?`).get('prop-test-001');
    const residualAfter = db.prepare(`SELECT materialization_id FROM residual_records WHERE residual_id = ?`).get('res-test-001');

    if (proposalAfter.materialization_id === null && residualAfter.materialization_id === null) {
      findings.push({ ok: true, stage: 'set_null_materialization_delete', detail: 'Deleting materialization sets proposal/residual refs to null' });
    } else {
      findings.push({ ok: false, stage: 'set_null_materialization_delete', error: `Materialization deletion did not set null: proposal.mat=${proposalAfter.materialization_id}, residual.mat=${residualAfter.materialization_id}` });
    }
  } catch (error) {
    findings.push({ ok: false, stage: 'set_null_materialization_delete', error: error.message });
  }

  db.close();
  printResults(findings);
}

function printResults(findings) {
  let passed = 0;
  let failed = 0;

  for (const f of findings) {
    if (f.ok) {
      passed++;
      console.log(`[PASS] ${f.stage}: ${f.detail ?? 'OK'}`);
    } else {
      failed++;
      console.log(`[FAIL] ${f.stage}: ${f.error ?? 'Unknown error'}`);
    }
  }

  const status = failed === 0 ? 'PASS' : 'FAIL';
  console.log(`\n---`);
  console.log(`${status} agent_context_schema`);
  console.log(`Total: ${findings.length}, Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
