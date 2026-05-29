import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');
const store = openTaskLifecycleStore(cwd);

try {
  const staleRows = store.db.prepare(`
    SELECT o.obligation_id, o.task_id, o.task_number, o.source_ref, o.created_at
    FROM directed_obligations o
    JOIN task_lifecycle t ON o.task_id = t.task_id
    WHERE o.kind = 'review_request'
      AND o.status = 'open'
      AND t.status IN ('closed', 'confirmed')
  `).all();

  let consumed = 0;
  for (const row of staleRows) {
    if (!dryRun) {
      store.transitionDirectedObligation(
        row.obligation_id,
        'completed',
        'migration',
        'migrate-stale-review-obligations'
      );
    }
    consumed++;
  }

  console.log(JSON.stringify({
    schema: 'narada.task.stale_obligation_migration.v0',
    dry_run: dryRun,
    status: 'success',
    stale_found: staleRows.length,
    consumed: consumed,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    schema: 'narada.task.stale_obligation_migration.v0',
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
} finally {
  store.db.close();
}
