import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { isValidTransition, findTaskFile, readTaskFile, writeTaskProjection } from '@narada2/task-governance/task-governance';

const cwd = process.argv[2] || process.cwd();
const taskNumber = parseInt(process.argv[3], 10);
const agent = process.argv[4];
const reason = process.argv[5] || null;

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-reopen.mjs <cwd> <task-number> <agent> [reason]');
  process.exit(1);
}

const store = openTaskLifecycleStore(cwd);
const lifecycle = store.getLifecycleByNumber(taskNumber);
if (!lifecycle) {
  store.db.close();
  console.log(JSON.stringify({ status: 'error', error: 'task_not_found', task_number: taskNumber }, null, 2));
  process.exit(1);
}

if (!isValidTransition(lifecycle.status, 'opened')) {
  store.db.close();
  console.log(JSON.stringify({
    status: 'error',
    error: 'invalid_transition',
    task_number: taskNumber,
    from: lifecycle.status,
    to: 'opened',
    message: `Cannot transition from '${lifecycle.status}' to 'opened'.`,
  }, null, 2));
  process.exit(1);
}

store.updateStatus(lifecycle.task_id, 'opened', agent, { reason });

// Write front matter projection
(async () => {
  try {
    const taskFile = await findTaskFile(cwd, taskNumber);
    if (taskFile) {
      const { frontMatter, body } = await readTaskFile(taskFile.path);
      frontMatter.status = 'opened';
      await writeTaskProjection(taskFile.path, frontMatter, body);
    }
  } catch (e) {
    // Non-blocking
  }
  store.db.close();
  console.log(JSON.stringify({ status: 'reopened', task_number: taskNumber, task_id: lifecycle.task_id }, null, 2));
})();
