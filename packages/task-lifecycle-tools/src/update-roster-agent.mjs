/**
 * update-roster-agent.mjs — Update SQL-owned volatile roster state.
 *
 * `.ai/agents/roster.json` is authored static identity configuration.
 * Runtime fields such as status, task_number, last_done, and
 * last_active_at belong to SQLite `agent_roster`.
 *
 * Non-blocking: errors are logged but not thrown, to prevent task operations
 * from failing due to roster activity write issues.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

export async function withAuthoredRosterJsonPreserved(cwd, fn) {
  const rosterPath = join(resolve(cwd), '.ai', 'agents', 'roster.json');
  let before = null;
  try {
    before = readFileSync(rosterPath, 'utf8');
  } catch {
    before = null;
  }
  const result = await fn();
  if (before !== null) {
    try {
      const after = readFileSync(rosterPath, 'utf8');
      if (after !== before) writeFileSync(rosterPath, before, 'utf8');
    } catch {
      // Authored roster JSON preservation is best-effort compatibility hygiene.
    }
  }
  return result;
}

function updateSqlRoster(cwd, agentId, patch, errorContext = {}) {
  let store = null;
  try {
    store = openTaskLifecycleStore(cwd);
    const existing = store.db.prepare('SELECT * FROM agent_roster WHERE agent_id = ?').get(agentId);
    if (!existing) {
      console.error(JSON.stringify({ roster_sync_error: 'agent_not_found', agent_id: agentId, ...errorContext }));
      return;
    }
    const now = new Date().toISOString();
    store.upsertRosterEntry({
      agent_id: agentId,
      role: existing.role,
      capabilities_json: existing.capabilities_json ?? '[]',
      first_seen_at: existing.first_seen_at ?? now,
      last_active_at: now,
      status: patch.status ?? existing.status ?? 'idle',
      task_number: patch.task_number === undefined ? existing.task_number ?? null : patch.task_number,
      last_done: patch.last_done === undefined ? existing.last_done ?? null : patch.last_done,
      updated_at: now,
      ...(Object.hasOwn(existing, 'operator_identity') ? { operator_identity: existing.operator_identity ?? null } : {}),
    });
  } catch (err) {
    console.error(JSON.stringify({ roster_sync_error: err.message, agent_id: agentId, ...errorContext }));
  } finally {
    if (store) store.db.close();
  }
}

/**
 * Update agent volatile state after claim.
 * @param {string} cwd
 * @param {string} agentId
 * @param {number} taskNumber
 */
export function rosterOnClaim(cwd, agentId, taskNumber) {
  updateSqlRoster(cwd, agentId, { status: 'working', task_number: taskNumber }, { task_number: taskNumber });
}

/**
 * Update agent volatile state after unclaim.
 * @param {string} cwd
 * @param {string} agentId
 * @param {string|null} status — 'idle' or 'done' (defaults to 'idle')
 */
export function rosterOnUnclaim(cwd, agentId, status = 'idle') {
  updateSqlRoster(cwd, agentId, { status, task_number: null });
}

/**
 * Update agent volatile state after finish.
 * @param {string} cwd
 * @param {string} agentId
 * @param {number} taskNumber
 */
export function rosterOnFinish(cwd, agentId, taskNumber) {
  updateSqlRoster(cwd, agentId, { status: 'done', task_number: null, last_done: taskNumber }, { task_number: taskNumber });
}
