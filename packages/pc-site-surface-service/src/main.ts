#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { spawnHiddenPostureProcess } from '@narada-core/process-launch-posture';
import {
  PcSiteSurfaceServiceClient,
  createPcSiteSurfaceService,
  pcSiteSurfaceAuthorityRef,
} from './index.js';

type JsonRecord = Record<string, unknown>;

export type PcSiteSurfaceServiceCommandOptions = {
  site_root: string;
  host?: string;
  port?: number;
  state_root?: string;
  timeout_ms?: number;
  mcp_surfaces_root?: string;
  surface_id?: string;
  projection_id?: string;
  instance_id?: string;
  expected_generation_id?: string;
  request_id?: string;
  reason?: string;
  drain_timeout_ms?: number;
  watchdog_interval_minutes?: number;
  node_path?: string;
  task_name?: string;
  incident_id?: string;
  target?: string;
  max_bytes?: number;
};

const DEFAULT_PORT = 61_741;
const DEFAULT_HOST = '127.0.0.1';
const execFileAsync = promisify(execFile);

export type PcSiteSurfaceServiceWatchdogPlan = {
  schema: 'narada.pc_site_surface_service.watchdog_plan.v1';
  task_name: string;
  site_id: string;
  site_root: string;
  executable: string;
  arguments: string;
  working_directory: string;
  interval_minutes: number;
  hidden: true;
  multiple_instances: 'IgnoreNew';
};

export function resolveWatchdogNodePath(input: {
  node_path?: string;
  exec_path?: string;
  node_version?: string;
  environment?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
} = {}): string {
  if (input.node_path) return resolve(input.node_path);
  const execPath = resolve(input.exec_path ?? process.execPath);
  const environment = input.environment ?? process.env;
  const nodeVersion = input.node_version ?? process.version;
  const fnmRoot = environment.FNM_DIR
    ?? (environment.APPDATA ? join(environment.APPDATA, 'fnm') : undefined);
  const stableFnmPath = fnmRoot
    ? resolve(fnmRoot, 'node-versions', nodeVersion, 'installation', 'node.exe')
    : undefined;
  if (stableFnmPath && (input.exists ?? existsSync)(stableFnmPath)) return stableFnmPath;
  if (/[\\/]fnm_multishells[\\/]/i.test(execPath)) {
    throw new Error(`pc_site_surface_service_stable_node_path_required:${stableFnmPath ?? execPath}`);
  }
  return execPath;
}

function paths(options: PcSiteSurfaceServiceCommandOptions) {
  const stateRoot = resolve(options.state_root ?? join(resolve(options.site_root), '.narada', 'runtime', 'mcp-surface-service'));
  return {
    stateRoot,
    statePath: join(stateRoot, 'state.json'),
    tokenPath: join(stateRoot, 'token'),
    logPath: join(stateRoot, 'service.log'),
  };
}

export async function replacePcSiteSurfaceGeneration(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  const servicePaths = paths(options);
  const [state, token] = await Promise.all([
    readJsonFile(servicePaths.statePath, 'pc_site_surface_service_state_unavailable'),
    readFile(servicePaths.tokenPath, 'utf8').then((value) => value.trim()),
  ]);
  const siteId = requiredOption(state.site_id, 'state.site_id');
  const url = requiredOption(state.url, 'state.url');
  const client = new PcSiteSurfaceServiceClient({ url, token });
  return client.replaceGeneration({
    site_id: siteId,
    authority_ref: pcSiteSurfaceAuthorityRef(siteId),
    surface_id: requiredOption(options.surface_id, 'surface-id'),
    projection_id: requiredOption(options.projection_id, 'projection-id'),
    instance_id: requiredOption(options.instance_id, 'instance-id'),
    expected_generation_id: requiredOption(options.expected_generation_id, 'expected-generation-id'),
    request_id: requiredOption(options.request_id, 'request-id'),
    reason: requiredOption(options.reason, 'reason'),
    ...(options.drain_timeout_ms !== undefined ? { drain_timeout_ms: options.drain_timeout_ms } : {}),
  });
}

