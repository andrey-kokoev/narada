import { randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachOperatorRouter,
  ensureOperatorRouter,
  readOperatorRouterAdminRoutes,
  readOperatorRouterRoutes,
  registerOperatorRoute,
  registerOperatorRouteSet,
  routeProjectionMatchesIdentity,
  unregisterOperatorRoute,
  type EnsureOperatorRouterResult,
  type OperatorRouterRouteRegistration,
  type OperatorRouterRouteProjection,
} from '@narada-core/operator-router';
import {
  runGovernedCommandSync,
  spawnHiddenPostureProcess,
} from '@narada-core/process-launch-posture';

const OPERATOR_CONSOLE_ROUTE_ID = 'operator-console';
const OPERATOR_CONSOLE_ROUTE_CLASS = 'operator-console' as const;
// A first local start may synchronously materialize the Operator Console UI
// artifact before the backend can register its Router route. The artifact
// build itself is bounded at 120 seconds, so the lifecycle wait and singleton
// lock must cover that same governed boundary rather than timing out while
// the child is still doing legitimate startup work.
const DEFAULT_RUNTIME_TIMEOUT_MS = 120_000;
const DEFAULT_LOCK_TIMEOUT_MS = 120_000;
const LOCK_STALE_AFTER_MS = 30_000;
const POLL_INTERVAL_MS = 100;
// Operator Router caps a route request timeout at 120 seconds. Keep the
// console projection at that contract boundary rather than silently asking
// the router to accept an invalid one-hour value.
const OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;
const MAX_RUNTIME_LOG_FILES = 8;

type JsonRecord = Record<string, unknown>;
type FetchFunction = typeof fetch;

export type OperatorConsoleRuntimeReadiness = 'ready' | 'unavailable' | 'degraded';

export interface OperatorConsoleRuntimeStatus {
  schema: 'narada.operator_console_runtime.status.v1';
  status: OperatorConsoleRuntimeReadiness;
  url: string;
  router_url: string | null;
  route_id: string;
  route_state: 'healthy' | 'degraded' | 'absent';
  ownership: 'started' | 'attached' | 'none';
  reason?: string;
  detail?: string;
  process?: {
    pid: number;
    log_path: string;
    state_path: string;
    instance_nonce?: string;
  };
}

export interface OperatorConsoleRuntimeProbe extends OperatorConsoleRuntimeStatus {
  route?: OperatorRouterRouteProjection | OperatorRouterRouteRegistration;
}

export interface OperatorConsoleRuntimeOptions {
  host?: string;
  port?: number;
  router_state_root?: string;
  runtime_state_root?: string;
  narada_root?: string;
  cli_entrypoint?: string;
  instance_nonce?: string;
  timeout_ms?: number;
  lock_timeout_ms?: number;
  fetch_fn?: FetchFunction;
}

export interface EnsureOperatorConsoleRuntimeOptions extends OperatorConsoleRuntimeOptions {}

export interface StopOperatorConsoleRuntimeOptions extends OperatorConsoleRuntimeOptions {}

export interface ServeOperatorConsoleBackend {
  url: string;
  stop(): Promise<void>;
}

export interface ServeOperatorConsoleRuntimeOptions extends OperatorConsoleRuntimeOptions {
  create_backend(router_url: string): Promise<ServeOperatorConsoleBackend>;
  open_workspace?: (url: string) => Promise<unknown> | unknown;
  on_startup?: (info: {
    url: string;
    router_url: string;
    ownership: 'started' | 'attached';
    process_pid: number;
    browser_result?: unknown;
  }) => void;
  on_shutdown?: () => void;
}

export interface ServeOperatorConsoleRuntimeResult {
  status: 'ready';
  url: string;
  router_url: string;
  ownership: 'started' | 'attached';
  process_pid: number;
  stop(): Promise<void>;
}

export interface RestartOperatorConsoleRuntimeResult {
  stopped: OperatorConsoleRuntimeStopResult;
  started: OperatorConsoleRuntimeStatus;
}

export type OperatorConsoleRuntimeStopStatus = 'not_running' | 'stopped' | 'stale_route_removed';

export interface OperatorConsoleRuntimeStopResult {
  schema: 'narada.operator_console_runtime.stop_result.v1';
  status: OperatorConsoleRuntimeStopStatus;
  router_url: string | null;
  route_id: string;
  pid: number | null;
  detail: string;
}

export class OperatorConsoleRuntimeError extends Error {
  readonly code: string;
  readonly diagnostics: Record<string, unknown>;

