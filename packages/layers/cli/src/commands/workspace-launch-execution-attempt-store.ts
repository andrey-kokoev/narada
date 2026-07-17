import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchProcessLaunch } from './workspace-launch-types.js';
import { workspaceLaunchId } from './workspace-launch-support.js';
import { workspaceLaunchUserSiteRoot } from './workspace-launch-session-store.js';
import {
  redactWorkspaceLaunchArgv,
  redactWorkspaceLaunchCommand,
  redactWorkspaceLaunchText,
  workspaceLaunchReadProcessCommandLine,
} from './workspace-launch-process.js';

export const WORKSPACE_LAUNCH_EXECUTION_ATTEMPT_SCHEMA = 'narada.workspace_launch.execution_attempt.v1' as const;

export type WorkspaceLaunchExecutionAttemptState =
  | 'queued'
  | 'planning'
  | 'launching'
  | 'handoff_recorded'
  | 'observing'
  | 'launched'
  | 'failed'
  | 'recoverable'
  | 'recovery_requested'
  | 'recovered';

export interface WorkspaceLaunchExecutionAttemptLease {
  lease_id: string;
  owner_pid: number | null;
  owner_command_line?: string | null;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
}

function normalizeProcessIdentity(value: string): string {
  return redactWorkspaceLaunchText(value).replace(/[\\/]+/g, '/').replace(/\s+/g, ' ').trim().toLowerCase();
}

function looksLikeWorkspaceLaunchOwner(commandLine: string): boolean {
  const normalized = normalizeProcessIdentity(commandLine);
  const launcherCommand = /(?:^|[ /\\])start-naradaworkspace\.ps1(?:\s|$)/i.test(normalized)
    || /(?:^|[ /\\])launcher\s+workspace-launch(?:\s|$)/i.test(normalized);
  return /(?:^|[ /\\])(?:node|node\.exe|pnpm|pnpm\.cmd|pwsh|pwsh\.exe)(?:\s|$)/i.test(normalized)
    && launcherCommand;
}

export const WORKSPACE_LAUNCH_EXECUTION_LEASE_MS = 30_000;

const STATE_TRANSITIONS: Record<WorkspaceLaunchExecutionAttemptState, readonly WorkspaceLaunchExecutionAttemptState[]> = {
  queued: ['queued', 'planning', 'launching', 'failed'],
  planning: ['planning', 'launching', 'failed', 'recoverable', 'recovery_requested'],
  launching: ['launching', 'handoff_recorded', 'observing', 'failed', 'recoverable', 'recovery_requested'],
  handoff_recorded: ['handoff_recorded', 'observing', 'launched', 'failed', 'recoverable', 'recovery_requested'],
  observing: ['observing', 'launched', 'failed', 'recoverable', 'recovery_requested'],
  launched: ['launched'],
  failed: ['failed'],
  recoverable: ['recoverable', 'recovery_requested', 'recovered'],
  recovery_requested: ['recovery_requested', 'recoverable', 'recovered'],
  recovered: ['recovered'],
};

export interface WorkspaceLaunchExecutionAttemptRecord {
  schema: typeof WORKSPACE_LAUNCH_EXECUTION_ATTEMPT_SCHEMA;
  launch_attempt_id: string;
  submitted_at: string;
  updated_at: string;
  lease?: WorkspaceLaunchExecutionAttemptLease;
  state: WorkspaceLaunchExecutionAttemptState;
  history: WorkspaceLaunchExecutionAttemptState[];
  result_path: string;
  registry_paths: string[];
  selection: {
    agents: string[];
    sites: string[];
    roles: string[];
    operator_surfaces: string[];
    runtime: string | null;
    intelligence_provider: string | null;
  };
  bindings: Array<{
    agent: string;
    site: string;
    site_root: string;
    launch_session_id: string | null;
    owner_ref: string | null;
  }>;
  processes: WorkspaceLaunchProcessLaunch[];
  terminal_handoff: {
    status: 'not_attempted' | 'accepted' | 'failed';
    wt_exit_code: number | null;
    wt_args: string[];
  };
  failure: {
    reason_code: string;
    message: string;
    required_next_step: string;
  } | null;
}

export function workspaceLaunchExecutionAttemptRoot(): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-attempts');
}

