import { closeSync, mkdirSync, openSync } from 'node:fs';
import { appendFile, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runGovernedCommandSync, spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import type { WorkspaceLaunchProcessLaunch } from './workspace-launch-types.js';
import type { WorkspaceLaunchRollbackEvidence, WorkspaceLaunchRollbackTargetEvidence } from './workspace-launch-contracts.js';

const ownedProcessRegistry = new Map<number, WorkspaceLaunchProcessLaunch>();

export interface WorkspaceLaunchProcessIdentity {
  agent_id?: string | null;
  launch_session_id?: string | null;
  nars_session_id?: string | null;
  launch_binding_path?: string | null;
  readiness_path?: string | null;
}

export class WorkspaceLaunchProcessReadinessError extends Error {
  constructor(
    message: string,
    readonly launch: WorkspaceLaunchProcessLaunch,
    readonly cleanup_status: 'terminated' | 'not_running' | 'refused',
  ) {
    super(message);
    this.name = 'WorkspaceLaunchProcessReadinessError';
  }
}

export function workspaceLaunchProcessIsAlive(pid: number): boolean {
  return isProcessAlive(pid);
}

export function workspaceLaunchProjectionReadinessPath(bindingPath: string): string {
  return `${bindingPath}.ready.json`;
}

async function workspaceLaunchWaitForProcessReadiness(
  pid: number,
  readinessPath: string | null | undefined,
  expectedSessionId: string | null | undefined,
): Promise<'spawned_and_alive'> {
  if (!readinessPath) {
    const configured = Number.parseInt(process.env.NARADA_WORKSPACE_LAUNCH_PROJECTION_READINESS_MS ?? '250', 10);
    const waitMs = Number.isFinite(configured) ? Math.max(25, Math.min(2_000, configured)) : 250;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, waitMs));
    if (!isProcessAlive(pid)) throw new Error('workspace_launch_projection_process_not_ready');
    return 'spawned_and_alive';
  }

  const configured = Number.parseInt(process.env.NARADA_WORKSPACE_LAUNCH_PROJECTION_READINESS_TIMEOUT_MS ?? '10000', 10);
  const timeoutMs = Number.isFinite(configured) ? Math.max(250, Math.min(30_000, configured)) : 10_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isProcessAlive(pid)) throw new Error('workspace_launch_projection_process_not_ready');
    try {
      const readiness = JSON.parse(await readFile(readinessPath, 'utf8')) as Record<string, unknown>;
      const sessionMatches = expectedSessionId == null || readiness.session_id === expectedSessionId;
      if (readiness.schema === 'narada.agent_web_ui.readiness.v1'
        && readiness.status === 'ready'
        && sessionMatches
        && typeof readiness.url === 'string'
        && readiness.url.trim().length > 0) {
        return 'spawned_and_alive';
      }
    } catch {
      // The projection writes the readiness record atomically; retry until the bounded deadline.
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('workspace_launch_projection_readiness_timeout');
}

function workspaceLaunchProcessMatchesPersistedLaunch(launch: WorkspaceLaunchProcessLaunch): boolean {
  const markers = [launch.launch_binding_path, launch.launch_session_id]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeProcessMarker);
  if (markers.length === 0) return false;
  const commandLine = workspaceLaunchReadProcessCommandLine(launch.pid as number);
  if (!commandLine) return false;
  const normalizedCommandLine = normalizeProcessMarker(commandLine);
  return markers.some((marker) => normalizedCommandLine.includes(marker));
}