  constructor(code: string, diagnostics: Record<string, unknown> = {}) {
    super(code);
    this.name = 'OperatorConsoleRuntimeError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function defaultOperatorConsoleRuntimeStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NARADA_OPERATOR_CONSOLE_RUNTIME_STATE_ROOT?.trim();
  if (configured) return resolve(configured);
  const localAppData = env.LOCALAPPDATA?.trim()
    || join(env.USERPROFILE?.trim() || env.HOME?.trim() || homedir(), 'AppData', 'Local');
  return join(localAppData, 'Narada', 'operator-console-runtime');
}

export function defaultOperatorConsoleCliEntrypoint(): string {
  return fileURLToPath(new URL('../../layers/cli/dist/main.js', import.meta.url));
}

function defaultNaradaRoot(): string {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

function normalizeHost(value: string | undefined): string {
  const host = (value ?? '127.0.0.1').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_host_not_loopback', { host });
  }
  return host;
}

function normalizePort(value: number | undefined): number {
  const port = value ?? 61729;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_port_invalid', { port });
  }
  return port;
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_timeout_invalid', { timeout });
  }
  return timeout;
}

function runtimeUrl(host: string, port: number): string {
  const displayHost = host.includes(':') ? `[${host}]` : host;
  return `http://${displayHost}:${port}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function jsonResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function requestJson(
  fetchFn: FetchFunction,
  url: string,
  options: RequestInit = {},
  timeoutMs = 3_000,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetchFn(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  });
  return { response, body: await jsonResponse(response) };
}

function routeIdentityMatches(route: OperatorRouterRouteProjection | OperatorRouterRouteRegistration): boolean {
  return routeProjectionMatchesIdentity(route as OperatorRouterRouteProjection, {
    route_id: OPERATOR_CONSOLE_ROUTE_ID,
    route_class: OPERATOR_CONSOLE_ROUTE_CLASS,
    public_path: '/',
    route_mode: 'prefix',
  });
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readProcessCommandLine(pid: number): string | null {
  try {
    if (process.platform === 'win32') {
      const result = runGovernedCommandSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($p) { $p.CommandLine }`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const text = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString('utf8');
      return text?.trim() || null;
    }
    const result = runGovernedCommandSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const text = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString('utf8');
    return text?.trim() || null;
  } catch {
    return null;
  }
}

function isCanonicalConsoleProcess(commandLine: string | null, expectedInstanceNonce?: string): boolean {
  if (!commandLine) return false;
  const normalized = commandLine.replace(/[\\/]+/g, '/').toLowerCase();
  const tokens = normalized
    .replace(/["']/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const hasConsoleServe = tokens.includes('console') && tokens.includes('serve');
  const hasCanonicalEntrypoint = tokens.some((token) =>
    token.endsWith('/packages/layers/cli/dist/main.js') ||
    token.endsWith('/packages/layers/cli/dist/index.js') ||
    token === 'narada' ||
    token.endsWith('/narada') ||
    token.endsWith('/narada.mjs') ||
    token.endsWith('/narada.js'),
  );
  if (!hasConsoleServe || !hasCanonicalEntrypoint) return false;

  // Foreground `narada console serve` processes do not carry the internal
  // nonce. Detached runtime children do; when it is present, verify it so a
  // reused PID cannot be mistaken for the child that owns this route.
  const runtimeInstanceIndex = tokens.indexOf('--runtime-instance');
  if (runtimeInstanceIndex >= 0) {
    const expected = expectedInstanceNonce?.toLowerCase();
    return Boolean(expected && tokens[runtimeInstanceIndex + 1] === expected);
  }
  return true;
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processIsAlive(pid) && Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return !processIsAlive(pid);
}

async function terminateProcess(pid: number, timeoutMs: number): Promise<void> {
  if (process.platform === 'win32') {
    // Detached console hosts do not reliably observe Node's SIGTERM mapping
    // on Windows. Terminate the owned process tree first, then wait for the
    // PID to disappear; this avoids spending the full graceful-wait budget
    // before the forced cleanup can happen.
    try {
      runGovernedCommandSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      if (!processIsAlive(pid)) return;
    }
    if (await waitForProcessExit(pid, timeoutMs)) return;
    throw new OperatorConsoleRuntimeError('operator_console_runtime_stop_timeout', { pid });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    if (!processIsAlive(pid)) return;
  }
  if (await waitForProcessExit(pid, timeoutMs)) return;

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The process may have exited between the liveness check and SIGKILL.
  }
  if (!(await waitForProcessExit(pid, timeoutMs))) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_stop_timeout', { pid });
  }
}

function lockPath(runtimeStateRoot: string): string {
  return join(runtimeStateRoot, 'runtime.lock');
}

