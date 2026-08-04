#!/usr/bin/env node
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { spawnHiddenPostureProcess } from '@narada-core/process-launch-posture';

const execFileAsync = promisify(execFile);
type JsonRecord = Record<string, unknown>;
type Options = { site_root: string; service_url?: string; token_path?: string; interval_ms?: number; task_name?: string; node_path?: string; incident_id?: string; status?: string; note?: string };

export function observerPaths(siteRoot: string) {
  const root = join(resolve(siteRoot), '.narada', 'runtime', 'mcp-runtime-observer');
  return { root, state: join(root, 'state.json'), log: join(root, 'observer.log'), db: join(root, 'observations.db'), sources: join(root, 'sources') };
}

function nativeBinary(): string {
  return resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'native', 'target', 'release', `narada-pc-site-runtime-observer${process.platform === 'win32' ? '.exe' : ''}`);
}

export function observerWatchdogPlan(options: Options, siteId: string) {
  const entrypoint = fileURLToPath(import.meta.url);
  return {
    task_name: options.task_name ?? `Narada-PC-Site-Runtime-Observer-${siteId}`,
    executable: resolveObserverNodePath(options.node_path),
    arguments: `"${entrypoint}" ensure --site-root "${resolve(options.site_root)}"`,
    working_directory: resolve(options.site_root),
    interval_minutes: 1,
    hidden: true,
    multiple_instances: 'IgnoreNew',
  };
}

export function resolveObserverNodePath(explicit?: string): string {
  if (explicit) return resolve(explicit);
  const execPath = resolve(process.execPath);
  const fnmRoot = process.env.FNM_DIR ?? (process.env.APPDATA ? join(process.env.APPDATA, 'fnm') : undefined);
  const stable = fnmRoot ? resolve(fnmRoot, 'node-versions', process.version, 'installation', 'node.exe') : undefined;
  if (stable && existsSync(stable)) return stable;
  if (/[\\/]fnm_multishells[\\/]/i.test(execPath)) throw new Error(`pc_site_runtime_observer_stable_node_path_required:${stable ?? execPath}`);
  return execPath;
}

async function readServiceState(siteRoot: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(join(resolve(siteRoot), '.narada', 'runtime', 'mcp-surface-service', 'state.json'), 'utf8')) as JsonRecord;
}

async function nativeArgs(options: Options, command: string): Promise<string[]> {
  const service = await readServiceState(options.site_root);
  const paths = observerPaths(options.site_root);
  return [command, '--site-root', resolve(options.site_root), '--db', paths.db,
    '--service-url', options.service_url ?? String(service.url), '--token-path', options.token_path ?? String(service.token_path),
    ...(options.interval_ms ? ['--interval-ms', String(options.interval_ms)] : []),
    ...(options.incident_id ? ['--incident-id', options.incident_id] : []),
    ...(options.status ? ['--status', options.status] : []),
    ...(options.note ? ['--note', options.note] : [])];
}

