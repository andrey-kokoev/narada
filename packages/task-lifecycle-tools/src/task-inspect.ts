import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { writeFileSync } from 'node:fs';

const cwd: any = process.argv[2] || process.cwd();

function parseArgs(argv: any) : any {
  const args: any = {};
  const positional: any = [];
  for (let i = 3; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg.startsWith('--')) {
      const key: any = arg.replace(/^--/, '').replace(/-/g, '_');
      const next: any = argv[i + 1];
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

const { args }: any = parseArgs(process.argv);

const store: any = openTaskLifecycleStore(cwd);

let exitCode: any = 0;
MAIN: try {
  function emit(data: any) : any {
    const json: any = JSON.stringify(data, null, 2);
    if (args.output_file) { writeFileSync(args.output_file, json, 'utf8'); }
    else { console.log(json); }
  }

  if (args.tables) {
    const rows: any = store.db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all();
    emit({
      schema: 'narada.task.inspect.tables.v0',
      count: rows.length,
      tables: rows.map((r: any )=> r.name),
      entries: rows,
    });
    break MAIN;
  }

  if (args.table) {
    const tableName: any = args.table;
    const columns: any = store.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const indexes: any = store.db.prepare(`PRAGMA index_list(${tableName})`).all();
    emit({
      schema: 'narada.task.inspect.table.v0',
      table: tableName,
      columns: columns.map((c: any )=> ({
        cid: c.cid,
        name: c.name,
        type: c.type,
        notnull: c.notnull === 1,
        default_value: c.dflt_value,
        primary_key: c.pk === 1,
      })),
      indexes: indexes.map((idx: any )=> ({
        name: idx.name,
        unique: idx.unique === 1,
        origin: idx.origin,
      })),
    });
    break MAIN;
  }

  if (args.task) {
    const taskNumber: any = parseInt(args.task, 10);
    if (isNaN(taskNumber)) {
      console.error(JSON.stringify({ status: 'error', error: 'task_number_required', message: '--task requires a valid task number' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const lifecycle: any = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      console.error(JSON.stringify({ status: 'error', error: 'task_not_found', task_number: taskNumber }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const spec: any = store.getTaskSpecByNumber(taskNumber);
    const assignment: any = store.getActiveAssignment(lifecycle.task_id);
    const obligations: any = store.listDirectedObligationsForTask(lifecycle.task_id, null);
    const reports: any = store.db.prepare('SELECT report_id, agent_id, submitted_at as reported_at FROM task_reports WHERE task_id = ?').all(lifecycle.task_id);

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
      obligations: obligations.map((o: any )=> ({
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
    const last: any = store.getLastAllocated();
    const reservations: any = store.listTaskNumberReservations();
    emit({
      schema: 'narada.task.inspect.sequence.v0',
      last_allocated: last?.last_number ?? null,
      reservations: reservations.map((r: any )=> ({
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
