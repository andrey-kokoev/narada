#!/usr/bin/env node
/**
 * CLI for finding related tasks by tag overlap.
 * Usage: node task-related.mjs <cwd> <task-number> [--limit N]
 */

import { findRelatedTasks } from './task-relatedness.mjs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const args = { positional: [], limit: 8 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      args.limit = parseInt(argv[i + 1], 10);
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

if (isNaN(taskNumber)) {
  console.error('Usage: node task-related.mjs <cwd> <task-number> [--limit N]');
  process.exit(1);
}

const result = findRelatedTasks({
  tasksDir: join(resolve(cwd), '.ai', 'do-not-open', 'tasks'),
  targetTaskNumber: taskNumber,
  limit: parsed.limit,
});

console.log(JSON.stringify(result, null, 2));
