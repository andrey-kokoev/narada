import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { writeFileSync } from 'node:fs';

const cwd = process.argv[2] || process.cwd();

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '').replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { args, positional };
}

const { args } = parseArgs(process.argv);

const store = openTaskLifecycleStore(cwd);

let exitCode = 0;
MAIN: try {
  function emit(data) {
    const json = JSON.stringify(data, null, 2);
    if (args.output_file) { writeFileSync(args.output_file, json, 'utf8'); }
    else { console.log(json); }
  }

  if (args.tables) {
    const rows = store.db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all();
    emit({
      schema: 'narada.task.inspect.tables.v0',
      count: rows.length,
      tables: rows.map(r => r.name),
      entries: rows,
    });
    break MAIN;
  }

  if (args.table) {
    const tableName = args.table;
    const columns = store.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const indexes = store.db.prepare(`PRAGMA index_list(${tableName})`).all();
    emit({
      schema: 'narada.task.inspect.table.v0',
      table: tableName,
      columns: columns.map(c => ({
        cid: c.cid,
        name: c.name,
        type: c.type,
        notnull: c.notnull === 1,
        default_value: c.dflt_value,
        primary_key: c.pk === 1,
      })),
      indexes: indexes.map(idx => ({
        name: idx.name,
        unique: idx.unique === 1,
        origin: idx.origin,
      })),
    });
    break MAIN;
  }

  if (args.task) {
    const taskNumber = parseInt(args.task, 10);
    if (isNaN(taskNumber)) {
      console.error(JSON.stringify({ status: 'error', error: 'task_number_required', message: '--task requires a valid task number' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      console.error(JSON.stringify({ status: 'error', error: 'task_not_found', task_number: taskNumber }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const spec = store.getTaskSpecByNumber(taskNumber);
    const assignment = store.getActiveAssignment(lifecycle.task_id);
    const obligations = store.listDirectedObligationsForTask(lifecycle.task_id, null);
    const reports = store.db.prepare('SELECT report_id, agent_id, submitted_at as reported_at FROM task_reports WHERE task_id = ?').all(lifecycle.task_id);

    emit({
      schema: 'narada.task.inspect.task.v0',
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      lifecycle: {
        status: lifecycle.status,
        governed_by: lifecycle.governed_by,
        closed_at: lifecycle.closed_at,
        closed_by: lifecycle.closed_by,
        closure_mode: lifecycle.closure_mode,
        reopened_at: lifecycle.reopened_at,
        reopened_by: lifecycle.reopened_by,
        updated_at: lifecycle.updated_at,
      },
      spec: spec ? {
        title: spec.title,
        chapter: spec.chapter_markdown,
        goal: spec.goal_markdown,
        context: spec.context_markdown,
        required_work: spec.required_work_markdown,
        non_goals: spec.non_goals_markdown,
        acceptance_criteria: JSON.parse(spec.acceptance_criteria_json || '[]'),
        dependencies: JSON.parse(spec.dependencies_json || '[]'),
        updated_at: spec.updated_at,
      } : null,
      assignment: assignment ? {
        agent_id: assignment.agent_id,
        claimed_at: assignment.claimed_at,
        intent: assignment.intent,
      } : null,
      reports: reports || [],
      obligations: obligations.map(o => ({
        obligation_id: o.obligation_id,
        kind: o.kind,
        status: o.status,
        target_agent_id: o.target_agent_id,
        target_role: o.target_role,
      })),
    });
    break MAIN;
  }

  if (args.sequence || args.task_numbers) {
    const last = store.getLastAllocated();
    const reservations = store.listTaskNumberReservations();
    emit({
      schema: 'narada.task.inspect.sequence.v0',
      last_allocated: last?.last_number ?? null,
      reservations: reservations.map(r => ({
        floor: r.floor_number,
        reason: r.reason,
        reserved_at: r.reserved_at,
      })),
    });
    break MAIN;
  }

  console.error(JSON.stringify({
    status: 'error',
    error: 'no_subcommand',
    message: 'Usage: task-inspect --tables | --table <name> | --task <number> | --sequence',
  }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
