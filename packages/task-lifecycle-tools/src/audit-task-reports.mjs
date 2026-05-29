import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

const cwd = process.argv[2] || process.cwd();
const store = openTaskLifecycleStore(cwd);

try {
  const rows = store.db.prepare(`
    SELECT r.report_id, r.task_id, t.task_number, r.agent_id, r.submitted_at, r.summary, r.changed_files_json
    FROM task_reports r
    JOIN task_lifecycle t ON r.task_id = t.task_id
    ORDER BY r.submitted_at DESC
  `).all();

  const results = [];
  for (const row of rows) {
    let changedFiles = [];
    try {
      if (row.changed_files_json) {
        changedFiles = JSON.parse(row.changed_files_json);
      }
    } catch {
      results.push({ report_id: row.report_id, task_number: row.task_number, agent_id: row.agent_id, reported_at: row.submitted_at, ok: false, reason: 'unparseable changed_files_json' });
      continue;
    }
    const missing = [];
    for (const f of changedFiles) {
      const path = resolve(join(cwd, f));
      if (!existsSync(path)) {
        missing.push(f);
      }
    }
    results.push({
      report_id: row.report_id,
      task_number: row.task_number,
      agent_id: row.agent_id,
      reported_at: row.submitted_at,
      ok: missing.length === 0,
      missing_files: missing.length > 0 ? missing : undefined,
      summary: row.summary || '(no summary)',
    });
  }

  console.log(JSON.stringify({ schema: 'narada.task.report_audit.v0', count: results.length, results }, null, 2));
} finally {
  store.db.close();
}