export function workspaceLaunchReadProcessCommandLine(pid: number): string | null {
  try {
    if (process.platform !== 'win32') {
      const result = runGovernedCommandSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return String(result.stdout ?? '').trim() || null;
    }
    const query = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($p) { $p.CommandLine }`;
    const result = runGovernedCommandSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(result.stdout ?? '').trim() || null;
  } catch {
    return null;
  }
}

function normalizeProcessMarker(value: string): string {
  return value.replace(/[\\/]+/g, '/').toLowerCase();
}

export async function workspaceLaunchStartHiddenRuntimeHost(
  commandArgs: string[],
  cwd: string,
  ownerRef: string | null = null,
  identity: WorkspaceLaunchProcessIdentity = {},
): Promise<WorkspaceLaunchProcessLaunch> {
  if (!Array.isArray(commandArgs) || commandArgs.length === 0 || commandArgs.some((value) => typeof value !== 'string')) {
    throw new Error('workspace_launch_hidden_runtime_argv_invalid');
  }
  if (!ownerRef || !ownerRef.trim()) throw new Error('workspace_launch_process_owner_ref_missing');
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
  if (captureLog) {
    const redactedArgs = redactWorkspaceLaunchArgv(commandArgs);
    await appendFile(captureLog, `${JSON.stringify({ command: redactedArgs, cwd })}\n`, 'utf8');
    return {
      posture: 'agent_runtime_server',
      execution_authority: 'structured_argv',
      command: 'capture',
      args: redactedArgs,
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: null,
      owner_ref: ownerRef,
      agent_id: identity.agent_id ?? null,
      launch_session_id: identity.launch_session_id ?? null,
      nars_session_id: identity.nars_session_id ?? null,
      launch_binding_path: identity.launch_binding_path ?? null,
      readiness_path: identity.readiness_path ?? null,
      readiness: 'not_checked',
      readiness_checked_at: null,
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
  const pid = typeof child.pid === 'number' ? child.pid : null;
  if (!pid) throw new Error('workspace_launch_hidden_runtime_pid_missing');
  const launch: WorkspaceLaunchProcessLaunch = {
    posture: 'agent_runtime_server',
    execution_authority: 'structured_argv',
    command: redactWorkspaceLaunchCommand(command),
    args: redactWorkspaceLaunchArgv(args),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid,
    owner_ref: ownerRef,
    agent_id: identity.agent_id ?? null,
    launch_session_id: identity.launch_session_id ?? null,
    nars_session_id: identity.nars_session_id ?? null,
    launch_binding_path: null,
    readiness_path: null,
    readiness: 'spawned',
    readiness_checked_at: new Date().toISOString(),
  };
  ownedProcessRegistry.set(pid, launch);
  return launch;
}

export async function workspaceLaunchStartHiddenProjectionHost(command: string | string[], cwd: string, ownerRef: string | null = null, identity: WorkspaceLaunchProcessIdentity = {}): Promise<WorkspaceLaunchProcessLaunch> {
  if ((typeof command !== 'string' && !Array.isArray(command)) || (Array.isArray(command) ? command.length === 0 : !command.trim())) {
    throw new Error('workspace_launch_projection_command_missing');
  }
  const structuredArgv = Array.isArray(command);
  const structuredCommand = structuredArgv ? command : null;
  const hostCommand = structuredCommand ? structuredCommand[0] : (process.platform === 'win32' ? 'pwsh' : 'sh');
  const hostArgs = structuredArgv
    ? structuredCommand!.slice(1)
    : process.platform === 'win32'
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]
      : ['-lc', command];
  if (!hostCommand) throw new Error('workspace_launch_projection_command_missing');
  if (identity.readiness_path) {
    try {
      await unlink(identity.readiness_path);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
      if (code !== 'ENOENT') throw error;
    }
  }
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_PROJECTION_LOG;
  let captureFd: number | null = null;
  try {
    if (captureLog) {
      mkdirSync(dirname(captureLog), { recursive: true });
      captureFd = openSync(captureLog, 'a');
    }
    const child = spawnHiddenPostureProcess(hostCommand, hostArgs, {
      posture: 'operator_projection_host',
      cwd,
      detached: true,
      stdio: captureFd === null ? 'ignore' : ['ignore', captureFd, captureFd],
      env: process.env,
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise);
      child.once('spawn', () => resolvePromise());
    });
    child.unref();
    const pid = typeof child.pid === 'number' ? child.pid : null;
    const provisionalLaunch: WorkspaceLaunchProcessLaunch = {
      posture: 'operator_projection_host',
      execution_authority: structuredArgv ? 'structured_argv' : 'projection_shell_string',
      command: hostCommand,
      args: redactWorkspaceLaunchArgv(hostArgs),
      cwd,
      detached: true,
      stdio: captureFd === null ? 'ignore' : 'captured',
      windowsHide: true,
      pid,
      owner_ref: ownerRef,
      agent_id: identity.agent_id ?? null,
      launch_session_id: identity.launch_session_id ?? null,
      nars_session_id: identity.nars_session_id ?? null,
      launch_binding_path: identity.launch_binding_path ?? null,
      readiness_path: identity.readiness_path ?? null,
      readiness: pid === null ? 'not_checked' : 'spawned',
      readiness_checked_at: null,
      ...(captureLog ? { capture_log: captureLog } : {}),
    };
    if (provisionalLaunch.pid !== null && ownerRef) ownedProcessRegistry.set(provisionalLaunch.pid, provisionalLaunch);
    let readiness: 'spawned_and_alive' | 'not_checked' = 'not_checked';
    try {
      readiness = pid === null
        ? 'not_checked'
        : await workspaceLaunchWaitForProcessReadiness(pid, identity.readiness_path, identity.nars_session_id ?? null);
    } catch (error) {
      const cleanup = provisionalLaunch.pid !== null && ownerRef
        ? terminateOwnedProcess(provisionalLaunch)
        : { status: 'refused' as const };
      throw new WorkspaceLaunchProcessReadinessError(
        error instanceof Error ? error.message : 'workspace_launch_projection_process_not_ready',
        provisionalLaunch,
        cleanup.status,
      );
    }
    const launch: WorkspaceLaunchProcessLaunch = {
      ...provisionalLaunch,
      readiness,
      readiness_checked_at: pid === null ? null : new Date().toISOString(),
    };
    if (launch.pid !== null && ownerRef) ownedProcessRegistry.set(launch.pid, launch);
    return launch;
  } finally {
    if (captureFd !== null) closeSync(captureFd);
  }
}

export function workspaceLaunchTerminateProcess(launch: WorkspaceLaunchProcessLaunch): 'terminated' | 'not_running' | 'refused' {
  return terminateOwnedProcess(launch).status;
}

export interface WorkspaceLaunchPersistedProcessCleanupEvidence {
  status: 'terminated' | 'not_running' | 'refused';
  process_identity_proven: boolean;
  reason: string;
}

export function workspaceLaunchRequestPersistedProcessCleanup(
  launch: WorkspaceLaunchProcessLaunch,
): WorkspaceLaunchPersistedProcessCleanupEvidence {
  if (typeof launch.pid !== 'number' || launch.pid <= 0) {
    return { status: 'not_running', process_identity_proven: false, reason: 'no live process id was recorded' };
  }
  if (launch.pid === process.pid) {
    return { status: 'refused', process_identity_proven: false, reason: 'the recovery process itself is never an owned launch child' };
  }
  if (!launch.owner_ref) {
    return { status: 'refused', process_identity_proven: false, reason: 'process ownership reference is missing' };
  }
  if (!isProcessAlive(launch.pid)) {
    return { status: 'not_running', process_identity_proven: false, reason: 'persisted process was already absent' };
  }
  if (!workspaceLaunchProcessMatchesPersistedLaunch(launch)) {
    return { status: 'refused', process_identity_proven: false, reason: 'persisted process identity proof did not match the launch marker' };
  }
  try {
    if (process.platform === 'win32') {
      runGovernedCommandSync('taskkill', ['/PID', String(launch.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-launch.pid, 'SIGTERM');
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    if (code !== 'ESRCH') return { status: 'refused', process_identity_proven: true, reason: 'persisted process tree termination was refused' };
  }
  return isProcessAlive(launch.pid)
    ? { status: 'refused', process_identity_proven: true, reason: 'persisted process remained alive after tree termination request' }
    : { status: 'terminated', process_identity_proven: true, reason: 'persisted process tree terminated' };
}

export function workspaceLaunchRollbackOwnedProcesses(launches: WorkspaceLaunchProcessLaunch[]): WorkspaceLaunchRollbackEvidence {
  const outcomes = launches.map((launch) => terminateOwnedProcess(launch));
  const statuses = outcomes.map((outcome) => outcome.status);
  const targets: WorkspaceLaunchRollbackTargetEvidence[] = outcomes.map((outcome, index) => {
    const launch = launches[index];
    return {
      index,
      agent_id: launch?.agent_id ?? null,
      launch_session_id: launch?.launch_session_id ?? null,
      pid: launch?.pid ?? null,
      owner_ref: launch?.owner_ref ?? null,
      status: outcome.status,
      reason: outcome.reason,
    };
  });
  return {
    attempted: statuses.length > 0,
    completed: statuses.every((status) => status === 'terminated' || status === 'not_running'),
    orphan_count: statuses.filter((status) => status === 'refused').length,
    statuses,
    targets,
  };
}

export function redactWorkspaceLaunchArgv(args: string[]): string[] {
  const redacted: string[] = [];
  let redactNext = false;
  for (const arg of args) {
    if (redactNext) {
      redacted.push('<redacted>');
      redactNext = false;
      continue;
    }
    if (isSecretOption(arg)) {
      redacted.push(arg.includes('=') ? `${arg.slice(0, arg.indexOf('='))}=<redacted>` : arg);
      if (!arg.includes('=')) redactNext = true;
      continue;
    }
    redacted.push(redactWorkspaceLaunchText(arg));
  }
  return redacted;
}

export function redactWorkspaceLaunchCommand(command: string): string {
  return redactWorkspaceLaunchText(command);
}

export function redactWorkspaceLaunchText(value: string): string {
  return value
    .replace(/((?:["']?(?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)["']?)\s*[=:]\s*["'])([^"']*)(["'])/gi, '$1<redacted>$3')
    .replace(/((?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)\s*[=:]\s*)([^\s,;]+)/gi, '$1<redacted>')
    .replace(/(["']?--?(?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)["']?)(\s+)(["'])[^"']*\3/gi, '$1$2$3<redacted>$3')
    .replace(/(["']?--?(?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)["']?)(\s+)([^\s,;"']+)/gi, '$1$2<redacted>')
    .replace(/(Bearer\s+)[^\s,;]+/gi, '$1<redacted>')
    .slice(0, 2000);
}

function isSecretOption(value: string): boolean {
  return /^--?(?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)(?:=|$)/i.test(value);
}

function terminateOwnedProcess(launch: WorkspaceLaunchProcessLaunch): {
  status: 'terminated' | 'not_running' | 'refused';
  reason: string;
} {
  if (typeof launch.pid !== 'number' || launch.pid <= 0) {
    return { status: 'not_running', reason: 'no live process id was recorded' };
  }
  if (!launch.owner_ref) {
    return { status: 'refused', reason: 'process ownership reference is missing' };
  }
  const registered = ownedProcessRegistry.get(launch.pid);
  if (registered !== launch || registered.owner_ref !== launch.owner_ref) {
    return { status: 'refused', reason: 'process is not registered as an owned child of this launch executor' };
  }
  if (!isProcessAlive(launch.pid)) {
    ownedProcessRegistry.delete(launch.pid);
    return { status: 'not_running', reason: 'owned process was already absent' };
  }
  try {
    if (process.platform === 'win32') {
      runGovernedCommandSync('taskkill', ['/PID', String(launch.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-launch.pid, 'SIGTERM');
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    if (code !== 'ESRCH') return { status: 'refused', reason: 'owned process tree termination was refused' };
  }
  if (isProcessAlive(launch.pid)) {
    return { status: 'refused', reason: 'owned process remained alive after tree termination request' };
  }
  ownedProcessRegistry.delete(launch.pid);
  return { status: 'terminated', reason: 'owned process tree terminated' };
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
