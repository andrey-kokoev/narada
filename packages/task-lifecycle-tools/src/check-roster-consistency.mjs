#!/usr/bin/env node
/**
 * check-roster-consistency.mjs — Verify roster.json matches task lifecycle assignments.
 *
 * Checks:
 * - Agents with status 'working' must have a matching active assignment in SQLite
 * - Agents with agent.task set must have that task claimed by them in SQLite
 * - Agents with status 'done' should have agent.last_done matching their most recent finished task
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();

function readRoster(cwd) {
  const path = join(resolve(cwd), '.ai', 'agents', 'roster.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

const store = openTaskLifecycleStore(cwd);
let divergences = [];

try {
  const roster = readRoster(cwd);

  for (const agent of roster.agents) {
    const agentId = agent.agent_id;
    const rosterTask = agent.task ?? null;
    const rosterStatus = agent.status ?? null;
    const rosterLastDone = agent.last_done ?? null;

    // Find active assignment for this agent
    const activeAssignment = store.db.prepare(
      "SELECT tl.task_number FROM task_assignments ta JOIN task_lifecycle tl ON ta.task_id = tl.task_id WHERE ta.agent_id = ? AND ta.released_at IS NULL ORDER BY ta.claimed_at DESC LIMIT 1"
    ).get(agentId);
    const activeTaskNumber = activeAssignment ? activeAssignment.task_number : null;

    // Check: if roster says working, there must be an active assignment
    if (rosterStatus === 'working' && activeTaskNumber === null) {
      divergences.push({ agent_id: agentId, kind: 'roster_says_working_but_no_active_assignment', roster_task: rosterTask });
    }

    // Check: if roster has a task, it must match the active assignment
    if (rosterTask !== null && rosterTask !== activeTaskNumber) {
      divergences.push({ agent_id: agentId, kind: 'roster_task_mismatch', roster_task: rosterTask, sql_task: activeTaskNumber });
    }

    // Check: if there's an active assignment but roster doesn't show it
    if (activeTaskNumber !== null && rosterTask !== activeTaskNumber) {
      divergences.push({ agent_id: agentId, kind: 'sql_task_not_in_roster', roster_task: rosterTask, sql_task: activeTaskNumber });
    }

    // Check last_done consistency: find most recent finished task by this agent
    const lastFinished = store.db.prepare(
      "SELECT tl.task_number FROM task_reports tr JOIN task_lifecycle tl ON tr.task_id = tl.task_id WHERE tr.agent_id = ? ORDER BY tr.submitted_at DESC LIMIT 1"
    ).get(agentId);
    const sqlLastDone = lastFinished ? lastFinished.task_number : null;

    if (rosterLastDone !== null && sqlLastDone !== null && rosterLastDone !== sqlLastDone) {
      divergences.push({ agent_id: agentId, kind: 'last_done_mismatch', roster_last_done: rosterLastDone, sql_last_done: sqlLastDone });
    } else if (rosterLastDone === null && sqlLastDone !== null) {
      divergences.push({ agent_id: agentId, kind: 'last_done_missing_in_roster', sql_last_done: sqlLastDone });
    }
  }
} finally {
  store.db.close();
}

const ok = divergences.length === 0;
console.log(JSON.stringify({
  schema: 'narada.task.roster_consistency.v0',
  ok,
  divergences: divergences.length,
  details: divergences,
}, null, 2));

process.exit(ok ? 0 : 1);
