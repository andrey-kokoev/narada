import {
  findTaskFile,
  getActiveAssignment,
  loadAssignment,
  loadRoster,
} from './task-governance.js';

export interface TaskRoleGuardOverride {
  actor: string;
  owner_agent_id: string;
  owner_role: string | null;
  actor_role: string | null;
  rationale: string;
}

export interface TaskRoleGuardResult {
  ok: boolean;
  error?: string;
  override?: TaskRoleGuardOverride;
}

export async function enforceBuilderOwnedLifecycleGuard(options: {
  cwd: string;
  taskNumber?: string;
  actor?: string;
  action: 'report' | 'close';
  overrideRationale?: string;
}): Promise<TaskRoleGuardResult> {
  if (!options.taskNumber || !options.actor) return { ok: true };
  const taskFile = await findTaskFile(options.cwd, options.taskNumber);
  if (!taskFile) return { ok: true };
  const assignment = await loadAssignment(options.cwd, taskFile.taskId);
  const active = assignment ? getActiveAssignment(assignment) : null;
  if (!active || active.agent_id === options.actor) return { ok: true };

  let actorRole: string | null = null;
  let ownerRole: string | null = null;
  try {
    const roster = await loadRoster(options.cwd);
    actorRole = roster.agents.find((agent) => agent.agent_id === options.actor)?.role ?? null;
    ownerRole = roster.agents.find((agent) => agent.agent_id === active.agent_id)?.role ?? null;
  } catch {
    return { ok: true };
  }

  const actorIsArchitect = actorRole === 'architect' || options.actor === 'architect';
  const ownerIsBuilder = ownerRole === 'builder' || active.agent_id === 'builder';
  if (!actorIsArchitect || !ownerIsBuilder) return { ok: true };

  const rationale = options.overrideRationale?.trim();
  if (!rationale) {
    return {
      ok: false,
      error: `Role guard: ${options.actor} cannot ${options.action} Builder-owned task ${options.taskNumber} while it is assigned to ${active.agent_id}. Provide --override-rationale to record an explicit durable override.`,
    };
  }

  return {
    ok: true,
    override: {
      actor: options.actor,
      owner_agent_id: active.agent_id,
      owner_role: ownerRole,
      actor_role: actorRole,
      rationale,
    },
  };
}
