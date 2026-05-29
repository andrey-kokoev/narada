import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { closeTaskService } from '@narada2/task-governance/task-close-service';
import { readFileSync } from 'fs';

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      args.mode = argv[i + 1];
      i++;
    } else if (arg === '--no-continuation-needed') {
      args.noContinuationNeeded = argv[i + 1];
      i++;
    } else if (arg === '--tasks-file') {
      args.tasksFile = argv[i + 1];
      i++;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);
const cwd = parsed.positional[0] || process.cwd();

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

const agent = parsed.positional[2];
const reason = parsed.positional[3] || null;

if (taskNumbers.length === 0 || !agent) {
  console.error('Usage: node task-close.mjs <cwd> <task-number> <agent> [reason] [--mode <operator_direct|peer_reviewed|agent_finish|emergency>] [--no-continuation-needed <rationale>] [--tasks-file <path>]');
  process.exit(1);
}

const VALID_MODES = ['operator_direct', 'peer_reviewed', 'agent_finish', 'emergency'];
if (parsed.mode && !VALID_MODES.includes(parsed.mode)) {
  console.error(JSON.stringify({ status: 'error', error: `--mode must be one of: ${VALID_MODES.join(', ')}` }, null, 2));
  process.exit(1);
}

const results = [];
let hadError = false;
for (const taskNumber of taskNumbers) {
  const result = await closeTaskService({
    cwd,
    taskNumber,
    agent,
    reason,
    mode: parsed.mode || 'agent_finish',
    noContinuationNeeded: parsed.noContinuationNeeded,
  });
  const output = result.result || result;
  results.push({ task_number: taskNumber, ...output });
  if (result.exitCode && result.exitCode !== 0) {
    hadError = true;
  }
}

if (taskNumbers.length === 1) {
  console.log(JSON.stringify(results[0], null, 2));
} else {
  console.log(JSON.stringify({
    schema: 'narada.task.close_batch.v0',
    count: results.length,
    results,
  }, null, 2));
}
process.exit(hadError ? 1 : 0);