export async function runObserverCommand(command: string, options: Options): Promise<JsonRecord> {
  const paths = observerPaths(options.site_root);
  if (command === 'serve' || command === 'sample-once' || command === 'review-incident') {
    const child = spawn(nativeBinary(), await nativeArgs(options, command), { stdio: 'inherit', windowsHide: true });
    const code = await new Promise<number>((resolvePromise, reject) => { child.once('error', reject); child.once('exit', (value) => resolvePromise(value ?? 1)); });
    if (code !== 0) throw new Error(`pc_site_runtime_observer_native_failed:${code}`);
    return { status: 'completed', command, db_path: paths.db };
  }
  if (command === 'status' || command === 'doctor') {
    try {
      const state = JSON.parse(await readFile(paths.state, 'utf8')) as JsonRecord;
      const pid = Number(state.pid);
      const expectedExecutable = typeof state.executable_path === 'string' ? resolve(state.executable_path) : null;
      const identity = await inspectProcessIdentity(pid);
      const coherent = identity.alive && expectedExecutable !== null && identity.executable_path !== null
        && resolve(identity.executable_path).toLowerCase() === expectedExecutable.toLowerCase();
      return { schema: 'narada.pc_site_runtime_observer.status.v1', status: coherent ? 'ready' : 'stale', state, process_identity: identity, db_exists: existsSync(paths.db) };
    } catch (error) {
      return { schema: 'narada.pc_site_runtime_observer.status.v1', status: 'unavailable', reason: error instanceof Error ? error.message : String(error), db_exists: existsSync(paths.db) };
    }
  }
  if (command === 'ensure') {
    const status = await runObserverCommand('status', options);
    if (status.status === 'ready') return { ...status, ownership: 'existing' };
    await mkdir(paths.root, { recursive: true });
    const fd = openSync(paths.log, 'a');
    try {
      const child = spawnHiddenPostureProcess(nativeBinary(), await nativeArgs(options, 'serve'), { posture: 'runtime_observer', cwd: resolve(options.site_root), detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
      child.unref();
    } finally { closeSync(fd); }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      const current = await runObserverCommand('status', options);
      if (current.status === 'ready') return { ...current, ownership: 'started' };
    }
    throw new Error(`pc_site_runtime_observer_start_timeout:${paths.log}`);
  }
  if (command === 'stop') {
    const status = await runObserverCommand('status', options);
    const pid = Number((status.state as JsonRecord | undefined)?.pid);
    if (status.status !== 'ready' || !Number.isInteger(pid)) return { status: 'not_running' };
    process.kill(pid, 'SIGTERM');
    await rm(paths.state, { force: true });
    return { status: 'stopped', pid };
  }
  if (command === 'watchdog-install') {
    if (process.platform !== 'win32') throw new Error('pc_site_runtime_observer_watchdog_windows_required');
    const registry = JSON.parse(await readFile(join(resolve(options.site_root), '.narada', 'capabilities', 'mcp-surfaces.json'), 'utf8')) as JsonRecord;
    const plan = observerWatchdogPlan(options, String(registry.site_id));
    const script = [
      '$action=New-ScheduledTaskAction -Execute $env:EXE -Argument $env:ARGS -WorkingDirectory $env:CWD',
      '$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)',
      '$settings=New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew',
      '$principal=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited',
      'Register-ScheduledTask -TaskName $env:TASK -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Narada MCP runtime evidence observer watchdog." -Force|Out-Null',
      'Start-ScheduledTask -TaskName $env:TASK',
    ].join('\n');
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, TASK: plan.task_name, EXE: plan.executable, ARGS: plan.arguments, CWD: plan.working_directory } });
    return { status: 'installed', plan };
  }
  if (command === 'watchdog-status' || command === 'watchdog-remove') {
    if (process.platform !== 'win32') throw new Error('pc_site_runtime_observer_watchdog_windows_required');
    const registry = JSON.parse(await readFile(join(resolve(options.site_root), '.narada', 'capabilities', 'mcp-surfaces.json'), 'utf8')) as JsonRecord;
    const plan = observerWatchdogPlan(options, String(registry.site_id));
    if (command === 'watchdog-remove') {
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$task=Get-ScheduledTask -TaskName $env:TASK -ErrorAction SilentlyContinue;if($task){Unregister-ScheduledTask -TaskName $env:TASK -Confirm:$false}'], { windowsHide: true, env: { ...process.env, TASK: plan.task_name } });
      return { status: 'removed', plan };
    }
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$task=Get-ScheduledTask -TaskName $env:TASK -ErrorAction SilentlyContinue;if(-not $task){"null"}else{$task|Select-Object TaskName,State,@{n="Execute";e={$_.Actions.Execute}},@{n="Arguments";e={$_.Actions.Arguments}}|ConvertTo-Json -Compress}'], { windowsHide: true, env: { ...process.env, TASK: plan.task_name } });
    const task = JSON.parse(String(stdout).trim()) as JsonRecord | null;
    return { status: task ? 'installed' : 'not_installed', coherent: !!task && task.Execute === plan.executable && task.Arguments === plan.arguments, plan, task };
  }
  throw new Error(`pc_site_runtime_observer_command_unknown:${command}`);
}

async function inspectProcessIdentity(pid: number): Promise<{ alive: boolean; executable_path: string | null }> {
  if (!Number.isInteger(pid) || pid <= 0) return { alive: false, executable_path: null };
  if (process.platform === 'win32') {
    const script = '$p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$env:TARGET_PID) -ErrorAction SilentlyContinue;if(-not $p){"null"}else{$p|Select-Object ExecutablePath|ConvertTo-Json -Compress}';
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, TARGET_PID: String(pid) } });
    const value = JSON.parse(String(stdout).trim()) as { ExecutablePath?: string } | null;
    return { alive: value !== null, executable_path: value?.ExecutablePath ?? null };
  }
  try { process.kill(pid, 0); return { alive: true, executable_path: null }; } catch { return { alive: false, executable_path: null }; }
}

function parse(argv: string[]): { command: string; options: Options } {
  const command = argv[0] ?? 'status';
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) values.set(String(argv[i]).replace(/^--/, ''), String(argv[i + 1] ?? ''));
  const siteRoot = values.get('site-root') || process.env.NARADA_SITE_ROOT;
  if (!siteRoot) throw new Error('pc_site_runtime_observer_site_root_required');
  return { command, options: { site_root: siteRoot, ...(values.get('service-url') ? { service_url: values.get('service-url') } : {}), ...(values.get('token-path') ? { token_path: values.get('token-path') } : {}), ...(values.get('interval-ms') ? { interval_ms: Number(values.get('interval-ms')) } : {}), ...(values.get('node-path') ? { node_path: values.get('node-path') } : {}), ...(values.get('incident-id') ? { incident_id: values.get('incident-id') } : {}), ...(values.get('status') ? { status: values.get('status') } : {}), ...(values.get('note') ? { note: values.get('note') } : {}) } };
}

async function main() { const { command, options } = parse(process.argv.slice(2)); process.stdout.write(`${JSON.stringify(await runObserverCommand(command, options), null, 2)}\n`); }
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
