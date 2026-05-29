import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { continueTaskService, ALLOWED_CONTINUATION_REASONS } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const cwd = process.argv[2] || process.cwd();
const taskNumber = parseInt(process.argv[3], 10);
const agent = process.argv[4];
const reason = process.argv[5] || null;

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-continue.mjs <cwd> <task-number> <agent> [reason]');
  process.exit(1);
}

// Guard: suggest reopen if task is deferred
let store;
try {
  store = openTaskLifecycleStore(cwd);
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (lifecycle && lifecycle.status === 'deferred') {
    console.error(JSON.stringify({
      status: 'error',
      error: 'task_is_deferred',
      message: `Task ${taskNumber} is deferred. Use task-reopen.mjs (or task_mcp_reopen MCP tool) before continuing.`,
      hint: `node tools/task-lifecycle/task-reopen.mjs ${cwd} ${taskNumber} ${agent}`,
    }, null, 2));
    process.exit(1);
  }
} catch {
  // Best-effort guard; proceed if store cannot be opened
} finally {
  if (store) store.db.close();
}

if (reason && !ALLOWED_CONTINUATION_REASONS.includes(reason)) {
  console.error(JSON.stringify({
    status: 'error',
    error: 'invalid_continuation_reason',
    reason,
    allowed: ALLOWED_CONTINUATION_REASONS,
    message: `Invalid continuation reason '${reason}'. Must be one of: ${ALLOWED_CONTINUATION_REASONS.join(', ')}.`,
  }, null, 2));
  process.exit(1);
}

const result = await continueTaskService({ cwd, taskNumber, agent, reason });
console.log(JSON.stringify(result.result || result, null, 2));
process.exit(result.exitCode || 0);
