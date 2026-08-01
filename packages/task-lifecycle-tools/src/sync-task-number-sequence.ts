import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada-core/task-governance/task-lifecycle-store';

const cwd: any = process.argv[2] || process.cwd();

const store: any = openTaskLifecycleStore(cwd);
try {
  const row: any = store.db
    .prepare('select coalesce(max(task_number), 0) as max_task_number from task_lifecycle')
    .get();
  const dbMax: any = row?.max_task_number ?? 0;

  const seqRow: any = store.db
    .prepare('select last_allocated from task_number_sequence where singleton = 1')
    .get();
  const lastAllocated: any = seqRow?.last_allocated ?? 0;

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
} catch (err: any) {
  console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
} finally {
  store.db.close();
}