async function acquireRuntimeLock(runtimeStateRoot: string, timeoutMs: number): Promise<() => Promise<void>> {
  await mkdir(runtimeStateRoot, { recursive: true });
  const path = lockPath(runtimeStateRoot);
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const handle = await import('node:fs/promises').then(({ open }) => open(path, 'wx'));
      try {
        await handle.writeFile(JSON.stringify({
          schema: 'narada.operator_console_runtime.lock.v1',
          token,
          pid: process.pid,
          created_at: new Date().toISOString(),
        }));
      } finally {
        await handle.close();
      }
      const heartbeat = setInterval(() => {
        void utimes(path, new Date(), new Date()).catch(() => undefined);
      }, Math.max(1_000, Math.floor(LOCK_STALE_AFTER_MS / 3)));
      heartbeat.unref?.();
      return async (): Promise<void> => {
        clearInterval(heartbeat);
        try {
          const current = await readFile(path, 'utf8');
          if (current.includes(token)) await unlink(path);
        } catch {
          // Another owner may already have removed or replaced the lock.
        }
      };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      try {
        const lockStat = await stat(path);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_AFTER_MS) await unlink(path);
      } catch {
        // Race with the current owner acquiring or releasing the lock.
      }
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new OperatorConsoleRuntimeError('operator_console_runtime_lock_timeout', {
    lock_path: path,
    timeout_ms: timeoutMs,
  });
}

