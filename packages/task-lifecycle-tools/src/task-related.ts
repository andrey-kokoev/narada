#!/usr/bin/env node
/**
 * CLI for finding related tasks by tag overlap.
 * Usage: node task-related.ts <cwd> <task-number> [--limit N]
 */

import { findRelatedTasks } from './task-relatedness.js';
import { join, resolve } from 'node:path';

function parseArgs(argv: any) : any {
  const args: any = { positional: [], limit: 8 };
  for (let i = 2; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg === '--limit') {
      args.limit = parseInt(argv[i + 1], 10);
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

if (isNaN(taskNumber)) {
  console.error('Usage: node task-related.ts <cwd> <task-number> [--limit N]');
  process.exit(1);
}

const result: any = findRelatedTasks({
  tasksDir: join(resolve(cwd), '.ai', 'do-not-open', 'tasks'),
  targetTaskNumber: taskNumber,
  limit: parsed.limit,
});

console.log(JSON.stringify(result, null, 2));
