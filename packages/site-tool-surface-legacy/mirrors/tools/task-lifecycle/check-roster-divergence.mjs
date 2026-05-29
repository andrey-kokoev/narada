import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { readFileSync } from 'fs';
import { join } from 'path';

const cwd = process.argv[2] || process.cwd();
const store = openTaskLifecycleStore(cwd);

function normalizeCapabilities(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

try {
  const jsonPath = join(cwd, '.ai', 'agents', 'roster.json');
  let jsonRoster;
  try {
    jsonRoster = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    jsonRoster = null;
  }

  const sqlRows = store.db.prepare("SELECT agent_id, role, capabilities_json, status, task_number, last_done FROM agent_roster WHERE agent_id != '_site' ORDER BY agent_id").all();
  const sqlSiteRow = store.db.prepare("SELECT capabilities_json FROM agent_roster WHERE agent_id = '_site'").get();
  let sqlDefaultReviewerRole = null;
  if (sqlSiteRow) {
    try {
      const caps = JSON.parse(sqlSiteRow.capabilities_json);
      sqlDefaultReviewerRole = caps.default_reviewer_role ?? null;
    } catch {
      sqlDefaultReviewerRole = null;
    }
  }

  const staticDivergences = [];
  const volatileFacts = [];

  const jsonDefaultReviewerRole = jsonRoster?.default_reviewer_role ?? null;
  if (jsonDefaultReviewerRole !== sqlDefaultReviewerRole) {
    staticDivergences.push({
      field: 'default_reviewer_role',
      json: jsonDefaultReviewerRole,
      sql: sqlDefaultReviewerRole,
      authority: 'static_json_imports_to_sql',
    });
  }

  const jsonAgents = new Map();
  if (jsonRoster?.agents) {
    for (const a of jsonRoster.agents) {
      jsonAgents.set(a.agent_id, {
        role: a.role,
        capabilities: normalizeCapabilities(a.capabilities),
        first_seen_at: a.first_seen_at ?? null,
      });
    }
  }

  const sqlAgents = new Map();
  for (const r of sqlRows) {
    sqlAgents.set(r.agent_id, {
      role: r.role,
      capabilities: normalizeCapabilities(r.capabilities_json),
      status: r.status ?? 'idle',
      task: r.task_number !== null && r.task_number !== undefined ? Number(r.task_number) : null,
      last_done: r.last_done !== null && r.last_done !== undefined ? Number(r.last_done) : null,
    });
  }

  for (const [agentId, jsonAgent] of jsonAgents) {
    const sqlAgent = sqlAgents.get(agentId);
    if (!sqlAgent) {
      staticDivergences.push({ agent_id: agentId, issue: 'agent_in_json_missing_in_sql', json: jsonAgent, sql: null });
      continue;
    }
    if (jsonAgent.role !== sqlAgent.role) {
      staticDivergences.push({ agent_id: agentId, issue: 'role_mismatch', json: jsonAgent.role, sql: sqlAgent.role });
    }
    if (JSON.stringify(jsonAgent.capabilities) !== JSON.stringify(sqlAgent.capabilities)) {
      staticDivergences.push({ agent_id: agentId, issue: 'capabilities_mismatch', json: jsonAgent.capabilities, sql: sqlAgent.capabilities });
    }
    volatileFacts.push({
      agent_id: agentId,
      status: sqlAgent.status,
      task: sqlAgent.task,
      last_done: sqlAgent.last_done,
      authority: 'sql_agent_roster',
    });
  }

  for (const [agentId, sqlAgent] of sqlAgents) {
    if (!jsonAgents.has(agentId)) {
      staticDivergences.push({ agent_id: agentId, issue: 'agent_in_sql_missing_in_json', json: null, sql: { role: sqlAgent.role, capabilities: sqlAgent.capabilities } });
    }
  }

  const result = {
    schema: 'narada.task.roster_divergence.v1',
    ok: staticDivergences.length === 0,
    static_divergences: staticDivergences.length,
    details: staticDivergences,
    volatile_facts: volatileFacts,
    json_agent_count: jsonAgents.size,
    sql_agent_count: sqlAgents.size,
    json_default_reviewer_role: jsonDefaultReviewerRole,
    sql_default_reviewer_role: sqlDefaultReviewerRole,
    authority_model: {
      static_roster_config: '.ai/agents/roster.json',
      volatile_roster_state: 'SQLite agent_roster',
      forward_sync: 'sync-roster.mjs imports static JSON fields into SQL without overwriting SQL volatile fields',
      reverse_sync: 'sync-roster.mjs --reverse writes a legacy full-roster compatibility projection only',
    },
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.db.close();
}
