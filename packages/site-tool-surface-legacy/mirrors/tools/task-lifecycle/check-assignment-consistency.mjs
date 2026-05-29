import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const store = openTaskLifecycleStore(cwd);

let exitCode = 0;
MAIN: try {
  // task_assignment_records was deprecated after Task #126
  const tableExists = store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='task_assignment_records'"
  ).get();
  if (!tableExists) {
    console.log(JSON.stringify({
      schema: 'narada.task.assignment_consistency.v1',
      divergences: 0,
      details: [],
      ok: true,
      note: 'task_assignment_records table already removed — SQL task_assignments is the single authority',
    }, null, 2));
    break MAIN;
  }

  const divergences = [];
  const records = store.db.prepare("SELECT task_id, record_json FROM task_assignment_records").all();

  for (const record of records) {
    let jsonAssignments;
    try {
      jsonAssignments = JSON.parse(record.record_json).assignments || [];
    } catch {
      continue;
    }
    const sqlAssignments = store.db.prepare(
      "SELECT agent_id, claimed_at, released_at, release_reason, intent FROM task_assignments WHERE task_id = ? ORDER BY claimed_at"
    ).all(record.task_id);

    // Authority check: JSON claims released but SQL does not → authority is missing data
    for (const ja of jsonAssignments) {
      const match = sqlAssignments.find(
        (sa) => sa.agent_id === ja.agent_id && sa.claimed_at === ja.claimed_at
      );
      if (!match) {
        divergences.push({
          task_id: record.task_id,
          issue: 'JSON assignment missing in SQL authority',
          agent_id: ja.agent_id,
          claimed_at: ja.claimed_at,
        });
      } else if ((ja.released_at ?? null) !== null && (match.released_at ?? null) === null) {
        // JSON says released, SQL says not → SQL authority is stale
        divergences.push({
          task_id: record.task_id,
          issue: 'JSON released but SQL authority not released',
          agent_id: ja.agent_id,
          claimed_at: ja.claimed_at,
          json_released: ja.released_at,
          sql_released: match.released_at,
        });
      }
      // Note: we do NOT flag SQL-released-but-JSON-not because SQL is the authority
    }
  }

  console.log(JSON.stringify({
    schema: 'narada.task.assignment_consistency.v1',
    divergences: divergences.length,
    details: divergences,
    ok: divergences.length === 0,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ schema: 'narada.task.assignment_consistency.v1', status: 'error', error: err.message }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
