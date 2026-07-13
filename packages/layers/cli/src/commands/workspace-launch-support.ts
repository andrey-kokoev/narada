import { randomUUID } from 'node:crypto';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef, type AgentIdentityRefV2 } from '@narada2/agent-identity';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import { emitCliOutputAdmission } from '../lib/cli-output.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchPlanOptions,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function workspaceLaunchId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function workspaceLaunchSiteRootsFromLaunchResult(result: unknown): string[] {
  const resultRecord = isRecord(result) ? result : null;
  const selectedAgents = Array.isArray(resultRecord?.selected_agents) ? resultRecord.selected_agents : [];
  return selectedAgents
    .map((agent) => isRecord(agent) ? workspaceLaunchString(agent.site_root) : null)
    .filter((value): value is string => Boolean(value));
}

export interface WorkspaceLaunchSessionIdentityInput {
  agent_id?: unknown;
  site_id?: unknown;
  agent_identity_ref?: unknown;
  record?: unknown;
}

export function workspaceLaunchSessionIdentityRef(session: WorkspaceLaunchSessionIdentityInput): AgentIdentityRefV2 | null {
  const record = isRecord(session.record) ? session.record : null;
  const agentId = workspaceLaunchString(session.agent_id) ?? workspaceLaunchString(record?.agent_id);
  const siteId = workspaceLaunchString(session.site_id) ?? workspaceLaunchString(record?.site_id);
  const role = agentId?.split('.').filter(Boolean).at(-1) ?? null;
  const inputs = [session.agent_identity_ref, record?.agent_identity_ref, agentId]
    .filter((value): value is unknown => value !== null && value !== undefined);
  for (const input of inputs) {
    const resolved = resolveAgentIdentityRef(input, { site_id: siteId, role });
    if (resolved.status === 'resolved') return resolved.value;
  }
  return null;
}

export function workspaceLaunchProjectionQualifiedAgentId(attempt: WorkspaceLaunchAttemptRecord): string | null {
  const observation = attempt.observations.find((candidate) => candidate.agent_identity_ref || candidate.agent_id);
  const canonical = observation?.agent_identity_ref?.canonical_agent_id;
  if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();

  if (observation?.agent_id) {
    const resolved = resolveAgentIdentityRef(observation.agent_id, {
      site_id: observation.site_id,
      role: observation.agent_id.split('.').filter(Boolean).at(-1),
    });
    if (resolved.status === 'resolved') return resolved.value.canonical_agent_id;
  }

  const selectedSite = attempt.selection.site.length === 1 ? attempt.selection.site[0] : null;
  const selectedRole = attempt.selection.role.length === 1 ? attempt.selection.role[0] : null;
  return selectedSite && selectedRole ? `${selectedSite}.${selectedRole}` : null;
}

export function normalizeLauncherOutput(value: unknown, options: WorkspaceLaunchPlanOptions): WorkspaceLauncherOutputProjection[] {
  const raw = stringArray(value).flatMap((entry) => entry.split(',')).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const selected = raw.length > 0 ? raw : (options.interactiveSelectionUi ? ['summary', 'events'] : []);
  const admitted = new Set<WorkspaceLauncherOutputProjection>(['summary', 'events', 'commands', 'json', 'quiet']);
  const projections = unique(selected).map((entry) => {
    if (!admitted.has(entry as WorkspaceLauncherOutputProjection)) {
      throw new Error(`launcher_output_not_admitted: ${entry}. Admitted values: summary, events, commands, json, quiet`);
    }
    return entry as WorkspaceLauncherOutputProjection;
  });
  return projections.includes('quiet') ? ['quiet'] : projections;
}

function launcherOutputHas(outputs: WorkspaceLauncherOutputProjection[], projection: WorkspaceLauncherOutputProjection): boolean {
  return !outputs.includes('quiet') && outputs.includes(projection);
}

export function writeLauncherOutput(outputs: WorkspaceLauncherOutputProjection[], event: Record<string, unknown>, human: string): void {
  if (outputs.includes('quiet')) return;
  const lines: string[] = [];
  if (launcherOutputHas(outputs, 'json')) lines.push(JSON.stringify(event));
  if (launcherOutputHas(outputs, 'events')) lines.push(human);
  if (lines.length > 0) emitCliOutputAdmission({ zone: 'finite', lines });
}

export function formatWorkspaceLaunchSelection(selection: WorkspaceLaunchBrowserSelection): string {
  return `${selection.site.join(',') || '*'} / ${selection.role.join(',') || '*'} / ${selection.operatorSurface.join(',') || 'registry default'} / ${selection.runtime} / ${selection.intelligenceProvider}`;
}

