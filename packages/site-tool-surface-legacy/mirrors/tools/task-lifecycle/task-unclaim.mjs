import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { releaseTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { readFileSync } from 'fs';
import { rosterOnUnclaim, withAuthoredRosterJsonPreserved } from './update-roster-agent.mjs';

const cwd = process.argv[2] || process.cwd();

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tasks-file') {
      args.tasksFile = argv[i + 1];
      i++;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);

const taskNumbers = [];
if (parsed.tasksFile) {
  const lines = readFileSync(parsed.tasksFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const num = parseInt(line.trim(), 10);
    if (!Number.isNaN(num)) taskNumbers.push(num);
  }
} else {
  const taskNumber = parseInt(parsed.positional[1], 10);
  if (!Number.isNaN(taskNumber)) taskNumbers.push(taskNumber);
}

const agent = parsed.positional[2] || null;
const reason = parsed.positional[3] || 'abandoned';

if (taskNumbers.length === 0) {
  console.error('Usage: node task-unclaim.mjs <cwd> <task-number> [agent] [reason] [--tasks-file <path>]');
  process.exit(1);
}

const store = openTaskLifecycleStore(cwd);

const preflight = [];
for (const taskNumber of taskNumbers) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) {
    preflight.push({ taskNumber, ok: false, error: 'task_not_found', assignment: null });
    continue;
  }
  const assignment = store.getActiveAssignment(lifecycle.task_id);
  if (!assignment) {
    preflight.push({ taskNumber, ok: false, error: 'no_op', assignment: null, lifecycle });
    continue;
  }
  if (agent && assignment.agent_id !== agent) {
    preflight.push({ taskNumber, ok: false, error: 'agent_mismatch', assignment, lifecycle });
    continue;
  }
  preflight.push({ taskNumber, ok: true, assignment, lifecycle });
}
store.db.close();

const results = [];
let hadError = false;

for (const item of preflight) {
  if (!item.ok) {
    if (item.error === 'no_op') {
      results.push({
        task_number: item.taskNumber,
        status: 'success',
        task_id: item.lifecycle.task_id,
        action: 'no_op',
        previous_status: item.lifecycle.status,
        message: `Task ${item.taskNumber} has no active assignment. Nothing to unclaim.`,
      });
    } else if (item.error === 'task_not_found') {
      results.push({
        task_number: item.taskNumber,
        status: 'error',
        error: 'task_not_found',
        message: `Task ${item.taskNumber} not found.`,
      });
      hadError = true;
    } else if (item.error === 'agent_mismatch') {
      results.push({
        task_number: item.taskNumber,
        status: 'error',
        error: 'agent_mismatch',
        assigned_agent: item.assignment.agent_id,
        requesting_agent: agent,
        message: `Task ${item.taskNumber} is assigned to '${item.assignment.agent_id}'. Cannot unclaim as '${agent}'.`,
      });
      hadError = true;
    }
    continue;
  }

  const result = await withAuthoredRosterJsonPreserved(cwd, async () => {
    const serviceResult = await releaseTaskService({ cwd, taskNumber: item.taskNumber, reason });
    const serviceOutput = serviceResult.result || serviceResult;
    if (serviceOutput && typeof serviceOutput === 'object' && serviceOutput.status === 'success') {
      rosterOnUnclaim(cwd, item.assignment.agent_id);
    }
    return serviceResult;
  });
  const output = result.result || result;
  if (output && typeof output === 'object' && output.status === 'success') {
    output.action = 'unclaimed';
    output.previous_assignee = item.assignment.agent_id;
  }
  results.push({ task_number: item.taskNumber, ...output });
  if (result.exitCode && result.exitCode !== 0) {
    hadError = true;
  }
}

if (taskNumbers.length === 1) {
  console.log(JSON.stringify(results[0], null, 2));
} else {
  console.log(JSON.stringify({
    schema: 'narada.task.unclaim_batch.v0',
    count: results.length,
    results,
  }, null, 2));
}
process.exit(hadError ? 1 : 0);
