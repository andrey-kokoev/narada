import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');
const store = openTaskLifecycleStore(cwd);

function getDefaultReviewerRole() {
  const siteRow = store.db.prepare("SELECT capabilities_json FROM agent_roster WHERE agent_id = '_site'").get();
  if (siteRow) {
    let exitCode = 0;
MAIN: try {
      const caps = JSON.parse(siteRow.capabilities_json);
      return caps.default_reviewer_role || null;
    } catch {
      return null;
    }
  }
  return null;
}

try {
  const defaultReviewerRole = getDefaultReviewerRole();
  if (!defaultReviewerRole) {
    console.error(JSON.stringify({
      schema: 'narada.task.orphaned_obligation_migration.v0',
      status: 'error',
      error: 'No default_reviewer_role found in roster. Run sync-roster first.',
    }, null, 2));
    exitCode = 1;
    break MAIN;
  }

  const orphans = store.db.prepare(`
    SELECT obligation_id, task_id, task_number, source_ref, created_at
    FROM directed_obligations
    WHERE kind = 'review_request'
      AND target_agent_id IS NULL
      AND target_role IS NULL
      AND status = 'open'
  `).all();

  let routed = 0;
  let skipped = 0;

  for (const o of orphans) {
    // Skip if task is already closed
    const lifecycle = store.getLifecycle(o.task_id);
    if (lifecycle?.status === 'closed') {
      if (!dryRun) {
        store.db.prepare(`
          UPDATE directed_obligations
          SET status = 'completed', consumed_at = ?, consumed_by = 'migration', consumption_ref = 'migrate-orphaned-obligations'
          WHERE obligation_id = ?
        `).run(new Date().toISOString(), o.obligation_id);
      }
      skipped++;
      continue;
    }

    if (!dryRun) {
      store.db.prepare(`
        UPDATE directed_obligations
        SET target_role = ?, target_ref = 'default_reviewer', updated_at = ?
        WHERE obligation_id = ?
      `).run(defaultReviewerRole, new Date().toISOString(), o.obligation_id);
    }
    routed++;
  }

  console.log(JSON.stringify({
    schema: 'narada.task.orphaned_obligation_migration.v0',
    dry_run: dryRun,
    status: 'success',
    default_reviewer_role: defaultReviewerRole,
    orphans_found: orphans.length,
    routed_to_default_reviewer: routed,
    closed_because_task_closed: skipped,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    schema: 'narada.task.orphaned_obligation_migration.v0',
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
