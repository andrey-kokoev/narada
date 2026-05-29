#!/usr/bin/env node
/**
 * migrate-task-reports.mjs
 *
 * Migrate historical data from task_report_records (deprecated JSON blob)
 * to task_reports (normalized table).
 *
 * Usage:
 *   node tools/task-lifecycle/migrate-task-reports.mjs [--dry-run]
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveBetterSqlite3() {
  try { return require('better-sqlite3'); } catch {
    try { return require(resolve(process.cwd(), 'node_modules', 'better-sqlite3')); } catch {
      try { return require(resolve(process.cwd(), 'node_modules', '.pnpm', 'node_modules', 'better-sqlite3')); } catch {
        try { return require(resolve(process.cwd(), 'tools', 'agent-context', 'node_modules', 'better-sqlite3')); } catch {
          return require(resolve(process.cwd(), 'tools', 'incubation', 'node_modules', 'better-sqlite3'));
        }
      }
    }
  }
}

const Database = resolveBetterSqlite3();

const cwd = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');

const dbPath = `${cwd}/.ai/task-lifecycle.db`;
if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ status: 'error', error: 'db_not_found', path: dbPath }));
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Count source and target
  const sourceCount = db.prepare('SELECT COUNT(*) as c FROM task_report_records').get().c;
  const targetCount = db.prepare('SELECT COUNT(*) as c FROM task_reports').get().c;

  console.error(`Source (task_report_records): ${sourceCount} rows`);
  console.error(`Target (task_reports): ${targetCount} rows`);

  if (targetCount > 0) {
    console.error('Target table already has data. Aborting to avoid duplicates.');
    process.exit(1);
  }

  if (sourceCount === 0) {
    console.error('No source data to migrate.');
    process.exit(0);
  }

  const rows = db.prepare('SELECT * FROM task_report_records ORDER BY reported_at').all();
  const insertStmt = db.prepare(`
    INSERT INTO task_reports (
      report_id, task_id, agent_id, summary, changed_files_json, verification_json, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET
      task_id = excluded.task_id,
      agent_id = excluded.agent_id,
      summary = excluded.summary,
      changed_files_json = excluded.changed_files_json,
      verification_json = excluded.verification_json,
      submitted_at = excluded.submitted_at
  `);

  let migrated = 0;
  let errors = 0;

  const migrateOne = db.transaction((row) => {
    let summary = '';
    let changedFilesJson = null;
    let verificationJson = null;

    try {
      const parsed = JSON.parse(row.report_json);
      summary = parsed.summary ?? '';
      if (Array.isArray(parsed.changed_files)) {
        changedFilesJson = JSON.stringify(parsed.changed_files);
      }
      if (parsed.verification !== undefined) {
        verificationJson = JSON.stringify(parsed.verification);
      }
    } catch {
      summary = row.report_json.slice(0, 500);
    }

    insertStmt.run(
      row.report_id,
      row.task_id,
      row.agent_id,
      summary,
      changedFilesJson,
      verificationJson,
      row.reported_at
    );
  });

  for (const row of rows) {
    try {
      if (!dryRun) {
        migrateOne(row);
      }
      migrated++;
    } catch (err) {
      console.error(`Error migrating ${row.report_id}: ${err.message}`);
      errors++;
    }
  }

  const finalTargetCount = dryRun ? 0 : db.prepare('SELECT COUNT(*) as c FROM task_reports').get().c;

  console.log(JSON.stringify({
    status: dryRun ? 'dry_run' : 'success',
    migrated,
    errors,
    source_count: sourceCount,
    target_count_before: targetCount,
    target_count_after: finalTargetCount,
  }, null, 2));

  process.exit(errors > 0 ? 1 : 0);
} finally {
  db.close();
}
