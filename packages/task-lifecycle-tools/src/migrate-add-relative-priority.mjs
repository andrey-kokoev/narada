#!/usr/bin/env node
/**
 * migrate-add-relative-priority.mjs
 *
 * Standalone migration for task_lifecycle schema:
 *   - Adds relative_priority (integer, default 0)
 *   - Adds priority_reason (text)
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   node tools/task-lifecycle/migrate-add-relative-priority.mjs [<cwd>] [--dry-run]
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from '@narada2/sqlite';

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');

const dbPath = resolve(cwd, '.ai', 'task-lifecycle.db');
if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ status: 'error', error: 'db_not_found', path: dbPath }));
  process.exit(1);
}

const db = new Database(dbPath);

try {
  const columns = db.prepare("pragma table_info(task_lifecycle)").all();
  const hasRelativePriority = columns.some((c) => c.name === 'relative_priority');
  const hasPriorityReason = columns.some((c) => c.name === 'priority_reason');

  const actions = [];

  if (!hasRelativePriority) {
    if (!dryRun) {
      db.exec('ALTER TABLE task_lifecycle ADD COLUMN relative_priority INTEGER DEFAULT 0;');
    }
    actions.push('added_relative_priority');
  } else {
    actions.push('relative_priority_already_present');
  }

  if (!hasPriorityReason) {
    if (!dryRun) {
      db.exec('ALTER TABLE task_lifecycle ADD COLUMN priority_reason TEXT;');
    }
    actions.push('added_priority_reason');
  } else {
    actions.push('priority_reason_already_present');
  }

  console.log(JSON.stringify({
    status: dryRun ? 'dry_run' : 'success',
    db_path: dbPath,
    actions,
    dry_run: dryRun,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
  process.exit(1);
} finally {
  db.close();
}
