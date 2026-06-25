import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { resolveTaskRolePolicy } from './task-role-policy.mjs';

const cwd = process.argv[2] || process.cwd();
const taskNumber = parseInt(process.argv[3], 10);

if (isNaN(taskNumber)) {
  console.error('Usage: node task-read.mjs <cwd> <task-number>');
  process.exit(1);
}

const store = openTaskLifecycleStore(cwd);
try {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) {
    throw new Error(`Task ${taskNumber} not found.`);
  }
  const spec = store.getTaskSpecByNumber(taskNumber);
  const assignment = store.getActiveAssignment(lifecycle.task_id);
  const rolePref = store.db.prepare(
    'SELECT target_role, preferred_agent_id FROM narada_andrey_task_role_preferences WHERE task_id = ?'
  ).get(lifecycle.task_id);
  const reports = store.db.prepare('SELECT agent_id FROM task_reports WHERE task_id = ?').all(lifecycle.task_id);
  const reportAgentIds = [...new Set((reports || []).map((report) => report.agent_id).filter(Boolean))];
  const finishedBy = lifecycle.closed_by || (reportAgentIds.length === 1 ? reportAgentIds[0] : null);
  const preferredAgentId = rolePref?.preferred_agent_id || null;
  const rolePolicy = resolveTaskRolePolicy({ siteRoot: cwd, taskSpec: spec });

  const result = {
    schema: 'narada.task.read.v0',
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    status: lifecycle.status,
    title: spec?.title || '(untitled)',
    chapter: spec?.chapter_markdown || null,
    goal: spec?.goal_markdown || null,
    required_work: spec?.required_work_markdown || null,
    assigned_agent: assignment?.agent_id || null,
    assigned_at: assignment?.claimed_at || null,
    target_role: rolePref?.target_role || null,
    preferred_agent_id: preferredAgentId,
    role_policy: rolePolicy,
    routing_policy: {
      policy: `preferred_agent_id_is_soft_affinity_target_role_enforcement_${rolePolicy.role_enforcement}`,
      override_authority_required_when_claiming_nonpreferred: true,
      allowed_override_authority_kinds: ['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff'],
    },
    routing_assignment_divergence: {
      policy: 'preferred_agent_id_is_not_assignment',
      preferred_agent_id: preferredAgentId,
      active_assignment_agent_id: assignment?.agent_id || null,
      finished_by: finishedBy,
      report_agent_ids: reportAgentIds,
      active_assignment_diverges_from_preferred: Boolean(preferredAgentId && assignment?.agent_id && preferredAgentId !== assignment.agent_id),
      finished_assignment_diverges_from_preferred: Boolean(preferredAgentId && finishedBy && preferredAgentId !== finishedBy),
    },
    updated_at: lifecycle.updated_at,
    spec: spec || null,
    lifecycle: {
      governed_by: lifecycle.governed_by,
      closed_at: lifecycle.closed_at,
      closed_by: lifecycle.closed_by,
      closure_mode: lifecycle.closure_mode,
      reopened_at: lifecycle.reopened_at,
      reopened_by: lifecycle.reopened_by
    }
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.db.close();
}
