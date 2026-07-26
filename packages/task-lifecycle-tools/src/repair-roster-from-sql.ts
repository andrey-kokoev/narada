import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd: any = process.argv[2] || process.cwd();
const rosterPath: any = join(cwd, '.ai', 'agents', 'roster.json');
const roster: any = JSON.parse(readFileSync(rosterPath, 'utf8'));
const store: any = openTaskLifecycleStore(cwd);

try {
  for (const agent of roster.agents) {
    const agentId: any = agent.agent_id;
    const active: any = store.db.prepare('SELECT tl.task_number FROM task_assignments ta JOIN task_lifecycle tl ON ta.task_id = tl.task_id WHERE ta.agent_id = ? AND ta.released_at IS NULL ORDER BY ta.claimed_at DESC LIMIT 1').all(agentId);
    const lastDone: any = store.db.prepare('SELECT tl.task_number FROM task_reports tr JOIN task_lifecycle tl ON tr.task_id = tl.task_id WHERE tr.agent_id = ? ORDER BY tr.submitted_at DESC LIMIT 1').get(agentId);

    if (active.length > 0) {
      agent.status = 'working';
      agent.task = active[0].task_number;
    } else {
      agent.status = agent.last_done ? 'done' : 'idle';
      agent.task = null;
    }
    agent.last_done = lastDone ? lastDone.task_number : (agent.last_done ?? null);
    agent.last_active_at = new Date().toISOString();
  }
  roster.updated_at = new Date().toISOString();
  writeFileSync(rosterPath, JSON.stringify(roster, null, 2), 'utf8');
  console.log(JSON.stringify({ status: 'success', note: 'Roster repaired from SQL state.' }, null, 2));
} finally {
  store.db.close();
}
