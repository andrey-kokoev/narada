import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { pathToFileURL } from 'url';
import { readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const cwd = process.argv[2] || process.cwd();
const flag = process.argv[3] || null;
const arg = process.argv[4] || null;
const hasUnsafeEval = process.argv.includes('--unsafe-eval');

const store = openTaskLifecycleStore(cwd);
const db = store.db;

let exitCode = 0;
MAIN: try {
  if (flag === '--sql') {
    if (!arg) {
      console.error('Usage: node task-admin.mjs <cwd> --sql <sql-string>');
      exitCode = 1;
      break MAIN;
    }
    // Support reading the SQL string from remaining args (in case of spaces)
    const sql = process.argv.slice(4).join(' ');
    const isSelect = /^\s*SELECT/i.test(sql);
    const stmt = db.prepare(sql);
    const result = isSelect ? stmt.all() : stmt.run();
    console.log(JSON.stringify({
      schema: 'narada.task.admin.sql.v0',
      sql: sql,
      result: result
    }, null, 2));
    break MAIN;
  }

  if (flag === '--eval') {
    if (!hasUnsafeEval) {
      console.error(JSON.stringify({
        status: 'error',
        error: '--eval requires --unsafe-eval. This is a security guard against arbitrary code execution. Pass --unsafe-eval if you accept the risk.',
      }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    if (!arg) {
      console.error('Usage: node task-admin.mjs <cwd> --eval <js-expression> --unsafe-eval');
      exitCode = 1;
      break MAIN;
    }
    const expr = process.argv.slice(4).filter(a => a !== '--unsafe-eval').join(' ');
    const fn = new Function('store', 'db', 'return (' + expr + ')');
    const result = fn(store, db);
    console.log(JSON.stringify({
      schema: 'narada.task.admin.eval.v0',
      expression: expr,
      result: result
    }, null, 2));
    break MAIN;
  }

  if (flag === '--file') {
    if (!arg) {
      console.error('Usage: node task-admin.mjs <cwd> --file <script-path>');
      exitCode = 1;
      break MAIN;
    }
    const filePath = arg;
    let mod;
    try {
      mod = await import(pathToFileURL(filePath).href);
    } catch (e) {
      // Fallback: if not an ES module, read and eval in context
      if (!hasUnsafeEval) {
        console.error(JSON.stringify({
          status: 'error',
          error: '--file fallback eval requires --unsafe-eval. This is a security guard against arbitrary code execution from non-ES module files. Pass --unsafe-eval if you accept the risk.',
        }, null, 2));
        exitCode = 1;
        break MAIN;
      }
      const source = readFileSync(filePath, 'utf-8');
      const fn = new Function('store', 'db', source);
      const result = fn(store, db);
      console.log(JSON.stringify({
        schema: 'narada.task.admin.file.v0',
        path: filePath,
        result: result ?? null
      }, null, 2));
      break MAIN;
    }
    // If the module exports a default function, invoke it with store/db
    if (typeof mod.default === 'function') {
      const result = await mod.default({ store, db });
      console.log(JSON.stringify({
        schema: 'narada.task.admin.file.v0',
        path: filePath,
        result: result ?? null
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        schema: 'narada.task.admin.file.v0',
        path: filePath,
        result: null,
        note: 'Module imported successfully. No default export function to invoke.'
      }, null, 2));
    }
    break MAIN;
  }

  if (flag === '--audit') {
    const args = process.argv.slice(4);
    let since = null;
    let until = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--since' && i + 1 < args.length) { since = args[i + 1]; i++; }
      if (args[i] === '--until' && i + 1 < args.length) { until = args[i + 1]; i++; }
    }
    const now = new Date();
    const defaultSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sinceVal = since || defaultSince;
    const untilVal = until || now.toISOString();
    const sql = `
      SELECT 'claim' AS event_type, CAST(ai.task_number AS TEXT) AS task, ai.agent_id AS actor, ai.requested_at AS occurred_at, ai.status AS result, ai.assignment_id AS ref
      FROM assignment_intents ai
      WHERE ai.kind = 'claim' AND ai.requested_at >= ? AND ai.requested_at <= ?
      UNION ALL
      SELECT 'report', CAST(tl.task_number AS TEXT), tr.agent_id, tr.submitted_at, 'submitted', tr.report_id
      FROM task_reports tr
      JOIN task_lifecycle tl ON tl.task_id = tr.task_id
      WHERE tr.submitted_at >= ? AND tr.submitted_at <= ?
      UNION ALL
      SELECT 'review', CAST(tl.task_number AS TEXT), rv.reviewer_agent_id, rv.reviewed_at, rv.verdict, rv.review_id
      FROM task_reviews rv
      JOIN task_lifecycle tl ON tl.task_id = rv.task_id
      WHERE rv.reviewed_at >= ? AND rv.reviewed_at <= ?
      UNION ALL
      SELECT 'admission', CAST(task_number AS TEXT), admitted_by, admitted_at, verdict, admission_id
      FROM evidence_admission_results
      WHERE admitted_at >= ? AND admitted_at <= ?
      UNION ALL
      SELECT 'close', CAST(task_number AS TEXT), closed_by, closed_at, closure_mode, task_id
      FROM task_lifecycle
      WHERE closed_at IS NOT NULL AND closed_at >= ? AND closed_at <= ?
      ORDER BY occurred_at DESC
    `;
    const stmt = db.prepare(sql);
    const rows = stmt.all(sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal);
    console.log(JSON.stringify({
      schema: 'narada.task.admin.audit.v0',
      since: sinceVal,
      until: untilVal,
      count: rows.length,
      events: rows
    }, null, 2));
    break MAIN;
  }

  if (flag === '--delete-task') {
    const taskNumber = arg ? Number(arg) : null;
    const confirmed = process.argv.includes('--confirm');
    if (!taskNumber || Number.isNaN(taskNumber)) {
      console.error('Usage: node task-admin.mjs <cwd> --delete-task <task-number> --confirm');
      exitCode = 1;
      break MAIN;
    }
    if (!confirmed) {
      console.error(JSON.stringify({
        status: 'error',
        error: 'Deletion requires --confirm. This action is irreversible.',
      }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      console.error(JSON.stringify({ status: 'error', error: `Task not found: ${taskNumber}` }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const taskId = lifecycle.task_id;
    const taskFilePath = resolve(cwd, '.ai', 'do-not-open', 'tasks', `${taskId}.md`);
    // Delete DB rows
    db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM task_reports WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM task_report_records WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM task_reviews WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM evidence_admission_results WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM evidence_bundles WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM criteria_proofs WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM task_specs WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM observation_artifacts WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM directed_obligations WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM task_lifecycle WHERE task_id = ?').run(taskId);
    // Delete file
    try {
      if (existsSync(taskFilePath)) {
        // Use fs.unlinkSync via Node.js fs module — already imported renameSync, mkdirSync, existsSync
        const { unlinkSync } = await import('fs');
        unlinkSync(taskFilePath);
      }
    } catch (fileErr) {
      console.error(JSON.stringify({ status: 'error', error: `DB rows deleted but failed to remove file: ${fileErr.message}` }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    console.log(JSON.stringify({
      status: 'deleted',
      task_number: taskNumber,
      task_id: taskId,
      schema: 'narada.task.admin.delete.v0',
    }, null, 2));
    break MAIN;
  }

  if (flag === '--archive-task') {
    const taskNumber = arg ? Number(arg) : null;
    if (!taskNumber || Number.isNaN(taskNumber)) {
      console.error('Usage: node task-admin.mjs <cwd> --archive-task <task-number>');
      exitCode = 1;
      break MAIN;
    }
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      console.error(JSON.stringify({ status: 'error', error: `Task not found: ${taskNumber}` }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const taskId = lifecycle.task_id;
    const taskFilePath = resolve(cwd, '.ai', 'do-not-open', 'tasks', `${taskId}.md`);
    const archiveDir = resolve(cwd, '.ai', 'do-not-open', 'tasks', 'archive');
    const archivePath = join(archiveDir, `${taskId}.md`);
    mkdirSync(archiveDir, { recursive: true });
    renameSync(taskFilePath, archivePath);
    store.updateStatus(taskId, 'archived', null, { archived_at: new Date().toISOString() });
    console.log(JSON.stringify({
      status: 'archived',
      task_number: taskNumber,
      task_id: taskId,
      archived_path: archivePath,
      schema: 'narada.task.admin.archive.v0',
    }, null, 2));
    break MAIN;
  }

  if (flag === '--cleanup-intents') {
    const days = arg ? Number(arg) : 90;
    if (Number.isNaN(days) || days < 1) {
      console.error('Usage: node task-admin.mjs <cwd> --cleanup-intents [<days>]');
      exitCode = 1;
      break MAIN;
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare('DELETE FROM assignment_intents WHERE requested_at < ?').run(cutoff);
    console.log(JSON.stringify({
      schema: 'narada.task.admin.cleanup_intents.v0',
      days,
      cutoff,
      deleted: result.changes,
    }, null, 2));
    break MAIN;
  }

  console.error('Usage: node task-admin.mjs <cwd> [--sql <sql> | --eval <expr> --unsafe-eval | --file <path> | --audit [--since <iso>] [--until <iso>] | --delete-task <n> --confirm | --archive-task <n> | --cleanup-intents [<days>]]');
  exitCode = 1;
} catch (err) {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
