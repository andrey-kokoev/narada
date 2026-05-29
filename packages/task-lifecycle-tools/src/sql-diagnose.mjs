#!/usr/bin/env node
/**
 * sql-diagnose.mjs
 *
 * Run SQLite diagnostic queries against Narada Site databases.
 * Avoids PowerShell template-literal escaping by using a .mjs file.
 *
 * Usage:
 *   node tools/task-lifecycle/sql-diagnose.mjs <site-root> [--db task|inbox|agent-context] <sql-query>
 *
 * Example (from PowerShell — safe because query is passed as plain string):
 *   node tools/task-lifecycle/sql-diagnose.mjs . --db task "SELECT status, COUNT(*) FROM tasks GROUP BY status"
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Database } from '@narada2/control-plane';

const DB_PATHS = {
  task: ['.ai', 'task-lifecycle.db'],
  inbox: ['.ai', 'inbox.db'],
  'agent-context': ['.ai', 'state', 'agent-context.sqlite'],
};

function parseArgs(argv) {
  const args = { db: 'task' };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db') { args.db = argv[i + 1]; i++; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); }
  }
  return { args, positional };
}

function main() {
  const { args, positional } = parseArgs(process.argv);
  const siteRoot = resolve(positional[0] || process.cwd());
  const sql = positional.slice(1).join(' ');

  if (!sql) {
    console.log(JSON.stringify({
      schema: 'narada.sql.diagnose.v0',
      status: 'error',
      error: 'sql_query_required',
      usage: 'node tools/task-lifecycle/sql-diagnose.mjs <site-root> [--db task|inbox|agent-context] <sql-query>',
    }, null, 2));
    process.exit(1);
  }

  const segments = DB_PATHS[args.db];
  if (!segments) {
    console.log(JSON.stringify({
      schema: 'narada.sql.diagnose.v0',
      status: 'error',
      error: `unknown_db: ${args.db}`,
      available: Object.keys(DB_PATHS),
    }, null, 2));
    process.exit(1);
  }

  const dbPath = join(siteRoot, ...segments);
  if (!existsSync(dbPath)) {
    console.log(JSON.stringify({
      schema: 'narada.sql.diagnose.v0',
      status: 'error',
      error: `db_not_found: ${dbPath}`,
    }, null, 2));
    process.exit(1);
  }

  const db = new Database(dbPath);
  try {
    const rows = db.prepare(sql).all();
    console.log(JSON.stringify({
      schema: 'narada.sql.diagnose.v0',
      status: 'ok',
      site_root: siteRoot,
      db: args.db,
      db_path: dbPath,
      row_count: rows.length,
      rows,
    }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({
      schema: 'narada.sql.diagnose.v0',
      status: 'error',
      error: err.message,
    }, null, 2));
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
