import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { writeFileSync } from 'node:fs';

const cwd = process.argv[2] || process.cwd();
const statusFilter = process.argv[3] || null;

let outputFile = null;
for (let i = 4; i < process.argv.length; i++) {
  if (process.argv[i] === '--output-file' && process.argv[i + 1]) {
    outputFile = process.argv[i + 1];
    break;
  }
}

const store = openTaskLifecycleStore(cwd);
try {
  const tasks = store.getAllLifecycleWithDetails(statusFilter);

  const payload = {
    schema: 'narada.task.list.v0',
    count: tasks.length,
    status_filter: statusFilter,
    tasks: tasks.slice(0, 50)
  };
  const json = JSON.stringify(payload, null, 2);
  if (outputFile) { writeFileSync(outputFile, json, 'utf8'); }
  else { console.log(json); }
} finally {
  store.db.close();
}
