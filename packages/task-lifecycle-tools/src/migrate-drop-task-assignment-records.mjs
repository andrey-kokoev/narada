import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');
const store = openTaskLifecycleStore(cwd);

let exitCode = 0;
MAIN: try {
  const tableExists = store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='task_assignment_records'"
  ).get();

  if (!tableExists) {
    console.log(JSON.stringify({
      schema: 'narada.task.migrate_drop_task_assignment_records.v0',
      dry_run: dryRun,
      dropped: false,
      ok: true,
      note: 'task_assignment_records table does not exist — already deprecated',
    }, null, 2));
    break MAIN;
  }

  if (!dryRun) {
    store.db.prepare('DROP TABLE IF EXISTS task_assignment_records').run();
  }

  console.log(JSON.stringify({
    schema: 'narada.task.migrate_drop_task_assignment_records.v0',
    dry_run: dryRun,
    dropped: true,
    ok: true,
    note: 'task_assignment_records table dropped — SQL task_assignments is the single authority',
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    schema: 'narada.task.migrate_drop_task_assignment_records.v0',
    dry_run: dryRun,
    dropped: false,
    ok: false,
    error: err.message,
  }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
