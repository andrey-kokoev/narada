import { readOperatorSurfaceIdentities, type OperatorSurfaceIdentity } from './operator-surface-registry.js';
import { loadRoster, saveRoster, type AgentRosterEntry } from './task-governance.js';

export interface OperatorSurfaceTaskAuthorityRepair {
  status: 'missing_from_task_authority';
  identity_id: string;
  site_id: string;
  role: string;
  requested_identity: string;
  repair_command: string;
}

export interface AdmitOperatorSurfaceIdentityOptions {
  cwd: string;
  identityId: string;
  by: string;
  role?: string;
  capabilities?: string[];
}

export interface AdmitOperatorSurfaceIdentityResult {
  status: 'success';
  identity_id: string;
  admitted_by: string;
  role: string;
  capabilities: string[];
  task_authority: {
    agent_id: string;
    role: string;
    capabilities: string[];
    status: string;
  };
  exact_identity_preserved: true;
  role_aliases_not_collapsed: true;
}

export async function operatorSurfaceTaskAuthorityRepair(
  cwd: string,
  requestedIdentity: string | undefined,
): Promise<OperatorSurfaceTaskAuthorityRepair | null> {
  const identity = await findOperatorSurfaceIdentity(cwd, requestedIdentity);
  if (!identity || !requestedIdentity) return null;
  const roster = await loadRoster(cwd);
  const taskAuthorityEntry = roster.agents.find((agent) => agent.agent_id === requestedIdentity);
  if (taskAuthorityEntry) return null;
  return {
    status: 'missing_from_task_authority',
    identity_id: identity.identity_id,
    site_id: identity.site_id,
    role: identity.role,
    requested_identity: requestedIdentity,
    repair_command: `narada operator-surface identity admit-task-authority ${identity.identity_id} --by <principal>`,
  };
}

export async function admitOperatorSurfaceIdentityToTaskAuthority(
  options: AdmitOperatorSurfaceIdentityOptions,
): Promise<AdmitOperatorSurfaceIdentityResult> {
  const identity = await findOperatorSurfaceIdentity(options.cwd, options.identityId);
  if (!identity) {
    throw new Error(`Operator Surface identity not found: ${options.identityId}`);
  }
  const role = options.role?.trim() || identity.role;
  const capabilities = options.capabilities && options.capabilities.length > 0
    ? options.capabilities
    : defaultTaskCapabilities(role);
  const roster = await loadRoster(options.cwd);
  const now = new Date().toISOString();
  const existing = roster.agents.find((agent) => agent.agent_id === identity.identity_id);
  const entry: AgentRosterEntry = {
    agent_id: identity.identity_id,
    role,
    capabilities,
    first_seen_at: existing?.first_seen_at ?? now,
    last_active_at: existing?.last_active_at ?? now,
    status: existing?.status ?? 'idle',
    task: existing?.task ?? null,
    last_done: existing?.last_done ?? null,
    updated_at: now,
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    roster.agents.push(entry);
  }
  roster.updated_at = now;
  await saveRoster(options.cwd, roster);
  return {
    status: 'success',
    identity_id: identity.identity_id,
    admitted_by: options.by,
    role,
    capabilities,
    task_authority: {
      agent_id: entry.agent_id,
      role: entry.role,
      capabilities: entry.capabilities,
      status: entry.status ?? 'idle',
    },
    exact_identity_preserved: true,
    role_aliases_not_collapsed: true,
  };
}

export function parseTaskAuthorityCapabilities(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function defaultTaskCapabilities(role: string): string[] {
  if (role === 'architect') return ['review', 'architect_as_reviewer'];
  if (role === 'reviewer') return ['review'];
  if (role === 'builder') return ['claim', 'execute', 'review'];
  if (role === 'implementer') return ['claim', 'execute'];
  return [];
}

async function findOperatorSurfaceIdentity(
  cwd: string,
  identityId: string | undefined,
): Promise<OperatorSurfaceIdentity | null> {
  const requested = identityId?.trim();
  if (!requested) return null;
  const registry = await readOperatorSurfaceIdentities(cwd);
  return registry.identities.find((identity) => (
    identity.identity_id === requested ||
    (identity.previous_identity_ids ?? []).includes(requested)
  )) ?? null;
}