export async function writePcSiteSurfaceHeapSnapshot(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  const servicePaths = paths(options);
  const [state, token] = await Promise.all([
    readJsonFile(servicePaths.statePath, 'pc_site_surface_service_state_unavailable'),
    readFile(servicePaths.tokenPath, 'utf8').then((value) => value.trim()),
  ]);
  const client = new PcSiteSurfaceServiceClient({ url: requiredOption(state.url, 'state.url'), token });
  const target = requiredOption(options.target, 'target');
  return client.writeHeapSnapshot({
    incident_id: requiredOption(options.incident_id, 'incident-id'),
    reason: requiredOption(options.reason, 'reason'),
    target,
    ...(target === 'surface_generation' ? {
      instance_id: requiredOption(options.instance_id, 'instance-id'),
      expected_generation_id: requiredOption(options.expected_generation_id, 'expected-generation-id'),
    } : {}),
    ...(options.max_bytes !== undefined ? { max_bytes: options.max_bytes } : {}),
  });
}

export function pcSiteSurfaceServiceWatchdogPlan(
  options: PcSiteSurfaceServiceCommandOptions,
  siteId: string,
): PcSiteSurfaceServiceWatchdogPlan {
  const siteRoot = resolve(options.site_root);
  const mcpSurfacesRoot = resolve(requiredOption(options.mcp_surfaces_root, 'mcp-surfaces-root'));
  const executable = resolveWatchdogNodePath({ node_path: options.node_path });
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const entrypoint = join(packageRoot, 'dist', 'main.js');
  const intervalMinutes = options.watchdog_interval_minutes ?? 1;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    throw new Error('pc_site_surface_service_watchdog_interval_invalid');
  }
  return {
    schema: 'narada.pc_site_surface_service.watchdog_plan.v1',
    task_name: options.task_name ?? `Narada-PC-Site-Surface-Service-${siteId}`,
    site_id: siteId,
    site_root: siteRoot,
    executable,
    arguments: [
      quoteWindowsArgument(entrypoint),
      'ensure',
      '--site-root', quoteWindowsArgument(siteRoot),
      '--mcp-surfaces-root', quoteWindowsArgument(mcpSurfacesRoot),
    ].join(' '),
    working_directory: siteRoot,
    interval_minutes: intervalMinutes,
    hidden: true,
    multiple_instances: 'IgnoreNew',
  };
}

export async function installPcSiteSurfaceServiceWatchdog(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  assertWindowsWatchdog();
  const siteId = await siteIdFromRegistry(options.site_root);
  const plan = pcSiteSurfaceServiceWatchdogPlan(options, siteId);
  const result = await runWatchdogPowerShell([
    '$ErrorActionPreference = "Stop"',
    '$action = New-ScheduledTaskAction -Execute $env:NARADA_WATCHDOG_EXECUTABLE -Argument $env:NARADA_WATCHDOG_ARGUMENTS -WorkingDirectory $env:NARADA_WATCHDOG_WORKING_DIRECTORY',
    '$repeating = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes ([int]$env:NARADA_WATCHDOG_INTERVAL_MINUTES))',
    '$settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew',
    '$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name',
    '$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited',
    '$existing = Get-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME -ErrorAction SilentlyContinue',
    'if ($existing -and $existing.State -eq "Running") { Stop-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME }',
    'Register-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME -Action $action -Trigger $repeating -Settings $settings -Principal $principal -Description "Narada PC Site MCP surface runtime availability watchdog." -Force | Out-Null',
    'Start-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME',
    '[pscustomobject]@{status="installed";task_name=$env:NARADA_WATCHDOG_TASK_NAME} | ConvertTo-Json -Compress',
  ], watchdogEnvironment(plan));
  return { schema: 'narada.pc_site_surface_service.watchdog_install.v1', plan, ...result };
}

