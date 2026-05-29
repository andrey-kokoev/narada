import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');
const store = openTaskLifecycleStore(cwd);

function isoOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

let exitCode = 0;
MAIN: try {
  // task_assignment_records was deprecated after Task #126
  const tableExists = store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='task_assignment_records'"
  ).get();
  if (!tableExists) {
    console.log(JSON.stringify({
      schema: 'narada.task.assignment_migration.v0',
      dry_run: dryRun,
      inserted: 0,
      released: 0,
      skipped: 0,
      lifecycles_backfilled: 0,
      ok: true,
      note: 'task_assignment_records table already removed — nothing to migrate',
    }, null, 2));
    break MAIN;
  }

  const records = store.db.prepare("SELECT task_id, record_json FROM task_assignment_records").all();
  let inserted = 0;
  let released = 0;
  let skipped = 0;
  let lifecyclesBackfilled = 0;

  for (const record of records) {
    let jsonAssignments;
    try {
      jsonAssignments = JSON.parse(record.record_json).assignments || [];
    } catch {
      continue;
    }

    // Ensure lifecycle row exists for FK constraint
    const lifecycle = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_id = ?").get(record.task_id);
    if (!lifecycle) {
      const numMatch = record.task_id.match(/-(\d+)-/);
      let taskNum = numMatch ? Number(numMatch[1]) : null;
      // If number is null or already taken, allocate a unique fallback
      if (taskNum == null) {
        const maxRow = store.db.prepare("SELECT COALESCE(MAX(task_number), 0) AS max_num FROM task_lifecycle").get();
        taskNum = maxRow.max_num + 1;
      } else {
        const existing = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_number = ?").get(taskNum);
        if (existing) {
          const maxRow = store.db.prepare("SELECT COALESCE(MAX(task_number), 0) AS max_num FROM task_lifecycle").get();
          taskNum = maxRow.max_num + 1;
        }
      }
      if (!dryRun) {
        store.db.prepare(`
          INSERT INTO task_lifecycle (task_id, task_number, status, governed_by, closed_at, closed_by, reopened_at, reopened_by, continuation_packet_json, updated_at)
          VALUES (?, ?, 'opened', NULL, NULL, NULL, NULL, NULL, NULL, ?)
        `).run(record.task_id, taskNum, new Date().toISOString());
      }
      lifecyclesBackfilled++;
    }

    const sqlAssignments = store.db.prepare(
      "SELECT assignment_id, agent_id, claimed_at, released_at, release_reason, intent FROM task_assignments WHERE task_id = ? ORDER BY claimed_at"
    ).all(record.task_id);
    const sqlMap = new Map();
    for (const sa of sqlAssignments) {
      sqlMap.set(`${sa.agent_id}:${sa.claimed_at}`, sa);
    }

    for (const ja of jsonAssignments) {
      const key = `${ja.agent_id}:${ja.claimed_at}`;
      const match = sqlMap.get(key);
      if (!match) {
        // Missing in SQL — insert it
        if (!dryRun) {
          store.insertAssignment({
            assignment_id: `assign-${record.task_id}-${ja.agent_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            task_id: record.task_id,
            agent_id: ja.agent_id,
            claimed_at: ja.claimed_at,
            released_at: isoOrNull(ja.released_at),
            release_reason: isoOrNull(ja.release_reason),
            intent: ja.intent || 'primary',
          });
        }
        inserted++;
      } else if ((ja.released_at ?? null) !== (match.released_at ?? null)) {
        // Release status mismatch — JSON has release info that SQL lacks
        if (ja.released_at && !match.released_at) {
          if (!dryRun) {
            store.releaseAssignment(match.assignment_id, ja.release_reason || 'completed');
          }
          released++;
        } else if (!ja.released_at && match.released_at) {
          // SQL says released but JSON says not — since SQL is authority, leave it
          skipped++;
        }
      }
    }
  }

  console.log(JSON.stringify({
    schema: 'narada.task.assignment_migration.v0',
    dry_run: dryRun,
    inserted,
    released,
    skipped,
    lifecycles_backfilled: lifecyclesBackfilled,
    ok: true,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ schema: 'narada.task.assignment_migration.v0', status: 'error', error: err.message }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
