import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { writeFileSync } from 'node:fs';

const cwd: any = process.argv[2] || process.cwd();
const statusFilter: any = process.argv[3] || null;

let outputFile: any = null;
for (let i = 4; i < process.argv.length; i++) {
  if (process.argv[i] === '--output-file' && process.argv[i + 1]) {
    outputFile = process.argv[i + 1];
    break;
  }
}

const store: any = openTaskLifecycleStore(cwd);
try {
  const tasks: any = store.getAllLifecycleWithDetails(statusFilter);

  const payload: any = {
    schema: 'narada.task.list.v0',
    count: tasks.length,
    status_filter: statusFilter,
    tasks: tasks.slice(0, 50)
  };
  const json: any = JSON.stringify(payload, null, 2);
  if (outputFile) { writeFileSync(outputFile, json, 'utf8'); }
  else { console.log(json); }
} finally {
  store.db.close();
}