export async function pcSiteSurfaceServiceWatchdogStatus(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  assertWindowsWatchdog();
  const siteId = await siteIdFromRegistry(options.site_root);
  const plan = pcSiteSurfaceServiceWatchdogPlan(options, siteId);
  const result = await runWatchdogPowerShell([
    '$task = Get-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME -ErrorAction SilentlyContinue',
    'if (-not $task) { [pscustomobject]@{status="not_installed";task_name=$env:NARADA_WATCHDOG_TASK_NAME} | ConvertTo-Json -Compress; exit 0 }',
    '$info = Get-ScheduledTaskInfo -TaskName $env:NARADA_WATCHDOG_TASK_NAME',
    '[pscustomobject]@{status="installed";task_name=$task.TaskName;state=[string]$task.State;last_run_time=$info.LastRunTime;next_run_time=$info.NextRunTime;last_task_result=$info.LastTaskResult;execute=$task.Actions.Execute;arguments=$task.Actions.Arguments;hidden=$task.Settings.Hidden;multiple_instances=[string]$task.Settings.MultipleInstances} | ConvertTo-Json -Compress',
  ], watchdogEnvironment(plan));
  const coherent = result.status === 'installed'
    && result.execute === plan.executable
    && result.arguments === plan.arguments
    && result.hidden === true
    && result.multiple_instances === plan.multiple_instances;
  return { schema: 'narada.pc_site_surface_service.watchdog_status.v1', plan, coherent, ...result };
}

export async function removePcSiteSurfaceServiceWatchdog(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  assertWindowsWatchdog();
  const siteId = await siteIdFromRegistry(options.site_root);
  const plan = pcSiteSurfaceServiceWatchdogPlan(options, siteId);
  const result = await runWatchdogPowerShell([
    '$task = Get-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME -ErrorAction SilentlyContinue',
    'if ($task) { Unregister-ScheduledTask -TaskName $env:NARADA_WATCHDOG_TASK_NAME -Confirm:$false; $status = "removed" } else { $status = "not_installed" }',
    '[pscustomobject]@{status=$status;task_name=$env:NARADA_WATCHDOG_TASK_NAME} | ConvertTo-Json -Compress',
  ], watchdogEnvironment(plan));
  return { schema: 'narada.pc_site_surface_service.watchdog_remove.v1', plan, ...result };
}

function watchdogEnvironment(plan: PcSiteSurfaceServiceWatchdogPlan): Record<string, string> {
  return {
    NARADA_WATCHDOG_TASK_NAME: plan.task_name,
    NARADA_WATCHDOG_EXECUTABLE: plan.executable,
    NARADA_WATCHDOG_ARGUMENTS: plan.arguments,
    NARADA_WATCHDOG_WORKING_DIRECTORY: plan.working_directory,
    NARADA_WATCHDOG_INTERVAL_MINUTES: String(plan.interval_minutes),
  };
}

async function runWatchdogPowerShell(lines: string[], environment: Record<string, string>): Promise<JsonRecord> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', lines.join('\n')], {
    windowsHide: true,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    timeout: 30_000,
  });
  const text = String(stdout).trim();
  if (!text) throw new Error('pc_site_surface_service_watchdog_output_missing');
  return JSON.parse(text) as JsonRecord;
}

async function siteIdFromRegistry(siteRoot: string): Promise<string> {
  const registry = await readJsonFile(join(resolve(siteRoot), '.narada', 'capabilities', 'mcp-surfaces.json'), 'pc_site_surface_service_registry_unavailable');
  return requiredOption(registry.site_id, 'registry.site_id');
}

async function readJsonFile(path: string, code: string): Promise<JsonRecord> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as JsonRecord;
  } catch (error) {
    throw new Error(`${code}:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredOption(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`pc_site_surface_service_option_required:${name}`);
  return text;
}

function quoteWindowsArgument(value: string): string {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function assertWindowsWatchdog(): void {
  if (process.platform !== 'win32') throw new Error('pc_site_surface_service_watchdog_windows_required');
}

function serviceUrl(options: PcSiteSurfaceServiceCommandOptions): string {
  return `http://${options.host ?? DEFAULT_HOST}:${options.port ?? DEFAULT_PORT}`;
}

async function ensureToken(path: string): Promise<string> {
  try {
    const existing = (await readFile(path, 'utf8')).trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }).catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  });
  await chmod(path, 0o600).catch(() => undefined);
  return (await readFile(path, 'utf8')).trim();
}