export function workspaceLaunchExecutionAttemptPath(launchAttemptId: string): string {
  return join(workspaceLaunchExecutionAttemptRoot(), `${safeToken(launchAttemptId)}.json`);
}

export function workspaceLaunchDefaultResultPath(launchAttemptId: string): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-results', `${safeToken(launchAttemptId)}.json`);
}

export async function createWorkspaceLaunchExecutionAttempt(
  options: WorkspaceLaunchPlanOptions,
  registryPaths: string[],
): Promise<WorkspaceLaunchExecutionAttemptRecord> {
  const launchAttemptId = options.executionAttemptId ?? workspaceLaunchId('wla');
  const now = new Date().toISOString();
  const record: WorkspaceLaunchExecutionAttemptRecord = {
    schema: WORKSPACE_LAUNCH_EXECUTION_ATTEMPT_SCHEMA,
    launch_attempt_id: launchAttemptId,
    submitted_at: now,
    updated_at: now,
    lease: createLease(now),
    state: 'queued',
    history: ['queued'],
    result_path: options.resultPath ?? workspaceLaunchDefaultResultPath(launchAttemptId),
    registry_paths: [...registryPaths],
    selection: {
      agents: options.agent ?? [],
      sites: options.site ?? [],
      roles: options.role ?? [],
      operator_surfaces: options.operatorSurface ? [options.operatorSurface] : [],
      runtime: options.runtime ?? null,
      intelligence_provider: options.intelligenceProvider ?? null,
    },
    bindings: [],
    processes: [],
    terminal_handoff: { status: 'not_attempted', wt_exit_code: null, wt_args: [] },
    failure: null,
  };
  await writeWorkspaceLaunchExecutionAttempt(record);
  return record;
}

