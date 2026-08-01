import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada-core/task-governance/task-lifecycle-store';
import { releaseTaskService } from '@narada-core/task-governance/task-assignment-lifecycle-service';
import { readFileSync } from 'fs';
import { rosterOnUnclaim, withAuthoredRosterJsonPreserved } from './update-roster-agent.js';

const cwd: any = process.argv[2] || process.cwd();

function parseArgs(argv: any) : any {
  const args: any = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg === '--tasks-file') {
      args.tasksFile = argv[i + 1];
      i++;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed: any = parseArgs(process.argv);

const taskNumbers: any = [];
if (parsed.tasksFile) {
  const lines: any = readFileSync(parsed.tasksFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const num: any = parseInt(line.trim(), 10);
    if (!Number.isNaN(num)) taskNumbers.push(num);
  }
} else {
  const taskNumber: any = parseInt(parsed.positional[1], 10);
  if (!Number.isNaN(taskNumber)) taskNumbers.push(taskNumber);
}

const agent: any = parsed.positional[2] || null;
const reason: any = parsed.positional[3] || 'abandoned';

if (taskNumbers.length === 0) {
  console.error('Usage: node task-unclaim.ts <cwd> <task-number> [agent] [reason] [--tasks-file <path>]');
  process.exit(1);
}

const store: any = openTaskLifecycleStore(cwd);

const preflight: any = [];
for (const taskNumber of taskNumbers) {
  const lifecycle: any = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) {
    preflight.push({ taskNumber, ok: false, error: 'task_not_found', assignment: null });
    continue;
  }
  const assignment: any = store.getActiveAssignment(lifecycle.task_id);
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

const results: any = [];
let hadError: any = false;

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

  const result: any = await withAuthoredRosterJsonPreserved(cwd, async () : Promise<any> => {
    const serviceResult: any = await releaseTaskService({ cwd, taskNumber: item.taskNumber, reason });
    const serviceOutput: any = serviceResult.result || serviceResult;
    if (serviceOutput && typeof serviceOutput === 'object' && serviceOutput.status === 'success') {
      rosterOnUnclaim(cwd, item.assignment.agent_id);
    }
    return serviceResult;
  });
  const output: any = result.result || result;
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
