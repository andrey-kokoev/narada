import { appendFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef, type AgentIdentityRefV2 } from '@narada2/agent-identity';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchLegacyCarrierCompatibility,
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

export function workspaceLaunchSessionIdentityRef(session: Record<string, unknown>): AgentIdentityRefV2 | null {
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

export function workspaceLaunchLegacyTerminalWtArgs(record: Record<string, unknown>): string[] {
  const topLevel = stringArray(record.wt_args);
  if (topLevel.length > 0) return topLevel;
  const legacyTerminalPlan = isRecord(record.legacy_terminal_plan) ? record.legacy_terminal_plan : null;
  return legacyTerminalPlan ? stringArray(legacyTerminalPlan.wt_args) : [];
}

export async function workspaceLaunchStartHiddenRuntimeHost(commandArgs: string[], cwd: string): Promise<Record<string, unknown>> {
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
  if (captureLog) {
    const redactedArgs = redactWorkspaceLaunchArgv(commandArgs);
    await appendFile(captureLog, `${JSON.stringify({ command: redactedArgs, cwd })}\n`, 'utf8');
    return {
      posture: 'agent_runtime_server',
      command: 'capture',
      args: redactedArgs,
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: null,
      capture_log: captureLog,
    };
  }
  const [command, ...args] = commandArgs;
  if (!command) throw new Error('narada_workspace_plan_empty_hidden_runtime_command');
  const child = spawnHiddenPostureProcess(command, args, {
    posture: 'agent_runtime_server',
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'agent_runtime_server',
    command,
    args: redactWorkspaceLaunchArgv(args),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export async function workspaceLaunchStartHiddenProjectionHost(command: string, cwd: string): Promise<Record<string, unknown>> {
  const hostCommand = process.platform === 'win32' ? 'pwsh' : 'sh';
  const hostArgs = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]
    : ['-lc', command];
  const child = spawnHiddenPostureProcess(hostCommand, hostArgs, {
    posture: 'operator_projection_host',
    cwd,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'operator_projection_host',
    command: hostCommand,
    args: redactWorkspaceLaunchArgv(hostArgs),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export function redactWorkspaceLaunchArgv(args: string[]): string[] {
  return args.map((arg) => /api[_-]?key|token|secret|password/i.test(arg) ? '<redacted>' : arg);
}

export function redactWorkspaceLaunchCommand(command: string): string {
  return redactWorkspaceLaunchArgv([command])[0] ?? '<redacted>';
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}

export async function writeWorkspacePlanResult(path: string | undefined, result: unknown): Promise<void> {
  if (!path) return;
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
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
  if (launcherOutputHas(outputs, 'json')) console.log(JSON.stringify(event));
  if (launcherOutputHas(outputs, 'events')) console.log(human);
}

export function formatWorkspaceLaunchSelection(selection: WorkspaceLaunchBrowserSelection): string {
  return `${selection.site.join(',') || '*'} / ${selection.role.join(',') || '*'} / ${selection.operatorSurface.join(',') || 'registry default'} / ${selection.runtime} / ${selection.intelligenceProvider}`;
}

function formatWorkspaceLaunchCommand(args: string[]): string {
  return args.map((arg) => /\s/.test(arg) ? `'${arg.replace(/'/g, "''")}'` : arg).join(' ');
}

export function writeWorkspaceLaunchCommandOutput(outputs: WorkspaceLauncherOutputProjection[], attempt: WorkspaceLaunchAttemptRecord): void {
  if (!launcherOutputHas(outputs, 'commands')) return;
  for (const handoff of attempt.handoffs) {
    if (handoff.argv_redacted.length > 0) console.log(`[launcher:command] ${formatWorkspaceLaunchCommand(handoff.argv_redacted)}`);
  }
}

export function legacyCarrierCompatibility(): WorkspaceLaunchLegacyCarrierCompatibility {
  return {
    schema: 'narada.workspace_launch.legacy_carrier_compatibility.v1',
    status: 'compatibility_fields_present',
    canonical_terms: {
      operator_surface: 'operator_surface',
      runtime_host: 'runtime_host',
    },
    compatibility_paths: {
      command_aliases: ['--carrier', 'carrier start'],
      runtime_aliases: ['nars'],
      status: 'fenced_compatibility',
    },
    compatibility_note: 'Legacy carrier terminology and the nars runtime alias remain available only as fenced compatibility paths. Use operator_surface and runtime_host in new commands and docs.',
    deprecated_fields: [
      'carrier',
      'launch_carrier',
      'launch_carriers',
      'launch_runtime',
    ],
    replacement_fields: {
      carrier: 'operator_surface',
      launch_carrier: 'launch_operator_surface',
      launch_carriers: 'launch_operator_surfaces',
      launch_runtime: 'launch_runtime_host',
    },
    removal_policy: 'remove_after_consumers_migrate',
  };
}
