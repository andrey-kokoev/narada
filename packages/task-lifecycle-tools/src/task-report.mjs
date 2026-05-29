import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { reportTaskService } from '@narada2/task-governance/task-report-service';
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--summary-file') {
      args.summaryFile = argv[i + 1];
      i++;
    } else if (arg === '--changed-files-file') {
      args.changedFilesFile = argv[i + 1];
      i++;
    } else if (arg === '--verification-file') {
      args.verificationFile = argv[i + 1];
      i++;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);
const cwd = parsed.positional[0] || process.cwd();
const taskNumber = parseInt(parsed.positional[1], 10);
const agent = parsed.positional[2];
let summary = parsed.positional[3] || null;
let changedFiles = parsed.positional[4] || null;
let verification = parsed.positional[5] || null;

if (parsed.summaryFile) {
  if (summary) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline summary and --summary-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    summary = readFileSync(parsed.summaryFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read summary file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (parsed.changedFilesFile) {
  if (changedFiles) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline changed-files and --changed-files-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    changedFiles = readFileSync(parsed.changedFilesFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read changed files file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (parsed.verificationFile) {
  if (verification) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline verification and --verification-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    verification = readFileSync(parsed.verificationFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read verification file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-report.mjs <cwd> <task-number> <agent> [summary] [changed-files-json] [verification-json] [--summary-file <path>] [--changed-files-file <path>] [--verification-file <path>]');
  process.exit(1);
}

const result = await reportTaskService({ cwd, taskNumber, agent, summary, changedFiles, verification });
console.log(JSON.stringify(result.result || result, null, 2));
process.exit(result.exitCode || 0);
