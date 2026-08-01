import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { reportTaskService } from '@narada-core/task-governance/task-report-service';
import { readFileSync } from 'node:fs';

function parseArgs(argv: any) : any {
  const args: any = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg: any = argv[i];
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

const parsed: any = parseArgs(process.argv);
const cwd: any = parsed.positional[0] || process.cwd();
const taskNumber: any = parseInt(parsed.positional[1], 10);
const agent: any = parsed.positional[2];
let summary: any = parsed.positional[3] || null;
let changedFiles: any = parsed.positional[4] || null;
let verification: any = parsed.positional[5] || null;

if (parsed.summaryFile) {
  if (summary) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline summary and --summary-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    summary = readFileSync(parsed.summaryFile, 'utf8');
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read verification file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-report.ts <cwd> <task-number> <agent> [summary] [changed-files-json] [verification-json] [--summary-file <path>] [--changed-files-file <path>] [--verification-file <path>]');
  process.exit(1);
}

const result: any = await reportTaskService({ cwd, taskNumber, agent, summary, changedFiles, verification });
console.log(JSON.stringify(result.result || result, null, 2));
process.exit(result.exitCode || 0);