export async function writeWorkspaceLaunchExecutionAttempt(
  record: WorkspaceLaunchExecutionAttemptRecord,
): Promise<void> {
  const path = workspaceLaunchExecutionAttemptPath(record.launch_attempt_id);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const persistedRecord: WorkspaceLaunchExecutionAttemptRecord = {
    ...record,
    processes: record.processes.map((processLaunch) => ({
      ...processLaunch,
      command: redactWorkspaceLaunchCommand(processLaunch.command),
      args: redactWorkspaceLaunchArgv(processLaunch.args),
    })),
    terminal_handoff: {
      ...record.terminal_handoff,
      wt_args: redactWorkspaceLaunchArgv(record.terminal_handoff.wt_args),
    },
    lease: record.lease
      ? {
        ...record.lease,
        owner_command_line: record.lease.owner_command_line
          ? redactWorkspaceLaunchText(record.lease.owner_command_line)
          : record.lease.owner_command_line,
      }
      : record.lease,
    failure: record.failure
      ? { ...record.failure, message: redactWorkspaceLaunchText(record.failure.message), required_next_step: redactWorkspaceLaunchText(record.failure.required_next_step) }
      : null,
  };
  await writeFile(temporaryPath, `${JSON.stringify(persistedRecord, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export async function updateWorkspaceLaunchExecutionAttempt(
  record: WorkspaceLaunchExecutionAttemptRecord,
  nextState: WorkspaceLaunchExecutionAttemptState,
  patch: Partial<Pick<WorkspaceLaunchExecutionAttemptRecord, 'bindings' | 'processes' | 'terminal_handoff' | 'failure' | 'result_path' | 'lease'>> = {},
): Promise<WorkspaceLaunchExecutionAttemptRecord> {
  if (!(STATE_TRANSITIONS[record.state] ?? []).includes(nextState)) {
    throw new Error(`workspace_launch_invalid_attempt_state_transition: ${record.state} -> ${nextState}`);
  }
  if (record.state !== nextState) record.history = [...record.history, nextState];
  record.state = nextState;
  const now = new Date().toISOString();
  record.updated_at = now;
  record.lease = refreshLease(record.lease, now);
  Object.assign(record, patch);
  await writeWorkspaceLaunchExecutionAttempt(record);
  return record;
}

export async function readWorkspaceLaunchExecutionAttempt(path: string): Promise<WorkspaceLaunchExecutionAttemptRecord | null> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return isWorkspaceLaunchExecutionAttemptRecord(value) ? normalizeLegacyRecord(value) : null;
  } catch {
    return null;
  }
}

export async function listWorkspaceLaunchExecutionAttempts(): Promise<WorkspaceLaunchExecutionAttemptRecord[]> {
  const root = workspaceLaunchExecutionAttemptRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readWorkspaceLaunchExecutionAttempt(join(root, entry.name))));
  return records
    .filter((record): record is WorkspaceLaunchExecutionAttemptRecord => record !== null)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function isWorkspaceLaunchExecutionAttemptRecord(value: unknown): value is WorkspaceLaunchExecutionAttemptRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<WorkspaceLaunchExecutionAttemptRecord>;
  const selection = candidate.selection;
  const terminal = candidate.terminal_handoff;
  const failure = candidate.failure;
  const state = candidate.state;
  return candidate.schema === WORKSPACE_LAUNCH_EXECUTION_ATTEMPT_SCHEMA
    && typeof candidate.launch_attempt_id === 'string'
    && isIsoDate(candidate.submitted_at)
    && isIsoDate(candidate.updated_at)
    && typeof candidate.result_path === 'string'
    && Array.isArray(candidate.history)
    && candidate.history.length > 0
    && candidate.history.every((item) => isAttemptState(item))
    && isAttemptState(state)
    && candidate.history.at(-1) === state
    && Array.isArray(candidate.registry_paths)
    && candidate.registry_paths.every((item) => typeof item === 'string')
    && selection !== null
    && typeof selection === 'object'
    && Array.isArray(selection.agents)
    && Array.isArray(selection.sites)
    && Array.isArray(selection.roles)
    && Array.isArray(selection.operator_surfaces)
    && (selection.runtime === null || typeof selection.runtime === 'string')
    && (selection.intelligence_provider === null || typeof selection.intelligence_provider === 'string')
    && Array.isArray(candidate.bindings)
    && candidate.bindings.every(isBinding)
    && Array.isArray(candidate.processes)
    && candidate.processes.every(isProcessLaunch)
    && terminal !== null
    && typeof terminal === 'object'
    && (terminal.status === 'not_attempted' || terminal.status === 'accepted' || terminal.status === 'failed')
    && (terminal.wt_exit_code === null || Number.isInteger(terminal.wt_exit_code))
    && Array.isArray(terminal.wt_args)
    && terminal.wt_args.every((item) => typeof item === 'string')
    && (failure === null || isFailure(failure))
    && (candidate.lease === undefined || isLease(candidate.lease));
}

export function workspaceLaunchExecutionAttemptLeaseIsStale(
  record: WorkspaceLaunchExecutionAttemptRecord,
  now = Date.now(),
): boolean {
  const lease = record.lease;
  if (!lease) return true;
  if (lease.owner_pid === process.pid) {
    const observedCommandLine = workspaceLaunchReadProcessCommandLine(process.pid);
    if (observedCommandLine && lease.owner_command_line) {
      return normalizeProcessIdentity(observedCommandLine) !== normalizeProcessIdentity(lease.owner_command_line);
    }
    if (observedCommandLine && !looksLikeWorkspaceLaunchOwner(observedCommandLine)) return true;
    return false;
  }
  if (Date.parse(lease.expires_at) > now) return false;
  if (lease.owner_pid && isProcessAlive(lease.owner_pid)) {
    const observedCommandLine = workspaceLaunchReadProcessCommandLine(lease.owner_pid);
    if (observedCommandLine && lease.owner_command_line) {
      return normalizeProcessIdentity(observedCommandLine) !== normalizeProcessIdentity(lease.owner_command_line);
    }
    // Legacy attempts did not persist an owner command line. Reject obvious PID
    // reuse while remaining conservative when process identity is unavailable.
    if (observedCommandLine && !looksLikeWorkspaceLaunchOwner(observedCommandLine)) return true;
    return false;
  }
  return true;
}

function createLease(now: string): WorkspaceLaunchExecutionAttemptLease {
  return {
    lease_id: workspaceLaunchId('lease'),
    owner_pid: process.pid,
    owner_command_line: workspaceLaunchReadProcessCommandLine(process.pid),
    acquired_at: now,
    heartbeat_at: now,
    expires_at: new Date(Date.parse(now) + WORKSPACE_LAUNCH_EXECUTION_LEASE_MS).toISOString(),
  };
}

function refreshLease(lease: WorkspaceLaunchExecutionAttemptLease | undefined, now: string): WorkspaceLaunchExecutionAttemptLease {
  if (!lease) {
    return {
      ...createLease(now),
      owner_pid: null,
      owner_command_line: null,
      lease_id: workspaceLaunchId('legacy-lease'),
    };
  }
  return {
    ...lease,
    owner_pid: lease.owner_pid ?? process.pid,
    heartbeat_at: now,
    expires_at: new Date(Date.parse(now) + WORKSPACE_LAUNCH_EXECUTION_LEASE_MS).toISOString(),
  };
}

function normalizeLegacyRecord(record: WorkspaceLaunchExecutionAttemptRecord): WorkspaceLaunchExecutionAttemptRecord {
  if (record.lease) return record;
  return {
    ...record,
    lease: {
      lease_id: workspaceLaunchId('legacy-lease'),
      owner_pid: null,
      acquired_at: record.submitted_at,
      heartbeat_at: record.updated_at,
      expires_at: new Date(0).toISOString(),
    },
  };
}

function isAttemptState(value: unknown): value is WorkspaceLaunchExecutionAttemptState {
  return typeof value === 'string' && Object.hasOwn(STATE_TRANSITIONS, value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isBinding(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return typeof binding.agent === 'string'
    && typeof binding.site === 'string'
    && typeof binding.site_root === 'string'
    && (binding.launch_session_id === null || typeof binding.launch_session_id === 'string')
    && (binding.owner_ref === null || typeof binding.owner_ref === 'string');
}

function isProcessLaunch(value: unknown): value is WorkspaceLaunchProcessLaunch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const launch = value as WorkspaceLaunchProcessLaunch;
  return typeof launch.posture === 'string'
    && (launch.execution_authority === 'structured_argv' || launch.execution_authority === 'projection_shell_string')
    && typeof launch.command === 'string'
    && Array.isArray(launch.args)
    && launch.args.every((item) => typeof item === 'string')
    && typeof launch.cwd === 'string'
    && typeof launch.detached === 'boolean'
    && typeof launch.stdio === 'string'
    && typeof launch.windowsHide === 'boolean'
    && (launch.pid === null || (Number.isInteger(launch.pid) && launch.pid > 0))
    && (launch.owner_ref === null || typeof launch.owner_ref === 'string')
    && (launch.agent_id === undefined || launch.agent_id === null || typeof launch.agent_id === 'string')
    && (launch.launch_session_id === undefined || launch.launch_session_id === null || typeof launch.launch_session_id === 'string')
    && (launch.launch_binding_path === undefined || launch.launch_binding_path === null || typeof launch.launch_binding_path === 'string')
    && (launch.readiness_path === undefined || launch.readiness_path === null || typeof launch.readiness_path === 'string')
    && (launch.readiness === undefined || launch.readiness === 'spawned' || launch.readiness === 'spawned_and_alive' || launch.readiness === 'not_checked')
    && (launch.readiness_checked_at === undefined || launch.readiness_checked_at === null || isIsoDate(launch.readiness_checked_at))
    && (launch.capture_log === undefined || typeof launch.capture_log === 'string');
}

function isFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const failure = value as Record<string, unknown>;
  return typeof failure.reason_code === 'string'
    && typeof failure.message === 'string'
    && typeof failure.required_next_step === 'string';
}

function isLease(value: unknown): value is WorkspaceLaunchExecutionAttemptLease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const lease = value as Partial<WorkspaceLaunchExecutionAttemptLease>;
  return typeof lease.lease_id === 'string'
    && (lease.owner_pid === null || (typeof lease.owner_pid === 'number' && Number.isInteger(lease.owner_pid) && lease.owner_pid > 0))
    && (lease.owner_command_line === undefined || lease.owner_command_line === null || typeof lease.owner_command_line === 'string')
    && isIsoDate(lease.acquired_at)
    && isIsoDate(lease.heartbeat_at)
    && isIsoDate(lease.expires_at);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    return code !== 'ESRCH';
  }
}

function safeToken(value: string): string {
  return value.replace(/[^0-9A-Za-z_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