async function readRuntimeState(runtimeStateRoot: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(runtimeStateRoot, 'state.json'), 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeRuntimeState(runtimeStateRoot: string, state: JsonRecord): Promise<string> {
  await mkdir(runtimeStateRoot, { recursive: true });
  const statePath = join(runtimeStateRoot, 'state.json');
  const tempPath = join(runtimeStateRoot, `.state-${process.pid}-${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await rename(tempPath, statePath);
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // The rename already consumed the temporary file.
    }
  }
  return statePath;
}

async function pruneRuntimeLogs(runtimeStateRoot: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(runtimeStateRoot);
  } catch {
    return;
  }
  const logs = entries
    .filter((entry) => /^console-.*\.log$/i.test(entry))
    .sort()
    .reverse();
  for (const entry of logs.slice(MAX_RUNTIME_LOG_FILES)) {
    try {
      await unlink(join(runtimeStateRoot, entry));
    } catch {
      // A concurrent cleanup or antivirus scan may have removed the file.
    }
  }
}

async function processDiagnosticsFromState(
  runtimeStateRoot: string,
  url: string,
  pid: number | null,
): Promise<OperatorConsoleRuntimeStatus['process'] | undefined> {
  if (pid === null) return undefined;
  const state = await readRuntimeState(runtimeStateRoot);
  if (!state || state.pid !== pid || state.url !== url) return undefined;
  if (typeof state.log_path !== 'string' || typeof state.state_path !== 'string') return undefined;
  return {
    pid,
    log_path: state.log_path,
    state_path: state.state_path,
    ...(typeof state.instance_nonce === 'string' ? { instance_nonce: state.instance_nonce } : {}),
  };
}

async function removeRuntimeState(runtimeStateRoot: string): Promise<void> {
  try {
    await unlink(join(runtimeStateRoot, 'state.json'));
  } catch {
    // State may already be absent.
  }
}

async function routeFromPublicInventory(
  routerUrl: string,
  fetchFn: FetchFunction,
): Promise<OperatorRouterRouteProjection | undefined> {
  const inventory = await readOperatorRouterRoutes({ url: routerUrl, fetch_fn: fetchFn, timeout_ms: 3_000 });
  const route = inventory.routes.find((candidate) => candidate.route_id === OPERATOR_CONSOLE_ROUTE_ID);
  if (route && !routeIdentityMatches(route)) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_route_identity_conflict', {
      route_id: route.route_id,
      route_class: route.route_class,
      public_path: route.public_path,
    });
  }
  return route;
}

function unavailableStatus(url: string, reason: string, detail?: string): OperatorConsoleRuntimeProbe {
  return {
    schema: 'narada.operator_console_runtime.status.v1',
    status: 'unavailable',
    url,
    router_url: null,
    route_id: OPERATOR_CONSOLE_ROUTE_ID,
    route_state: 'absent',
    ownership: 'none',
    reason,
    detail,
  };
}

export async function probeOperatorConsoleRuntime(
  options: OperatorConsoleRuntimeOptions = {},
): Promise<OperatorConsoleRuntimeProbe> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const url = runtimeUrl(host, port);
  const fetchFn = options.fetch_fn ?? fetch;
  const runtimeStateRoot = options.runtime_state_root ?? defaultOperatorConsoleRuntimeStateRoot();

  let router: EnsureOperatorRouterResult | null;
  try {
    router = await attachOperatorRouter({
      host,
      port,
      state_root: options.router_state_root,
      fetch_fn: fetchFn,
      timeout_ms: Math.min(options.timeout_ms ?? 3_000, 10_000),
    });
  } catch (error) {
    return unavailableStatus(url, 'operator_router_unavailable', error instanceof Error ? error.message : String(error));
  }
  if (!router) return unavailableStatus(url, 'operator_router_not_running');

  let route: OperatorRouterRouteProjection | undefined;
  try {
    const health = await requestJson(fetchFn, `${router.url}/health`, {}, 3_000);
    if (!health.response.ok || !isRecord(health.body) || health.body.status !== 'healthy') {
      return { ...unavailableStatus(url, 'operator_router_unhealthy'), router_url: router.url, ownership: 'attached' };
    }
    route = await routeFromPublicInventory(router.url, fetchFn);
  } catch (error) {
    return {
      ...unavailableStatus(url, 'operator_console_route_inventory_unavailable', error instanceof Error ? error.message : String(error)),
      router_url: router.url,
      ownership: 'attached',
    };
  }

  if (!route) {
    return {
      ...unavailableStatus(url, 'operator_console_route_missing'),
      router_url: router.url,
      ownership: 'attached',
    };
  }
  if (route.state !== 'healthy') {
    return {
      ...unavailableStatus(url, 'operator_console_route_degraded'),
      route_state: 'degraded',
      router_url: router.url,
      ownership: 'attached',
      route,
    };
  }

  try {
    const admin = {
      url: router.url,
      registration_token: router.registration_token,
      state_root: router.state_root ?? options.router_state_root,
      fetch_fn: fetchFn,
      timeout_ms: 3_000,
    };
    const adminInventory = await readOperatorConsoleAdminRoutes(admin);
    const registration = adminInventory.routes.find((candidate) => candidate.route_id === OPERATOR_CONSOLE_ROUTE_ID);
    if (!registration || !routeIdentityMatches(registration)) {
      return {
        ...unavailableStatus(url, 'operator_console_admin_route_missing'),
        router_url: router.url,
        ownership: 'attached',
        route,
      };
    }
    if (!registration.health_url) {
      return {
        ...unavailableStatus(url, 'operator_console_health_target_missing'),
        router_url: router.url,
        ownership: 'attached',
        route: registration,
      };
    }
    const backendHealth = await requestJson(fetchFn, registration.health_url, {}, 3_000);
    if (!backendHealth.response.ok) {
      return {
        ...unavailableStatus(url, 'operator_console_backend_unhealthy', `status_${backendHealth.response.status}`),
        status: 'degraded',
        route_state: 'degraded',
        router_url: router.url,
        ownership: 'attached',
        route: registration,
      };
    }
    const workspace = await requestJson(fetchFn, `${router.url}/`, {}, 3_000);
    if (!workspace.response.ok) {
      return {
        ...unavailableStatus(url, 'operator_console_workspace_unavailable', `status_${workspace.response.status}`),
        status: 'degraded',
        route_state: 'degraded',
        router_url: router.url,
        ownership: 'attached',
        route: registration,
      };
    }
    return {
      schema: 'narada.operator_console_runtime.status.v1',
      status: 'ready',
      url,
      router_url: router.url,
      route_id: OPERATOR_CONSOLE_ROUTE_ID,
      route_state: 'healthy',
      ownership: 'attached',
      route: registration,
      process: await processDiagnosticsFromState(runtimeStateRoot, url, registration.process_evidence.pid),
    };
  } catch (error) {
    return {
      ...unavailableStatus(url, 'operator_console_runtime_probe_failed', error instanceof Error ? error.message : String(error)),
      status: 'degraded',
      route_state: 'degraded',
      router_url: router.url,
      ownership: 'attached',
      route,
    };
  }
}

async function readOperatorConsoleAdminRoutes(
  options: Parameters<typeof readOperatorRouterAdminRoutes>[0],
) {
  return readOperatorRouterAdminRoutes(options);
}

async function findAdminRoute(
  router: EnsureOperatorRouterResult,
): Promise<OperatorRouterRouteRegistration | undefined> {
  const inventory = await readOperatorConsoleAdminRoutes({
    url: router.url,
    registration_token: router.registration_token,
    state_root: router.state_root,
  });
  const route = inventory.routes.find((candidate) => candidate.route_id === OPERATOR_CONSOLE_ROUTE_ID);
  if (route && !routeIdentityMatches(route)) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_route_identity_conflict');
  }
  return route;
}

async function removeStaleRouteIfSafe(
  router: EnsureOperatorRouterResult,
  route: OperatorRouterRouteRegistration | undefined,
): Promise<void> {
  if (!route) return;
  const pid = route.process_evidence.pid;
  if (pid !== null && processIsAlive(pid)) {
    const commandLine = readProcessCommandLine(pid);
    if (!commandLine) {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_process_identity_unverified', {
        pid,
        route_id: route.route_id,
      });
    }
    if (isCanonicalConsoleProcess(commandLine, route.process_evidence.instance_nonce)) {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_existing_degraded', {
        pid,
        reason: 'live_canonical_process',
      });
    }
  }
  await unregisterOperatorRoute(
    {
      url: router.url,
      registration_token: router.registration_token,
      state_root: router.state_root,
    },
    route.route_id,
    {
      owner_id: route.owner_id,
      instance_nonce: route.process_evidence.instance_nonce,
    },
  );
}

async function waitUntilReady(
  options: OperatorConsoleRuntimeOptions,
): Promise<OperatorConsoleRuntimeProbe> {
  const timeoutMs = normalizeTimeout(options.timeout_ms, DEFAULT_RUNTIME_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  let last: OperatorConsoleRuntimeProbe = unavailableStatus(
    runtimeUrl(normalizeHost(options.host), normalizePort(options.port)),
    'operator_console_runtime_starting',
  );
  while (Date.now() < deadline) {
    last = await probeOperatorConsoleRuntime(options);
    if (last.status === 'ready') return last;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
  }
  return last;
}

function spawnConsoleServe(
  options: OperatorConsoleRuntimeOptions,
  logPath: string,
): { pid: number; instance_nonce: string; child: ReturnType<typeof spawnHiddenPostureProcess> } {
  const entrypoint = options.cli_entrypoint ?? process.env.NARADA_CLI_ENTRYPOINT ?? defaultOperatorConsoleCliEntrypoint();
  const naradaRoot = options.narada_root ?? process.env.NARADA_ROOT ?? defaultNaradaRoot();
  const instanceNonce = options.instance_nonce ?? randomUUID().replace(/-/g, '');
  const logFd = openSync(logPath, 'a');
  try {
    const child = spawnHiddenPostureProcess(process.execPath, [
      entrypoint,
      'console',
      'serve',
      '--host',
      normalizeHost(options.host),
      '--port',
      String(normalizePort(options.port)),
      '--no-open',
      '--runtime-instance',
      instanceNonce,
    ], {
      posture: 'operator_projection_host',
      cwd: naradaRoot,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        NARADA_OPERATOR_CONSOLE_RUNTIME_LAUNCHED: '1',
        NARADA_OPERATOR_CONSOLE_RUNTIME_INSTANCE: instanceNonce,
        ...(options.runtime_state_root ? { NARADA_OPERATOR_CONSOLE_RUNTIME_STATE_ROOT: options.runtime_state_root } : {}),
      },
    });
    child.unref();
    return { pid: child.pid ?? -1, instance_nonce: instanceNonce, child };
  } finally {
    closeSync(logFd);
  }
}

async function cleanupFailedStartup(
  options: OperatorConsoleRuntimeOptions,
  runtimeStateRoot: string,
  url: string,
  spawned: { pid: number; instance_nonce: string },
  router: EnsureOperatorRouterResult | null,
  failure: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cleanup: Record<string, unknown> = {};
  let cleanupRouter = router;
  if (!cleanupRouter) {
    try {
      cleanupRouter = await attachOperatorRouter({
        host: normalizeHost(options.host),
        port: normalizePort(options.port),
        state_root: options.router_state_root,
        fetch_fn: options.fetch_fn,
        timeout_ms: 3_000,
      });
    } catch (error) {
      cleanup.attach_error = error instanceof Error ? error.message : String(error);
    }
  }

  if (cleanupRouter) {
    try {
      const route = await findAdminRoute(cleanupRouter);
      const routeMatchesChild = route &&
        route.process_evidence.pid === spawned.pid &&
        route.owner_id === `operator-console:${spawned.pid}` &&
        (!route.process_evidence.instance_nonce || route.process_evidence.instance_nonce === spawned.instance_nonce);
      if (routeMatchesChild && !processIsAlive(spawned.pid)) {
        await unregisterOperatorRoute(
          { url: cleanupRouter.url, registration_token: cleanupRouter.registration_token, state_root: cleanupRouter.state_root },
          route.route_id,
          { owner_id: route.owner_id, instance_nonce: route.process_evidence.instance_nonce },
        );
        cleanup.route = 'unregistered';
      } else {
        cleanup.route = route ? 'left_untouched' : 'absent';
      }
    } catch (error) {
      cleanup.route_error = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    const statePath = await writeRuntimeState(runtimeStateRoot, {
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'failed',
      pid: spawned.pid,
      instance_nonce: spawned.instance_nonce,
      url,
      log_path: typeof failure.log_path === 'string' ? failure.log_path : undefined,
      started_at: failure.started_at ?? new Date().toISOString(),
      failed_at: new Date().toISOString(),
      failure,
      command: 'narada console serve',
    });
    cleanup.state_path = statePath;
  } catch (error) {
    cleanup.state_error = error instanceof Error ? error.message : String(error);
  }
  return cleanup;
}

async function ensureOperatorConsoleRuntimeUnlocked(
  options: EnsureOperatorConsoleRuntimeOptions,
  runtimeStateRoot: string,
): Promise<OperatorConsoleRuntimeStatus> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const url = runtimeUrl(host, port);
  let router: EnsureOperatorRouterResult | null = null;
  let spawned: ReturnType<typeof spawnConsoleServe> | undefined;
  let logPath: string | undefined;
  let statePath: string | undefined;
  let startedAt = new Date().toISOString();
  try {
    const initial = await probeOperatorConsoleRuntime({ ...options, host, port, runtime_state_root: runtimeStateRoot });
    if (initial.status === 'ready') return initial;

    router = await attachOperatorRouter({
      host,
      port,
      state_root: options.router_state_root,
      fetch_fn: options.fetch_fn,
    });
    if (router) {
      const route = await findAdminRoute(router);
      await removeStaleRouteIfSafe(router, route);
    }

    await mkdir(runtimeStateRoot, { recursive: true });
    await pruneRuntimeLogs(runtimeStateRoot);
    logPath = join(runtimeStateRoot, `console-${Date.now()}-${randomUUID()}.log`);
    spawned = spawnConsoleServe({ ...options, host, port, runtime_state_root: runtimeStateRoot }, logPath);
    if (spawned.pid <= 0) {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_child_pid_missing', {
        log_path: logPath,
      });
    }
    startedAt = new Date().toISOString();
    statePath = await writeRuntimeState(runtimeStateRoot, {
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'starting',
      pid: spawned.pid,
      instance_nonce: spawned.instance_nonce,
      url,
      log_path: logPath,
      started_at: startedAt,
      command: 'narada console serve',
    });

    const ready = await waitUntilReady({
      ...options,
      host,
      port,
      runtime_state_root: runtimeStateRoot,
      timeout_ms: options.timeout_ms ?? DEFAULT_RUNTIME_TIMEOUT_MS,
    });
    if (ready.status !== 'ready') {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_start_timeout', {
        reason: ready.reason,
        detail: ready.detail,
        log_path: logPath,
        state_path: statePath,
        url,
      });
    }
    await writeRuntimeState(runtimeStateRoot, {
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'ready',
      pid: spawned.pid,
      instance_nonce: spawned.instance_nonce,
      url,
      log_path: logPath,
      state_path: statePath,
      started_at: startedAt,
      ready_at: new Date().toISOString(),
      command: 'narada console serve',
    });
    return {
      ...ready,
      ownership: 'started',
      process: { pid: spawned.pid, log_path: logPath, state_path: statePath, instance_nonce: spawned.instance_nonce },
    };
  } catch (error) {
    if (spawned && spawned.pid > 0) {
      let terminationError: string | undefined;
      try {
        if (processIsAlive(spawned.pid)) await terminateProcess(spawned.pid, 2_000);
      } catch (terminationFailure) {
        terminationError = terminationFailure instanceof Error ? terminationFailure.message : String(terminationFailure);
      }
      const failure: Record<string, unknown> = {
        code: error instanceof OperatorConsoleRuntimeError ? error.code : 'operator_console_runtime_start_failed',
        detail: error instanceof Error ? error.message : String(error),
        ...(logPath ? { log_path: logPath } : {}),
        ...(statePath ? { state_path: statePath } : {}),
        started_at: startedAt,
        ...(terminationError ? { termination_error: terminationError } : {}),
      };
      const cleanup = await cleanupFailedStartup(options, runtimeStateRoot, url, spawned, router, failure);
      if (error instanceof OperatorConsoleRuntimeError) {
        error.diagnostics.cleanup = cleanup;
        throw error;
      }
    }
    throw error;
  }
}

export async function ensureOperatorConsoleRuntime(
  options: EnsureOperatorConsoleRuntimeOptions = {},
): Promise<OperatorConsoleRuntimeStatus> {
  const runtimeStateRoot = options.runtime_state_root ?? defaultOperatorConsoleRuntimeStateRoot();
  const unlock = await acquireRuntimeLock(runtimeStateRoot, normalizeTimeout(options.lock_timeout_ms, DEFAULT_LOCK_TIMEOUT_MS));
  try {
    return await ensureOperatorConsoleRuntimeUnlocked(options, runtimeStateRoot);
  } finally {
    await unlock();
  }
}

async function stopRouterChild(router: EnsureOperatorRouterResult): Promise<void> {
  if (router.ownership !== 'started' || !router.child || router.child.exitCode !== null) return;
  const child = router.child;
  child.kill();
  await new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(resolvePromise, 5_000);
    timer.unref?.();
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function stopOperatorConsoleRuntimeUnlocked(
  options: StopOperatorConsoleRuntimeOptions,
  runtimeStateRoot: string,
): Promise<OperatorConsoleRuntimeStopResult> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const router = await attachOperatorRouter({
    host,
    port,
    state_root: options.router_state_root,
    fetch_fn: options.fetch_fn,
  });
  if (!router) {
    await removeRuntimeState(runtimeStateRoot);
    return {
      schema: 'narada.operator_console_runtime.stop_result.v1',
      status: 'not_running',
      router_url: null,
      route_id: OPERATOR_CONSOLE_ROUTE_ID,
      pid: null,
      detail: 'Operator Console runtime is not running.',
    };
  }
  const route = await findAdminRoute(router);
  if (!route) {
    await removeRuntimeState(runtimeStateRoot);
    return {
      schema: 'narada.operator_console_runtime.stop_result.v1',
      status: 'not_running',
      router_url: router.url,
      route_id: OPERATOR_CONSOLE_ROUTE_ID,
      pid: null,
      detail: 'Operator Console runtime route is not registered.',
    };
  }
  const pid = route.process_evidence.pid;
  if (pid === null) {
    throw new OperatorConsoleRuntimeError('operator_console_runtime_process_identity_missing', {
      route_id: route.route_id,
      pid,
      owner_id: route.owner_id,
    });
  }

  if (processIsAlive(pid)) {
    const commandLine = readProcessCommandLine(pid);
    if (!commandLine) {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_process_identity_unverified', { pid });
    }
    const canonical = isCanonicalConsoleProcess(commandLine, route.process_evidence.instance_nonce);
    if (!canonical) {
      await unregisterOperatorRoute(
        { url: router.url, registration_token: router.registration_token, state_root: router.state_root },
        route.route_id,
        { owner_id: route.owner_id, instance_nonce: route.process_evidence.instance_nonce },
      );
      return {
        schema: 'narada.operator_console_runtime.stop_result.v1',
        status: 'stale_route_removed',
        router_url: router.url,
        route_id: route.route_id,
        pid,
        detail: `Removed stale Operator Console route for PID ${pid}; live process identity was not the registered console.`,
      };
    }
    if (route.owner_id !== `operator-console:${pid}`) {
      throw new OperatorConsoleRuntimeError('operator_console_runtime_foreign_process_refusal', {
        route_id: route.route_id,
        pid,
        owner_id: route.owner_id,
        expected_owner_id: `operator-console:${pid}`,
      });
    }
    await unregisterOperatorRoute(
      { url: router.url, registration_token: router.registration_token, state_root: router.state_root },
      route.route_id,
      { owner_id: route.owner_id, instance_nonce: route.process_evidence.instance_nonce },
    );
    try {
      await terminateProcess(pid, normalizeTimeout(options.timeout_ms, 5_000));
    } catch (error) {
      let routeRestoration: 'restored' | 'failed' = 'restored';
      let routeRestorationError: string | null = null;
      try {
        await registerOperatorRoute(
          { url: router.url, registration_token: router.registration_token, state_root: router.state_root },
          {
            route_id: route.route_id,
            route_class: route.route_class,
            backend_kind: route.backend_kind,
            public_path: route.public_path,
            route_mode: route.route_mode,
            target_url: route.target_url,
            websocket_target_url: route.websocket_target_url,
            health_url: route.health_url,
            owner_id: route.owner_id,
            site_id: route.site_id,
            session_id: route.session_id,
            process_evidence: route.process_evidence,
            protocols: route.protocols,
            methods: route.methods,
            max_body_bytes: route.max_body_bytes,
            timeout_ms: route.timeout_ms,
            websocket_liveness: route.websocket_liveness,
            lease_ms: route.lease_ms,
            reconstruction: route.reconstruction,
          },
        );
      } catch (restorationError) {
        routeRestoration = 'failed';
        routeRestorationError = restorationError instanceof Error ? restorationError.message : String(restorationError);
      }
      throw new OperatorConsoleRuntimeError('operator_console_runtime_termination_failed', {
        pid,
        termination_error: error instanceof Error ? error.message : String(error),
        route_restoration: routeRestoration,
        route_restoration_error: routeRestorationError,
      });
    }
    await removeRuntimeState(runtimeStateRoot);
    return {
      schema: 'narada.operator_console_runtime.stop_result.v1',
      status: 'stopped',
      router_url: router.url,
      route_id: route.route_id,
      pid,
      detail: `Stopped Operator Console runtime process ${pid}.`,
    };
  }

  await unregisterOperatorRoute(
    { url: router.url, registration_token: router.registration_token, state_root: router.state_root },
    route.route_id,
    { owner_id: route.owner_id, instance_nonce: route.process_evidence.instance_nonce },
  );
  await removeRuntimeState(runtimeStateRoot);
  return {
    schema: 'narada.operator_console_runtime.stop_result.v1',
    status: 'stale_route_removed',
    router_url: router.url,
    route_id: route.route_id,
    pid,
    detail: `Removed stale Operator Console route for exited process ${pid}.`,
  };
}

export async function stopOperatorConsoleRuntime(
  options: StopOperatorConsoleRuntimeOptions = {},
): Promise<OperatorConsoleRuntimeStopResult> {
  const runtimeStateRoot = options.runtime_state_root ?? defaultOperatorConsoleRuntimeStateRoot();
  const unlock = await acquireRuntimeLock(runtimeStateRoot, normalizeTimeout(options.lock_timeout_ms, DEFAULT_LOCK_TIMEOUT_MS));
  try {
    return await stopOperatorConsoleRuntimeUnlocked(options, runtimeStateRoot);
  } finally {
    await unlock();
  }
}

export async function restartOperatorConsoleRuntime(
  options: EnsureOperatorConsoleRuntimeOptions = {},
): Promise<RestartOperatorConsoleRuntimeResult> {
  const runtimeStateRoot = options.runtime_state_root ?? defaultOperatorConsoleRuntimeStateRoot();
  const unlock = await acquireRuntimeLock(runtimeStateRoot, normalizeTimeout(options.lock_timeout_ms, DEFAULT_LOCK_TIMEOUT_MS));
  try {
    const stopped = await stopOperatorConsoleRuntimeUnlocked(options, runtimeStateRoot);
    const started = await ensureOperatorConsoleRuntimeUnlocked(options, runtimeStateRoot);
    return { stopped, started };
  } finally {
    await unlock();
  }
}

async function prepareConsoleRoute(
  router: EnsureOperatorRouterResult,
  fetchFn: FetchFunction,
): Promise<OperatorRouterRouteRegistration | undefined> {
  const route = await findAdminRoute(router);
  if (!route) return undefined;
  if (route.state === 'healthy') {
    try {
      const workspace = await requestJson(fetchFn, `${router.url}/`, {}, 3_000);
      if (workspace.response.ok) return route;
    } catch {
      // Fall through to process identity validation.
    }
  }
  await removeStaleRouteIfSafe(router, route);
  return undefined;
}

async function serveOperatorConsoleRuntimeUnlocked(
  options: ServeOperatorConsoleRuntimeOptions,
): Promise<ServeOperatorConsoleRuntimeResult> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const fetchFn = options.fetch_fn ?? fetch;
  const router = await ensureOperatorRouter({
    host,
    port,
    state_root: options.router_state_root,
    fetch_fn: fetchFn,
    timeout_ms: options.timeout_ms,
  });

  const existing = await prepareConsoleRoute(router, fetchFn);
  if (existing) {
    const url = `${router.url}/`;
    const browserResult = await options.open_workspace?.(url);
    options.on_startup?.({ url, router_url: router.url, ownership: 'attached', process_pid: existing.process_evidence.pid ?? -1, browser_result: browserResult });
    return {
      status: 'ready',
      url,
      router_url: router.url,
      ownership: 'attached',
      process_pid: existing.process_evidence.pid ?? -1,
      stop: async () => undefined,
    };
  }

  const backend = await options.create_backend(router.url);
  const ownerId = `operator-console:${process.pid}`;
  const instanceNonce = options.instance_nonce
    ?? process.env.NARADA_OPERATOR_CONSOLE_RUNTIME_INSTANCE
    ?? randomUUID().replace(/-/g, '');
  let routeSet: Awaited<ReturnType<typeof registerOperatorRouteSet>> | null = null;
  try {
    routeSet = await registerOperatorRouteSet({
      admin: { url: router.url, registration_token: router.registration_token, state_root: router.state_root },
      renew_interval_ms: 30_000,
      routes: [{
        route_id: OPERATOR_CONSOLE_ROUTE_ID,
        route_class: OPERATOR_CONSOLE_ROUTE_CLASS,
        public_path: '/',
        route_mode: 'prefix',
        target_url: backend.url,
        health_url: `${backend.url}/health`,
        owner_id: ownerId,
        process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
        protocols: ['http'],
        methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
        timeout_ms: OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS,
        lease_ms: 60 * 60 * 1000,
        reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
      }],
    });
  } catch (error) {
    await backend.stop();
    throw error;
  }

  const workspaceUrl = `${router.url}/`;
  const browserResult = await options.open_workspace?.(workspaceUrl);
  options.on_startup?.({ url: workspaceUrl, router_url: router.url, ownership: 'started', process_pid: process.pid, browser_result: browserResult });
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      await routeSet?.stop();
    } finally {
      try {
        await backend.stop();
      } finally {
        await stopRouterChild(router);
      }
    }
    options.on_shutdown?.();
  };
  const signalHandler = (): void => {
    void stop().then(() => process.exit(0));
  };
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);
  return {
    status: 'ready',
    url: workspaceUrl,
    router_url: router.url,
    ownership: 'started',
    process_pid: process.pid,
    stop,
  };
}

export async function serveOperatorConsoleRuntime(
  options: ServeOperatorConsoleRuntimeOptions,
): Promise<ServeOperatorConsoleRuntimeResult> {
  const runtimeStateRoot = options.runtime_state_root ?? defaultOperatorConsoleRuntimeStateRoot();
  const launchedByRuntime = process.env.NARADA_OPERATOR_CONSOLE_RUNTIME_LAUNCHED === '1';
  const unlock = launchedByRuntime
    ? async (): Promise<void> => undefined
    : await acquireRuntimeLock(runtimeStateRoot, normalizeTimeout(options.lock_timeout_ms, DEFAULT_LOCK_TIMEOUT_MS));
  try {
    return await serveOperatorConsoleRuntimeUnlocked(options);
  } finally {
    await unlock();
  }
}
