import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();

const store = openTaskLifecycleStore(cwd);
try {
  const row = store.db
    .prepare('select coalesce(max(task_number), 0) as max_task_number from task_lifecycle')
    .get();
  const dbMax = row?.max_task_number ?? 0;

  const seqRow = store.db
    .prepare('select last_allocated from task_number_sequence where singleton = 1')
    .get();
  const lastAllocated = seqRow?.last_allocated ?? 0;

  if (lastAllocated < dbMax) {
    store.db
      .prepare('update task_number_sequence set last_allocated = ? where singleton = 1')
      .run(dbMax);
    console.log(JSON.stringify({
      status: 'synced',
      previous_last_allocated: lastAllocated,
      new_last_allocated: dbMax,
      max_task_number: dbMax,
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      status: 'ok',
      last_allocated: lastAllocated,
      max_task_number: dbMax,
    }, null, 2));
  }
} catch (err) {
  console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
} finally {
  store.db.close();
}
