#!/usr/bin/env node
/**
 * Bootstrap Synthesis
 *
 * Reads agent-context DB and task lifecycle DB to produce a rich bootstrap
 * packet combining Layer 1 (residue: checkpoints) and Layer 2 (active work).
 *
 * Usage:
 *   node synthesize-bootstrap.mjs <cwd> <agent-id>
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch {
    try {
      return require(resolve(process.cwd(), 'node_modules', 'better-sqlite3'));
    } catch {
      try {
        return require(resolve(process.cwd(), 'tools', 'agent-context', 'node_modules', 'better-sqlite3'));
      } catch {
        return null;
      }
    }
  }
}

const cwd = process.argv[2] || process.cwd();
const agentId = process.argv[3];

if (!agentId) {
  console.error('Usage: node synthesize-bootstrap.mjs <cwd> <agent-id>');
  process.exit(1);
}

const siteRoot = resolve(cwd);
const agentDbPath = join(siteRoot, '.ai', 'state', 'agent-context.sqlite');
const lifecycleDbPath = join(siteRoot, '.ai', 'task-lifecycle.db');

const Database = resolveBetterSqlite3();
if (!Database) {
  console.error(JSON.stringify({ status: 'error', error: 'better-sqlite3 not found' }, null, 2));
  process.exit(1);
}

let agentDb;
let lifecycleDb;

try {
  agentDb = existsSync(agentDbPath) ? new Database(agentDbPath) : null;
  lifecycleDb = existsSync(lifecycleDbPath) ? new Database(lifecycleDbPath) : null;

  // Layer 1: Recent checkpoints
  let checkpoints = [];
  if (agentDb) {
    const hasTable = agentDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_events'").get();
    if (hasTable) {
      const rows = agentDb.prepare(
        `SELECT event_id, event_type, task_number, payload_json, emitted_at
         FROM agent_events
         WHERE agent_id = ? AND event_type = 'checkpoint'
         ORDER BY emitted_at DESC
         LIMIT 5`
      ).all(agentId);
      checkpoints = rows.map((r) => ({
        event_id: r.event_id,
        event_type: r.event_type,
        task_number: r.task_number,
        emitted_at: r.emitted_at,
        payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      }));
    }
  }

  // Layer 2: Active claimed tasks
  let activeTasks = [];
  if (lifecycleDb) {
    const hasAssignments = lifecycleDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_assignments'").get();
    if (hasAssignments) {
      const rows = lifecycleDb.prepare(
        `SELECT tl.task_number, tl.task_id, tl.status, tl.governed_by, ta.claimed_at
         FROM task_lifecycle tl
         JOIN task_assignments ta ON tl.task_id = ta.task_id
         WHERE ta.agent_id = ? AND ta.released_at IS NULL AND tl.status = 'claimed'
         ORDER BY ta.claimed_at DESC`
      ).all(agentId);
      activeTasks = rows;
    }
  }

  const bootstrap = {
    schema: 'narada.agent_context.bootstrap.v0',
    generated_at: new Date().toISOString(),
    agent_id: agentId,
    layers: {
      layer_0_invariant: {
        note: 'AGENTS.md is read fresh by the agent runtime',
        agents_md_path: join(siteRoot, 'AGENTS.md'),
      },
      layer_1_residue: {
        recent_checkpoints: checkpoints,
        checkpoint_count: checkpoints.length,
      },
      layer_2_active_work: {
        claimed_tasks: activeTasks,
        claimed_task_count: activeTasks.length,
      },
      layer_3_ephemeral: {
        note: 'Session-only; not persisted',
      },
    },
  };

  console.log(JSON.stringify(bootstrap, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
} finally {
  if (agentDb) agentDb.close();
  if (lifecycleDb) lifecycleDb.close();
}