async function writeState(path: string, state: JsonRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function authenticatedRequest(url: string, token: string, method = 'GET'): Promise<Response> {
  return fetch(url, { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2_000) });
}

export async function probePcSiteSurfaceService(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  const { tokenPath } = paths(options);
  let token: string;
  try {
    token = (await readFile(tokenPath, 'utf8')).trim();
  } catch {
    return { status: 'unavailable', reason: 'token_unavailable', url: serviceUrl(options) };
  }
  try {
    const response = await authenticatedRequest(`${serviceUrl(options)}/v1/status`, token);
    const body = await response.json() as JsonRecord;
    return response.ok ? { ...body, status: 'ready', url: serviceUrl(options) } : { status: 'unavailable', reason: String(body.code ?? response.status), url: serviceUrl(options) };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error), url: serviceUrl(options) };
  }
}

export async function servePcSiteSurfaceService(options: PcSiteSurfaceServiceCommandOptions): Promise<void> {
  const siteRoot = resolve(options.site_root);
  const servicePaths = paths(options);
  const token = await ensureToken(servicePaths.tokenPath);
  const service = await createPcSiteSurfaceService({
    site_root: siteRoot,
    token,
    host: options.host ?? DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
    ...(options.mcp_surfaces_root ? { mcp_surfaces_root: options.mcp_surfaces_root } : {}),
  });
  await writeState(servicePaths.statePath, {
    schema: 'narada.pc_site_surface_service.state.v1',
    status: 'ready',
    pid: process.pid,
    site_root: siteRoot,
    site_id: service.site_id,
    authority_ref: service.authority_ref,
    url: service.url,
    token_path: servicePaths.tokenPath,
    started_at: new Date().toISOString(),
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await service.close();
    await rm(servicePaths.statePath, { force: true });
  };
  process.once('SIGINT', () => void stop().then(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().then(() => process.exit(0)));
  await new Promise<void>((resolvePromise) => process.once('beforeExit', () => resolvePromise()));
  await rm(servicePaths.statePath, { force: true });
}

export async function ensurePcSiteSurfaceService(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  const existing = await probePcSiteSurfaceService(options);
  if (existing.status === 'ready') return { ...existing, ownership: 'existing' };
  const servicePaths = paths(options);
  const token = await ensureToken(servicePaths.tokenPath);
  await mkdir(servicePaths.stateRoot, { recursive: true });
  const logFd = openSync(servicePaths.logPath, 'a');
  try {
    const child = spawnHiddenPostureProcess(process.execPath, [
      fileURLToPath(import.meta.url),
      'serve',
      '--site-root', resolve(options.site_root),
      '--host', options.host ?? DEFAULT_HOST,
      '--port', String(options.port ?? DEFAULT_PORT),
      '--state-root', servicePaths.stateRoot,
      ...(options.mcp_surfaces_root ? ['--mcp-surfaces-root', resolve(options.mcp_surfaces_root)] : []),
    ], {
      posture: 'mcp_server',
      cwd: resolve(options.site_root),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    });
    child.unref();
  } finally {
    closeSync(logFd);
  }

  const deadline = Date.now() + (options.timeout_ms ?? 15_000);
  let status: JsonRecord = existing;
  while (Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    status = await probePcSiteSurfaceService(options);
    if (status.status === 'ready') {
      return { ...status, ownership: 'started', token_path: servicePaths.tokenPath };
    }
  }
  throw new Error(`pc_site_surface_service_start_timeout:${String(status.reason ?? 'unavailable')}:${servicePaths.logPath}:${token.length > 0 ? 'token_ready' : 'token_missing'}`);
}

export async function stopPcSiteSurfaceService(options: PcSiteSurfaceServiceCommandOptions): Promise<JsonRecord> {
  const servicePaths = paths(options);
  let token: string;
  try {
    token = (await readFile(servicePaths.tokenPath, 'utf8')).trim();
  } catch {
    return { status: 'not_running', reason: 'token_unavailable' };
  }
  try {
    const response = await authenticatedRequest(`${serviceUrl(options)}/v1/shutdown`, token, 'POST');
    if (!response.ok) throw new Error(`shutdown_status_${response.status}`);
  } catch (error) {
    const current = await probePcSiteSurfaceService(options);
    if (current.status !== 'ready') {
      await rm(servicePaths.statePath, { force: true });
      return { status: 'not_running', reason: current.reason ?? (error instanceof Error ? error.message : String(error)) };
    }
    throw error;
  }
  const deadline = Date.now() + (options.timeout_ms ?? 10_000);
  while (Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    const current = await probePcSiteSurfaceService(options);
    if (current.status !== 'ready') {
      await rm(servicePaths.statePath, { force: true });
      return { status: 'stopped' };
    }
  }
  throw new Error('pc_site_surface_service_stop_timeout');
}

function parseArgs(argv: string[]): { command: string; options: PcSiteSurfaceServiceCommandOptions } {
  const command = argv[0] ?? 'status';
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`pc_site_surface_service_argument_invalid:${key ?? 'missing'}`);
    values.set(key.slice(2), value);
    index += 1;
  }
  const siteRoot = values.get('site-root') ?? process.env.NARADA_SITE_ROOT;
  if (!siteRoot) throw new Error('pc_site_surface_service_site_root_required');
  return {
    command,
    options: {
      site_root: siteRoot,
      ...(values.has('host') ? { host: values.get('host') } : {}),
      ...(values.has('port') ? { port: Number(values.get('port')) } : {}),
      ...(values.has('state-root') ? { state_root: values.get('state-root') } : {}),
      ...(values.has('timeout-ms') ? { timeout_ms: Number(values.get('timeout-ms')) } : {}),
      ...(values.has('mcp-surfaces-root') ? { mcp_surfaces_root: values.get('mcp-surfaces-root') } : {}),
      ...(values.has('surface-id') ? { surface_id: values.get('surface-id') } : {}),
      ...(values.has('projection-id') ? { projection_id: values.get('projection-id') } : {}),
      ...(values.has('instance-id') ? { instance_id: values.get('instance-id') } : {}),
      ...(values.has('expected-generation-id') ? { expected_generation_id: values.get('expected-generation-id') } : {}),
      ...(values.has('request-id') ? { request_id: values.get('request-id') } : {}),
      ...(values.has('reason') ? { reason: values.get('reason') } : {}),
      ...(values.has('drain-timeout-ms') ? { drain_timeout_ms: Number(values.get('drain-timeout-ms')) } : {}),
      ...(values.has('watchdog-interval-minutes') ? { watchdog_interval_minutes: Number(values.get('watchdog-interval-minutes')) } : {}),
      ...(values.has('node-path') ? { node_path: values.get('node-path') } : {}),
      ...(values.has('task-name') ? { task_name: values.get('task-name') } : {}),
      ...(values.has('incident-id') ? { incident_id: values.get('incident-id') } : {}),
      ...(values.has('target') ? { target: values.get('target') } : {}),
      ...(values.has('max-bytes') ? { max_bytes: Number(values.get('max-bytes')) } : {}),
    },
  };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'serve') return servePcSiteSurfaceService(options);
  const result = command === 'ensure'
    ? await ensurePcSiteSurfaceService(options)
    : command === 'stop'
      ? await stopPcSiteSurfaceService(options)
      : command === 'status'
        ? await probePcSiteSurfaceService(options)
        : command === 'replace-generation'
          ? await replacePcSiteSurfaceGeneration(options)
          : command === 'heap-snapshot'
            ? await writePcSiteSurfaceHeapSnapshot(options)
          : command === 'watchdog-install'
            ? await installPcSiteSurfaceServiceWatchdog(options)
            : command === 'watchdog-status'
              ? await pcSiteSurfaceServiceWatchdogStatus(options)
              : command === 'watchdog-remove'
                ? await removePcSiteSurfaceServiceWatchdog(options)
        : (() => { throw new Error(`pc_site_surface_service_command_unknown:${command}`); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2] ?? 'status';
  void main().then(() => {
    if (command !== 'serve') process.exit(0);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
