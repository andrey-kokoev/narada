import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { resolveAgentRoleWithDiagnostics } from './agent-role-resolution.mjs';

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
  if (args.list) {
    const agent = args.agent || null;
    const status = args.status || 'open';
    if (!agent) {
      console.error(JSON.stringify({ status: 'error', error: 'agent_required', message: '--list requires --agent' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const roleResolution = resolveAgentRoleWithDiagnostics(store, cwd, agent);
    const agentRole = roleResolution.role;
    const obligations = store.listDirectedObligationsForTarget(agent, agentRole, status);
    const result = obligations.map((o) => {
      const spec = o.task_number ? store.getTaskSpecByNumber(o.task_number) : null;
      return {
        obligation_id: o.obligation_id,
        kind: o.kind,
        status: o.status,
        task_number: o.task_number,
        task_id: o.task_id,
        title: spec?.title || '(untitled)',
        target_agent_id: o.target_agent_id,
        target_role: o.target_role,
        source_agent_id: o.source_agent_id,
        created_at: o.created_at,
        updated_at: o.updated_at,
      };
    });
    console.log(JSON.stringify({
      schema: 'narada.task.obligations.list.v0',
      count: result.length,
      agent,
      agent_role: agentRole,
      role_binding: roleResolution.role_binding,
      role_resolution: roleResolution,
      status_filter: status,
      obligations: result,
    }, null, 2));
    break MAIN;
  }

  if (args.create) {
    const taskNumber = parseInt(args.task, 10);
    if (isNaN(taskNumber)) {
      console.error(JSON.stringify({ status: 'error', error: 'task_number_required', message: '--create requires --task' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const kind = args.kind;
    if (!kind) {
      console.error(JSON.stringify({ status: 'error', error: 'kind_required', message: '--create requires --kind' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      console.error(JSON.stringify({ status: 'error', error: 'task_not_found', task_number: taskNumber }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const now = new Date().toISOString();
    const obligationId = `obl_manual_${kind}_${taskNumber}_${Date.now()}`;
    store.upsertDirectedObligation({
      obligation_id: obligationId,
      source_kind: 'manual_cli',
      source_ref: 'task-obligations',
      source_agent_id: args.source_agent || null,
      target_agent_id: args.target_agent || null,
      target_role: args.target_role || null,
      target_ref: args.target_ref || 'manual',
      kind,
      status: args.status || 'open',
      task_id: lifecycle.task_id,
      task_number: taskNumber,
      evidence_json: JSON.stringify({ created_by: 'task-obligations', reason: args.reason || null }),
      consumption_rule_json: JSON.stringify({ consume_on: ['task_review', 'task_defer', 'delegation', 'rejection', 'completion'] }),
      created_at: now,
      updated_at: now,
      consumed_at: null,
      consumed_by: null,
      consumption_ref: null,
    });
    console.log(JSON.stringify({
      schema: 'narada.task.obligations.create.v0',
      status: 'success',
      obligation_id: obligationId,
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      kind,
      target_agent_id: args.target_agent || null,
      target_role: args.target_role || null,
    }, null, 2));
    break MAIN;
  }

  if (args.route) {
    const obligationId = args.obligation_id;
    if (!obligationId) {
      console.error(JSON.stringify({ status: 'error', error: 'obligation_id_required', message: '--route requires --obligation-id' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const existing = store.getDirectedObligation(obligationId);
    if (!existing) {
      console.error(JSON.stringify({ status: 'error', error: 'obligation_not_found', obligation_id: obligationId }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    const now = new Date().toISOString();
    store.upsertDirectedObligation({
      ...existing,
      target_agent_id: args.target_agent || existing.target_agent_id,
      target_role: args.target_role || existing.target_role,
      target_ref: args.target_ref || existing.target_ref || 'routed',
      updated_at: now,
    });
    console.log(JSON.stringify({
      schema: 'narada.task.obligations.route.v0',
      status: 'success',
      obligation_id: obligationId,
      previous_target_agent_id: existing.target_agent_id,
      previous_target_role: existing.target_role,
      new_target_agent_id: args.target_agent || existing.target_agent_id,
      new_target_role: args.target_role || existing.target_role,
    }, null, 2));
    break MAIN;
  }

  if (args.sweep_stale) {
    const dryRun = !!args.dry_run;
    const stmt = store.db.prepare(`
      SELECT o.obligation_id, o.task_id, o.task_number, t.status as task_status
      FROM directed_obligations o
      JOIN task_lifecycle t ON o.task_id = t.task_id
      WHERE o.kind = 'review_request'
        AND o.status = 'open'
        AND t.status IN ('closed', 'confirmed')
    `);
    const rows = stmt.all();
    const consumed = [];
    if (!dryRun) {
      for (const row of rows) {
        store.transitionDirectedObligation(row.obligation_id, 'completed', '_system', 'sweep_stale_obligations');
        consumed.push(row.obligation_id);
      }
    }
    console.log(JSON.stringify({
      schema: 'narada.task.obligations.sweep_stale.v0',
      status: 'success',
      dry_run: dryRun,
      total_checked: rows.length,
      stale_found: rows.length,
      consumed: dryRun ? 0 : consumed.length,
      consumed_obligation_ids: dryRun ? [] : consumed,
    }, null, 2));
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
    const status = args.status || null;
    const obligations = store.listDirectedObligationsForTask(lifecycle.task_id, status);
    const result = obligations.map((o) => ({
      obligation_id: o.obligation_id,
      kind: o.kind,
      status: o.status,
      task_number: o.task_number,
      task_id: o.task_id,
      target_agent_id: o.target_agent_id,
      target_role: o.target_role,
      source_agent_id: o.source_agent_id,
      created_at: o.created_at,
      updated_at: o.updated_at,
    }));
    console.log(JSON.stringify({
      schema: 'narada.task.obligations.for_task.v0',
      count: result.length,
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      status_filter: status,
      obligations: result,
    }, null, 2));
    break MAIN;
  }

  console.error(JSON.stringify({
    status: 'error',
    error: 'no_subcommand',
    message: 'Usage: task-obligations --sweep-stale [--dry-run] | --list|--task|--create|--route [options]',
    usage: {
      sweep_stale: 'task-obligations --sweep-stale [--dry-run]',
      list: 'task-obligations --list --agent <agent> [--status <status>]',
      task: 'task-obligations --task <task-number> [--status <status>]',
      create: 'task-obligations --create --task <task-number> --kind <kind> [--target-agent <agent>] [--target-role <role>]',
      route: 'task-obligations --route --obligation-id <id> [--target-agent <agent>] [--target-role <role>]',
    },
  }, null, 2));
  exitCode = 1;
} finally {
  store.db.close();
}
process.exit(exitCode);
