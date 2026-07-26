/**
 * sync-roster.js — Roster static import and compatibility projection.
 *
 * Authoritative direction:
 *   Forward (default): import static roster identity config from roster.json
 *   into SQLite agent_roster without treating JSON volatile fields as runtime
 *   authority.
 *
 *   Reverse (--reverse): write a legacy full-roster compatibility projection.
 *   This is not an authority transfer back to authored JSON.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { loadRoster } from '@narada2/task-governance/task-governance';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd: any = process.argv[2] || process.cwd();
const dryRun: any = process.argv.includes('--dry-run');
const reverse: any = process.argv.includes('--reverse');

async function loadRosterJson(cwd: any) : Promise<any> {
  const jsonPath: any = join(resolve(cwd), '.ai', 'agents', 'roster.json');
  const raw: any = await readFile(jsonPath, 'utf8');
  return JSON.parse(raw);
}

async function writeRosterJson(cwd: any, roster: any) : Promise<any> {
  const jsonPath: any = join(resolve(cwd), '.ai', 'agents', 'roster.json');
  await mkdir(dirname(jsonPath), { recursive: true });
  const json: any = JSON.stringify(roster, null, 2);
  const tempPath: any = jsonPath + '.tmp';
  await writeFile(tempPath, json, 'utf8');
  await rename(tempPath, jsonPath);
}

function hasColumn(db: any, table: any, column: any) : any {
  const cols: any = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c: any)  => c.name === column);
}

async function runForward() : Promise<any> {
  const roster: any = await loadRosterJson(cwd);
  const store: any = openTaskLifecycleStore(cwd);
  let changed: any = false;
  let removed: any = 0;
  const operatorIdentityCol: any = hasColumn(store.db, 'agent_roster', 'operator_identity');
  try {
    const jsonAgentIds: any = new Set(roster.agents.map((a: any) : any => a.agent_id));
    jsonAgentIds.add('_site');
    const sqlRows: any = store.db.prepare("SELECT agent_id FROM agent_roster").all();
    for (const row of sqlRows) {
      if (!jsonAgentIds.has(row.agent_id)) {
        removed++;
      }
    }
    if (removed > 0) changed = true;
    for (const agent of roster.agents) {
      const sqlRow: any = store.db.prepare(operatorIdentityCol
        ? "SELECT role, task_number, last_done, status, operator_identity FROM agent_roster WHERE agent_id = ?"
        : "SELECT role, task_number, last_done, status FROM agent_roster WHERE agent_id = ?"
      ).get(agent.agent_id);
      const sqlOperatorIdentity: any = operatorIdentityCol ? sqlRow?.operator_identity : undefined;
      if (!sqlRow || sqlRow.role !== agent.role || sqlOperatorIdentity !== (agent.operator_identity ?? null)) {
        changed = true;
        break;
      }
    }
    const siteRow: any = store.db.prepare("SELECT capabilities_json FROM agent_roster WHERE agent_id = '_site'").get();
    const siteRole: any = siteRow ? JSON.parse(siteRow.capabilities_json)?.default_reviewer_role : null;
    if (siteRole !== (roster.default_reviewer_role ?? null)) {
      changed = true;
    }
  } finally {
    store.db.close();
  }
  if (!changed) {
    console.log(JSON.stringify({
      schema: 'narada.task.roster_sync.v0',
      dry_run: dryRun,
      direction: 'forward',
      status: 'success',
      agent_count: roster.agents.length,
      default_reviewer_role: roster.default_reviewer_role ?? null,
      removed_orphans: 0,
      note: 'No static roster config divergence detected; sync is unnecessary.',
    }, null, 2));
    return;
  }
  if (dryRun) {
    console.log(JSON.stringify({
      schema: 'narada.task.roster_sync.v0',
      dry_run: true,
      direction: 'forward',
      agent_count: roster.agents.length,
      default_reviewer_role: roster.default_reviewer_role ?? null,
      removed_orphans: removed,
      note: 'Would import static JSON roster config into SQLite agent_roster; SQL volatile fields remain authoritative.',
    }, null, 2));
    return;
  }
  await importStaticRosterConfig(cwd, roster);
  console.log(JSON.stringify({
    schema: 'narada.task.roster_sync.v0',
    dry_run: false,
    direction: 'forward',
    status: 'success',
    agent_count: roster.agents.length,
    default_reviewer_role: roster.default_reviewer_role ?? null,
    removed_orphans: removed,
    note: 'Static JSON roster config imported. SQL agent_roster remains volatile state authority.',
  }, null, 2));
}

async function importStaticRosterConfig(cwd: any, roster: any) : Promise<any> {
  const store: any = openTaskLifecycleStore(cwd);
  const now: any = new Date().toISOString();
  const operatorIdentityCol: any = hasColumn(store.db, 'agent_roster', 'operator_identity');
  try {
    for (const agent of roster.agents) {
      const existing: any = store.db.prepare('SELECT * FROM agent_roster WHERE agent_id = ?').get(agent.agent_id);
      store.upsertRosterEntry({
        agent_id: agent.agent_id,
        role: agent.role,
        capabilities_json: JSON.stringify(agent.capabilities ?? []),
        first_seen_at: agent.first_seen_at ?? existing?.first_seen_at ?? now,
        last_active_at: existing?.last_active_at ?? agent.first_seen_at ?? now,
        status: existing?.status ?? 'idle',
        task_number: existing?.task_number ?? null,
        last_done: existing?.last_done ?? null,
        updated_at: now,
        ...(operatorIdentityCol ? { operator_identity: agent.operator_identity ?? existing?.operator_identity ?? null } : {}),
      });
    }
    if (roster.default_reviewer_role) {
      store.upsertRosterEntry({
        agent_id: '_site',
        role: '_site',
        capabilities_json: JSON.stringify({ default_reviewer_role: roster.default_reviewer_role }),
        first_seen_at: now,
        last_active_at: now,
        status: 'idle',
        task_number: null,
        last_done: null,
        updated_at: now,
      });
    }
  } finally {
    store.db.close();
  }
}

async function runReverse() : Promise<any> {
  const roster: any = await loadRoster(cwd);
  if (!dryRun) {
    await writeRosterJson(cwd, roster);
  }
  console.log(JSON.stringify({
    schema: 'narada.task.roster_sync.v0',
    dry_run: dryRun,
    direction: 'reverse',
    status: 'success',
    agent_count: roster.agents.length,
    default_reviewer_role: roster.default_reviewer_role ?? null,
    note: dryRun ? 'Would write legacy full-roster compatibility projection.' : 'Legacy full-roster compatibility projection written.',
  }, null, 2));
}

try {
  if (reverse) {
    await runReverse();
  } else {
    await runForward();
  }
} catch (err: any) {
  console.error(JSON.stringify({
    schema: 'narada.task.roster_sync.v0',
    dry_run: dryRun,
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
}
