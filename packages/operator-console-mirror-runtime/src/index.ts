import { closeSync, openSync } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import {
  createOperatorConsoleRemoteGateway,
  type OperatorConsoleRemoteGateway,
} from '@narada-core/operator-console-remote-gateway';
import { runGovernedCommandSync, spawnHiddenPostureProcess } from '@narada-core/process-launch-posture';

export const OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA = 'narada.operator_console_mirror.state.v1' as const;
export const OPERATOR_CONSOLE_MIRROR_STATUS_SCHEMA = 'narada.operator_console_mirror.status.v1' as const;
const DEFAULT_MIRROR_LOCK_TIMEOUT_MS = 120_000;
const MIRROR_LOCK_STALE_AFTER_MS = 30_000;

export type OperatorConsoleMirrorStatus = 'starting' | 'ready' | 'degraded' | 'stopped' | 'failed' | 'stale';
export type OperatorConsoleMirrorTunnelMode = 'token' | 'token-file' | 'named';
export type OperatorConsoleMirrorTunnelRunner = 'cloudflared' | 'wrangler';
type OperatorConsoleMirrorTunnelHealthSource = 'metrics' | 'process';
type OperatorConsoleMirrorTunnelStateMode = OperatorConsoleMirrorTunnelMode | 'unconfigured';

export interface OperatorConsoleMirrorOptions {
  host?: string;
  gateway_port?: number;
  router_url?: string;
  router_state_root?: string;
  router_token?: string;
  bridge_token?: string;
  cloudflared_binary?: string;
  wrangler_binary?: string;
  tunnel_runner?: OperatorConsoleMirrorTunnelRunner;
  tunnel_token?: string;
  tunnel_token_file?: string;
  tunnel_name?: string;
  cloudflared_config?: string;
  metrics_host?: string;
  metrics_port?: number;
  public_origin?: string;
  state_root?: string;
  cli_entrypoint?: string;
  narada_root?: string;
  log_path?: string;
  bridge_token_file?: string;
  timeout_ms?: number;
  lock_timeout_ms?: number;
  fetch_fn?: typeof fetch;
  operation?: 'start' | 'restart' | 'rotate' | 'run';
}

export interface OperatorConsoleMirrorTunnelInvocation {
  runner: OperatorConsoleMirrorTunnelRunner;
  health_source: OperatorConsoleMirrorTunnelHealthSource;
  binary: string;
  args: string[];
  env: Record<string, string>;
  mode: OperatorConsoleMirrorTunnelMode;
  name: string | null;
  token_file: string | null;
  metrics_url: string | null;
}

export interface OperatorConsoleMirrorState {
  schema: typeof OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA;
  status: OperatorConsoleMirrorStatus;
  operation?: 'start' | 'restart' | 'rotate' | 'run';
  instance_nonce: string;
  owner_pid: number;
  gateway: { url: string; router_url: string; host: string; port: number };
  tunnel: {
    pid: number | null;
    binary: string;
    runner?: OperatorConsoleMirrorTunnelRunner;
    health_source?: OperatorConsoleMirrorTunnelHealthSource;
    mode: OperatorConsoleMirrorTunnelStateMode;
    name: string | null;
    token_file: string | null;
    metrics_url: string | null;
  };
  public_origin: string | null;
  log_path: string;
  tunnel_log_path: string;
  state_path: string;
  bridge_token_file?: string;
  started_at: string;
  updated_at: string;
  ready_at?: string;
  stopped_at?: string;
  failure?: { code: string; detail: string };
  health?: {
    gateway: 'healthy' | 'unhealthy' | 'unknown';
    tunnel: 'connected' | 'disconnected' | 'unknown';
    checked_at: string;
    detail?: string;
  };
}

export interface OperatorConsoleMirrorStatusResult {
  schema: typeof OPERATOR_CONSOLE_MIRROR_STATUS_SCHEMA;
  status: OperatorConsoleMirrorStatus | 'not_running';
  state: OperatorConsoleMirrorState | null;
  owner_alive: boolean;
  tunnel_alive: boolean;
  health: OperatorConsoleMirrorState['health'] | null;
  diagnostics: {
    state_path: string;
    log_path: string | null;
    tunnel_log_path: string | null;
    reason?: string;
  };
}

export class OperatorConsoleMirrorError extends Error {
  readonly code: string;
  readonly diagnostics: Record<string, unknown>;

  constructor(code: string, diagnostics: Record<string, unknown> = {}) {
    super(code);
    this.name = 'OperatorConsoleMirrorError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

interface NormalizedOptions {
  host: string;
  gatewayPort: number;
  routerUrl: string;
  routerStateRoot: string | undefined;
  routerToken: string | undefined;
  bridgeToken: string | undefined;
  cloudflaredBinary: string;
  wranglerBinary: string;
  tunnelRunner: OperatorConsoleMirrorTunnelRunner | undefined;
  tunnelToken: string | undefined;
  tunnelTokenFile: string | undefined;
  tunnelName: string | undefined;
  cloudflaredConfig: string | undefined;
  metricsHost: string;
  metricsPort: number;
  publicOrigin: string | null;
  bridgeTokenFile: string;
  stateRoot: string;
  cliEntrypoint: string;
  naradaRoot: string;
  logPath: string | undefined;
  timeoutMs: number;
  lockTimeoutMs: number;
  fetchFn: typeof fetch;
  operation: NonNullable<OperatorConsoleMirrorOptions['operation']>;
}

export function defaultOperatorConsoleMirrorStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NARADA_OPERATOR_CONSOLE_MIRROR_STATE_ROOT?.trim();
  if (configured) return resolve(configured);
  const localAppData = env.LOCALAPPDATA?.trim()
    || join(env.USERPROFILE?.trim() || env.HOME?.trim() || homedir(), 'AppData', 'Local');
  return join(localAppData, 'Narada', 'operator-console-mirror');
}

export function defaultOperatorConsoleCliEntrypoint(): string {
  return fileURLToPath(new URL('../../layers/cli/dist/main.js', import.meta.url));
}

export function buildTunnelInvocation(
  options: Pick<OperatorConsoleMirrorOptions, 'cloudflared_binary' | 'wrangler_binary' | 'tunnel_runner' | 'tunnel_token' | 'tunnel_token_file' | 'tunnel_name' | 'cloudflared_config' | 'metrics_host' | 'metrics_port'> = {},
  env: NodeJS.ProcessEnv = process.env,
): OperatorConsoleMirrorTunnelInvocation {
  const binary = requireString(options.cloudflared_binary?.trim() || env.NARADA_CLOUDFLARED_BINARY?.trim() || 'cloudflared', 'cloudflared_binary');
  const wranglerBinary = requireString(options.wrangler_binary?.trim() || env.NARADA_WRANGLER_BINARY?.trim() || (process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'), 'wrangler_binary');
  const token = options.tunnel_token?.trim() || env.TUNNEL_TOKEN?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_TOKEN?.trim();
  const tokenFile = options.tunnel_token_file?.trim() || env.TUNNEL_TOKEN_FILE?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_TOKEN_FILE?.trim();
  const name = options.tunnel_name?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_NAME?.trim();
  const config = options.cloudflared_config?.trim() || env.NARADA_CLOUDFLARE_CONFIG?.trim();
  const metricsHost = normalizeLoopbackHost(options.metrics_host?.trim() || env.NARADA_CLOUDFLARE_METRICS_HOST?.trim() || '127.0.0.1');
  const metricsPort = normalizePort(Number.parseInt(options.metrics_port?.toString() || env.NARADA_CLOUDFLARE_METRICS_PORT || '61731', 10), 'metrics_port');
  const configuredModes = [Boolean(token), Boolean(tokenFile), Boolean(name)].filter(Boolean).length;
  if (configuredModes !== 1) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_tunnel_configuration_required', {
      required: 'exactly one of TUNNEL_TOKEN, TUNNEL_TOKEN_FILE, or NARADA_CLOUDFLARE_TUNNEL_NAME',
    });
  }
  const configuredRunner = options.tunnel_runner?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_RUNNER?.trim();
  const runner = configuredRunner
    ? normalizeTunnelRunner(configuredRunner)
    : name && !config ? 'wrangler' : 'cloudflared';
  if (runner === 'wrangler' && !name) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_wrangler_runner_requires_named_tunnel');
  }
  if (runner === 'wrangler') {
    return {
      runner,
      health_source: 'process',
      binary: wranglerBinary,
      args: ['tunnel', 'run', name as string, '--log-level', 'info'],
      env: {},
      mode: 'named',
      name: name as string,
      token_file: null,
      metrics_url: null,
    };
  }
  const args = ['tunnel', '--no-autoupdate', '--metrics', `${metricsHost}:${metricsPort}`, ...(config ? ['--config', resolve(config)] : []), 'run'];
  return {
    runner,
    health_source: 'metrics',
    binary,
    args: name ? [...args, name] : tokenFile ? [...args, '--token-file', resolve(tokenFile)] : args,
    env: token ? { TUNNEL_TOKEN: token } : {},
    mode: token ? 'token' : tokenFile ? 'token-file' : 'named',
    name: name ?? null,
    token_file: tokenFile ? resolve(tokenFile) : null,
    metrics_url: `http://${formatHost(metricsHost)}:${metricsPort}`,
  };
}

export const buildCloudflaredInvocation = buildTunnelInvocation;

export async function readOperatorConsoleMirrorState(stateRoot = defaultOperatorConsoleMirrorStateRoot()): Promise<OperatorConsoleMirrorState | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(resolve(stateRoot), 'state.json'), 'utf8'));
    return isMirrorState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function operatorConsoleMirrorStatus(
  options: Pick<OperatorConsoleMirrorOptions, 'state_root' | 'fetch_fn' | 'timeout_ms' | 'bridge_token'> = {},
): Promise<OperatorConsoleMirrorStatusResult> {
  const stateRoot = resolve(options.state_root?.trim() || defaultOperatorConsoleMirrorStateRoot());
  const state = await readOperatorConsoleMirrorState(stateRoot);
  if (!state) {
    return {
      schema: OPERATOR_CONSOLE_MIRROR_STATUS_SCHEMA,
      status: 'not_running',
      state: null,
      owner_alive: false,
      tunnel_alive: false,
      health: null,
      diagnostics: { state_path: join(stateRoot, 'state.json'), log_path: null, tunnel_log_path: null },
    };
  }
  const ownerAlive = processIsAlive(state.owner_pid);
  const tunnelAlive = state.tunnel.pid !== null && processIsAlive(state.tunnel.pid);
  let status = state.status;
  let reason: string | undefined;
  if (!ownerAlive && ['starting', 'ready', 'degraded'].includes(state.status)) {
    status = 'stale';
    reason = 'operator_console_mirror_owner_not_alive';
  } else if (ownerAlive && state.status === 'ready' && !tunnelAlive) {
    status = 'degraded';
    reason = 'operator_console_mirror_tunnel_process_not_alive';
  }
  const bridgeToken = options.bridge_token?.trim() || process.env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN?.trim();
  const health = ownerAlive && state.status !== 'stopped' && state.status !== 'failed'
    ? bridgeToken
      ? await probeMirrorHealth(state, options.fetch_fn ?? fetch, options.timeout_ms ?? 3_000, bridgeToken)
      : state.health ?? null
    : state.health ?? null;
  if (state.status !== 'starting' && health && health.gateway !== 'healthy') {
    status = ownerAlive ? 'degraded' : 'stale';
    reason = health.gateway === 'unknown' ? 'operator_console_mirror_gateway_health_unavailable' : 'operator_console_mirror_gateway_unhealthy';
  } else if (health && health.tunnel !== 'connected') {
    status = ownerAlive ? 'degraded' : 'stale';
    reason = health.tunnel === 'unknown' ? 'operator_console_mirror_tunnel_health_unavailable' : 'operator_console_mirror_tunnel_disconnected';
  }
  return {
    schema: OPERATOR_CONSOLE_MIRROR_STATUS_SCHEMA,
    status,
    state,
    owner_alive: ownerAlive,
    tunnel_alive: tunnelAlive,
    health,
    diagnostics: {
      state_path: state.state_path,
      log_path: state.log_path,
      tunnel_log_path: state.tunnel_log_path,
      ...(reason ? { reason } : {}),
    },
  };
}

export async function ensureOperatorConsoleMirror(
  options: OperatorConsoleMirrorOptions = {},
): Promise<OperatorConsoleMirrorStatusResult> {
  const normalized = await resolveNormalizedOptions(options);
  const unlock = await acquireMirrorLock(normalized.stateRoot, normalized.lockTimeoutMs);
  try {
    return await ensureOperatorConsoleMirrorUnlocked(normalized);
  } finally {
    await unlock();
  }
}

async function ensureOperatorConsoleMirrorUnlocked(
  normalized: NormalizedOptions,
): Promise<OperatorConsoleMirrorStatusResult> {
  const existing = await operatorConsoleMirrorStatus({ state_root: normalized.stateRoot, fetch_fn: normalized.fetchFn, timeout_ms: normalized.timeoutMs, bridge_token: normalized.bridgeToken });
  if (existing.owner_alive && ['starting', 'ready', 'degraded'].includes(existing.status)) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_already_active', {
      state_path: existing.diagnostics.state_path,
      owner_pid: existing.state?.owner_pid ?? null,
    });
  }
  if (!normalized.bridgeToken) throw new OperatorConsoleMirrorError('operator_console_mirror_bridge_token_required');
  const existingTunnelAlive = existing.state?.tunnel.pid !== null && existing.state?.tunnel.pid !== undefined && processIsAlive(existing.state.tunnel.pid);
  if (!existing.owner_alive && existingTunnelAlive) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_orphan_tunnel_requires_reconciliation', {
      tunnel_pid: existing.state?.tunnel.pid ?? null,
      state_path: existing.diagnostics.state_path,
    });
  }
  await mkdir(normalized.stateRoot, { recursive: true });
  const nonce = randomUUID().replaceAll('-', '');
  const routerToken = normalized.routerToken ?? await readRouterToken(normalized.routerStateRoot);
  const logPath = join(normalized.stateRoot, `mirror-${Date.now()}-${nonce}.log`);
  const fd = openSync(logPath, 'a');
  let child: ChildProcess;
  try {
    child = spawnHiddenPostureProcess(process.execPath, [
      normalized.cliEntrypoint,
      'console',
      'mirror',
      'run',
      '--host', normalized.host,
      '--gateway-port', String(normalized.gatewayPort),
      '--router-url', normalized.routerUrl,
      '--cloudflared-binary', normalized.cloudflaredBinary,
      '--wrangler-binary', normalized.wranglerBinary,
      '--tunnel-runner', normalized.tunnelRunner ?? '',
      '--metrics-host', normalized.metricsHost,
      '--metrics-port', String(normalized.metricsPort),
      '--state-root', normalized.stateRoot,
      '--bridge-token-file', normalized.bridgeTokenFile,
      '--run-nonce', nonce,
      '--operation', normalized.operation,
      '--log-path', logPath,
      ...(normalized.routerStateRoot ? ['--router-state-root', normalized.routerStateRoot] : []),
      ...(normalized.tunnelTokenFile ? ['--tunnel-token-file', normalized.tunnelTokenFile] : []),
      ...(normalized.tunnelName ? ['--tunnel-name', normalized.tunnelName] : []),
      ...(normalized.cloudflaredConfig ? ['--cloudflared-config', normalized.cloudflaredConfig] : []),
      ...(normalized.publicOrigin ? ['--public-origin', normalized.publicOrigin] : []),
    ], {
      posture: 'operator_projection_host',
      cwd: normalized.naradaRoot,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', fd, fd],
      env: {
        ...process.env,
        NARADA_OPERATOR_CONSOLE_MIRROR_RUN: '1',
        NARADA_OPERATOR_CONSOLE_MIRROR_NONCE: nonce,
        NARADA_OPERATOR_ROUTER_TOKEN: routerToken,
        ...(normalized.bridgeToken ? { NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN: normalized.bridgeToken } : {}),
        ...(normalized.tunnelToken ? { TUNNEL_TOKEN: normalized.tunnelToken } : {}),
      },
    });
    child.unref();
  } finally {
    closeSync(fd);
  }
  if (!child.pid || child.pid <= 0) throw new OperatorConsoleMirrorError('operator_console_mirror_child_pid_missing', { log_path: logPath });
  const result = await waitForMirrorState(normalized.stateRoot, child.pid, normalized.timeoutMs, logPath);
  if (result.status === 'failed') {
    throw new OperatorConsoleMirrorError(result.state?.failure?.code ?? 'operator_console_mirror_start_failed', {
      state_path: result.diagnostics.state_path,
      log_path: result.diagnostics.log_path,
      detail: result.state?.failure?.detail ?? 'mirror host failed before becoming ready',
    });
  }
  return result;
}

export async function restartOperatorConsoleMirror(
  options: OperatorConsoleMirrorOptions = {},
): Promise<OperatorConsoleMirrorStatusResult> {
  const normalized = await resolveNormalizedOptions({ ...options, operation: 'restart' });
  const unlock = await acquireMirrorLock(normalized.stateRoot, normalized.lockTimeoutMs);
  try {
    await stopOperatorConsoleMirrorUnlocked({ timeout_ms: normalized.timeoutMs }, normalized.stateRoot);
    return await ensureOperatorConsoleMirrorUnlocked(normalized);
  } finally {
    await unlock();
  }
}

export async function rotateOperatorConsoleMirrorCredentials(
  options: OperatorConsoleMirrorOptions = {},
): Promise<OperatorConsoleMirrorStatusResult> {
  const normalized = await resolveNormalizedOptions({ ...options, operation: 'rotate' });
  const unlock = await acquireMirrorLock(normalized.stateRoot, normalized.lockTimeoutMs);
  try {
    await stopOperatorConsoleMirrorUnlocked({ timeout_ms: normalized.timeoutMs }, normalized.stateRoot);
    return await ensureOperatorConsoleMirrorUnlocked(normalized);
  } finally {
    await unlock();
  }
}

export async function stopOperatorConsoleMirror(
  options: Pick<OperatorConsoleMirrorOptions, 'state_root' | 'timeout_ms' | 'lock_timeout_ms'> = {},
): Promise<OperatorConsoleMirrorStatusResult> {
  const stateRoot = resolve(options.state_root?.trim() || defaultOperatorConsoleMirrorStateRoot());
  const unlock = await acquireMirrorLock(stateRoot, normalizeLockTimeout(options.lock_timeout_ms ?? DEFAULT_MIRROR_LOCK_TIMEOUT_MS));
  try {
    return await stopOperatorConsoleMirrorUnlocked(options, stateRoot);
  } finally {
    await unlock();
  }
}

async function stopOperatorConsoleMirrorUnlocked(
  options: Pick<OperatorConsoleMirrorOptions, 'timeout_ms'>,
  stateRoot: string,
): Promise<OperatorConsoleMirrorStatusResult> {
  const state = await readOperatorConsoleMirrorState(stateRoot);
  if (!state) return await operatorConsoleMirrorStatus({ state_root: stateRoot });
  const ownerAlive = processIsAlive(state.owner_pid);
  const tunnelAlive = state.tunnel.pid !== null && processIsAlive(state.tunnel.pid);
  if (ownerAlive) {
    if (!isOwnedMirrorProcess(state.owner_pid, state.instance_nonce)) {
      throw new OperatorConsoleMirrorError('operator_console_mirror_owner_identity_unverified', {
        owner_pid: state.owner_pid,
        state_path: state.state_path,
      });
    }
    await terminateProcess(state.owner_pid, options.timeout_ms ?? 5_000);
  } else if (tunnelAlive) {
    if (!isOwnedTunnelProcess(state.tunnel.pid as number, state)) {
      throw new OperatorConsoleMirrorError('operator_console_mirror_orphan_tunnel_identity_unverified', {
        tunnel_pid: state.tunnel.pid,
        state_path: state.state_path,
      });
    }
    await terminateProcess(state.tunnel.pid as number, options.timeout_ms ?? 5_000);
  }
  const current = await readOperatorConsoleMirrorState(stateRoot);
  if (current && current.status !== 'stopped') {
    await writeMirrorState({
      ...current,
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      health: { ...(current.health ?? { gateway: 'unknown', tunnel: 'unknown', checked_at: new Date().toISOString() }), gateway: 'unknown', tunnel: 'unknown' },
    });
  }
  return await operatorConsoleMirrorStatus({ state_root: stateRoot });
}

export async function runOperatorConsoleMirror(options: OperatorConsoleMirrorOptions = {}): Promise<void> {
  const normalized = normalizeOptions({ ...options, operation: options.operation ?? 'run' });
  if (process.env.NARADA_OPERATOR_CONSOLE_MIRROR_RUN !== '1') {
    throw new OperatorConsoleMirrorError('operator_console_mirror_internal_run_required');
  }
  const nonce = process.env.NARADA_OPERATOR_CONSOLE_MIRROR_NONCE?.trim();
  if (!nonce) throw new OperatorConsoleMirrorError('operator_console_mirror_run_nonce_required');
  await mkdir(normalized.stateRoot, { recursive: true });
  const statePath = join(normalized.stateRoot, 'state.json');
  const tunnelLogPath = join(normalized.stateRoot, `tunnel-${Date.now()}-${nonce}.log`);
  const initialGatewayUrl = `http://${formatHost(normalized.host)}:${normalized.gatewayPort}`;
  const initialMetricsUrl = `http://${formatHost(normalized.metricsHost)}:${normalized.metricsPort}`;
  let state: OperatorConsoleMirrorState = {
    schema: OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA,
    status: 'starting',
    operation: normalized.operation,
    instance_nonce: nonce,
    owner_pid: process.pid,
    gateway: { url: initialGatewayUrl, router_url: normalized.routerUrl, host: normalized.host, port: normalized.gatewayPort },
    tunnel: { pid: null, binary: normalized.cloudflaredBinary, mode: 'unconfigured', name: null, token_file: null, metrics_url: initialMetricsUrl },
    public_origin: normalized.publicOrigin,
    log_path: normalized.logPath ?? join(normalized.stateRoot, 'mirror-host.log'),
    tunnel_log_path: tunnelLogPath,
    state_path: statePath,
    bridge_token_file: normalized.bridgeTokenFile,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await writeMirrorState(state);
  let tunnelFd: number | null = null;
  let gateway: OperatorConsoleRemoteGateway | null = null;
  let tunnel: ChildProcess | null = null;
  let shuttingDown = false;
  let healthTimer: NodeJS.Timeout | null = null;
  let invocation: OperatorConsoleMirrorTunnelInvocation | null = null;
  const startedAt = state.started_at;
  const readinessDeadline = Date.now() + normalized.timeoutMs;
  try {
    invocation = buildTunnelInvocation({
      cloudflared_binary: normalized.cloudflaredBinary,
      wrangler_binary: normalized.wranglerBinary,
      tunnel_runner: normalized.tunnelRunner,
      tunnel_token: normalized.tunnelToken,
      tunnel_token_file: normalized.tunnelTokenFile,
      tunnel_name: normalized.tunnelName,
      cloudflared_config: normalized.cloudflaredConfig,
      metrics_host: normalized.metricsHost,
      metrics_port: normalized.metricsPort,
    }, process.env);
    state = { ...state, tunnel: { ...state.tunnel, binary: invocation.binary, runner: invocation.runner, health_source: invocation.health_source, mode: invocation.mode, name: invocation.name, token_file: invocation.token_file, metrics_url: invocation.metrics_url }, updated_at: new Date().toISOString() };
    await writeMirrorState(state);
    gateway = createOperatorConsoleRemoteGateway({
      router_url: normalized.routerUrl,
      router_token: normalized.routerToken ?? await readRouterToken(normalized.routerStateRoot),
      bridge_token: normalized.bridgeToken ?? '',
      host: normalized.host,
      port: normalized.gatewayPort,
      fetch_fn: normalized.fetchFn,
    });
    const gatewayUrl = await gateway.start();
    state = { ...state, gateway: { ...state.gateway, url: gatewayUrl }, updated_at: new Date().toISOString() };
    await writeMirrorState(state);
    tunnelFd = openSync(tunnelLogPath, 'a');
    const spawnedTunnel = spawnHiddenPostureProcess(invocation.binary, invocation.args, {
      posture: 'operator_projection_host',
      cwd: normalized.naradaRoot,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', tunnelFd, tunnelFd],
      env: { ...process.env, ...invocation.env },
    });
    tunnel = spawnedTunnel;
    state = { ...state, tunnel: { ...state.tunnel, pid: spawnedTunnel.pid ?? null }, updated_at: new Date().toISOString() };
    await writeMirrorState(state);
    const onTunnelExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (shuttingDown) return;
      void shutdown('failed', `operator_console_mirror_tunnel_exited:${code ?? signal ?? 'unknown'}`);
    };
    spawnedTunnel.once('error', () => onTunnelExit(1, null));
    spawnedTunnel.once('exit', onTunnelExit);
    const updateHealth = async (): Promise<void> => {
      if (!state || shuttingDown) return;
      const health = await probeMirrorHealth(state, normalized.fetchFn, 3_000, normalized.bridgeToken ?? '');
      const healthy = health.gateway === 'healthy' && health.tunnel === 'connected';
      const nextStatus: OperatorConsoleMirrorStatus = healthy ? 'ready' : Date.now() >= readinessDeadline ? 'degraded' : 'starting';
      state = { ...state, status: nextStatus, updated_at: new Date().toISOString(), ...(nextStatus === 'ready' && !state.ready_at ? { ready_at: new Date().toISOString() } : {}), health };
      await writeMirrorState(state);
    };
    await updateHealth();
    healthTimer = setInterval(() => { void updateHealth(); }, 5_000);
    healthTimer.unref?.();
    await new Promise<void>((resolvePromise) => {
      const stop = (): void => { void shutdown('stopped', 'operator_console_mirror_signal').then(resolvePromise); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
  } catch (error) {
    state = { ...state, status: 'failed', updated_at: new Date().toISOString(), failure: { code: errorCode(error), detail: errorDetail(error) } };
    await writeMirrorState(state);
    if (tunnel && processIsAlive(tunnel.pid ?? -1)) await terminateProcess(tunnel.pid ?? -1, 2_000);
    if (gateway) await gateway.stop().catch(() => undefined);
    throw error;
  } finally {
    if (tunnelFd !== null) closeSync(tunnelFd);
    if (healthTimer) clearInterval(healthTimer);
  }

  async function shutdown(status: 'stopped' | 'failed', detail: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    if (healthTimer) clearInterval(healthTimer);
    if (tunnel && processIsAlive(tunnel.pid ?? -1)) await terminateProcess(tunnel.pid ?? -1, 2_000).catch(() => undefined);
    if (gateway) await gateway.stop().catch(() => undefined);
    if (state) {
      state = { ...state, status, stopped_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(status === 'failed' ? { failure: { code: detail, detail } } : {}) };
      await writeMirrorState(state);
    }
  }
}

async function waitForMirrorState(stateRoot: string, childPid: number, timeoutMs: number, logPath: string): Promise<OperatorConsoleMirrorStatusResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await operatorConsoleMirrorStatus({ state_root: stateRoot });
    if (result.state?.owner_pid === childPid && ['ready', 'degraded', 'failed', 'stopped'].includes(result.state.status)) return result;
    if (!processIsAlive(childPid)) {
      throw new OperatorConsoleMirrorError('operator_console_mirror_child_exited_before_state', { child_pid: childPid, log_path: logPath });
    }
    await delay(100);
  }
  throw new OperatorConsoleMirrorError('operator_console_mirror_start_timeout', {
    child_pid: childPid,
    state_path: join(stateRoot, 'state.json'),
    log_path: logPath,
  });
}

async function probeMirrorHealth(
  state: OperatorConsoleMirrorState,
  fetchFn: typeof fetch,
  timeoutMs: number,
  bridgeToken: string,
): Promise<NonNullable<OperatorConsoleMirrorState['health']>> {
  let gateway: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
  let tunnel: 'connected' | 'disconnected' | 'unknown' = 'unknown';
  let detail: string | undefined;
  try {
    const response = await fetchFn(`${state.gateway.url}/health`, {
      headers: { 'x-narada-operator-console-bridge-token': bridgeToken },
      signal: AbortSignal.timeout(timeoutMs),
    });
    gateway = response.ok ? 'healthy' : 'unhealthy';
  } catch (error) {
    detail = `gateway:${errorDetail(error)}`;
  }
  if ((state.tunnel.health_source ?? 'metrics') === 'process') {
    tunnel = state.tunnel.pid !== null && processIsAlive(state.tunnel.pid) ? 'connected' : 'disconnected';
  } else if (state.tunnel.metrics_url) {
    try {
      const response = await fetchFn(`${state.tunnel.metrics_url}/diag/tunnel`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const body: unknown = await response.json();
      const connections = isRecord(body) && Array.isArray(body.connections) ? body.connections : [];
      tunnel = connections.some((connection) => isRecord(connection) && connection.isConnected === true) ? 'connected' : 'disconnected';
    } catch (error) {
      detail = `${detail ? `${detail};` : ''}tunnel:${errorDetail(error)}`;
    }
  } else {
    detail = `${detail ? `${detail};` : ''}tunnel:metrics_unavailable`;
  }
  return { gateway, tunnel, checked_at: new Date().toISOString(), ...(detail ? { detail } : {}) };
}

function normalizeOptions(options: OperatorConsoleMirrorOptions): NormalizedOptions {
  const env = process.env;
  const host = normalizeLoopbackHost(options.host?.trim() || env.NARADA_OPERATOR_CONSOLE_GATEWAY_HOST?.trim() || '127.0.0.1');
  const gatewayPort = normalizePort(options.gateway_port ?? Number.parseInt(env.NARADA_OPERATOR_CONSOLE_GATEWAY_PORT || '61730', 10), 'gateway_port');
  const routerUrl = options.router_url?.trim() || env.NARADA_OPERATOR_ROUTER_URL?.trim() || 'http://127.0.0.1:61729';
  const routerStateRoot = options.router_state_root?.trim()
    || env.NARADA_OPERATOR_ROUTER_STATE_ROOT?.trim()
    || defaultRouterStateRoot(env);
  const routerToken = options.router_token?.trim() || env.NARADA_OPERATOR_ROUTER_TOKEN?.trim() || undefined;
  const bridgeToken = options.bridge_token?.trim() || env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN?.trim() || undefined;
  const tunnelToken = options.tunnel_token?.trim() || env.TUNNEL_TOKEN?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_TOKEN?.trim();
  const tunnelTokenFile = options.tunnel_token_file?.trim() || env.TUNNEL_TOKEN_FILE?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_TOKEN_FILE?.trim();
  const tunnelName = options.tunnel_name?.trim() || env.NARADA_CLOUDFLARE_TUNNEL_NAME?.trim();
  const cloudflaredConfig = options.cloudflared_config?.trim() || env.NARADA_CLOUDFLARE_CONFIG?.trim();
  const publicOrigin = options.public_origin?.trim() || env.OPERATOR_CONSOLE_GATEWAY_URL?.trim() || null;
  const stateRoot = resolve(options.state_root?.trim() || env.NARADA_OPERATOR_CONSOLE_MIRROR_STATE_ROOT?.trim() || defaultOperatorConsoleMirrorStateRoot(env));
  const bridgeTokenFile = resolve(options.bridge_token_file?.trim() || env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN_FILE?.trim() || join(stateRoot, 'bridge-token'));
  const cliEntrypoint = resolve(options.cli_entrypoint?.trim() || env.NARADA_CLI_ENTRYPOINT?.trim() || defaultOperatorConsoleCliEntrypoint());
  const naradaRoot = resolve(options.narada_root?.trim() || env.NARADA_ROOT?.trim() || fileURLToPath(new URL('../../..', import.meta.url)));
  const timeoutMs = normalizeTimeout(options.timeout_ms ?? Number.parseInt(env.NARADA_OPERATOR_CONSOLE_MIRROR_TIMEOUT_MS || '30000', 10));
  const lockTimeoutMs = normalizeLockTimeout(options.lock_timeout_ms ?? Number.parseInt(env.NARADA_OPERATOR_CONSOLE_MIRROR_LOCK_TIMEOUT_MS || String(DEFAULT_MIRROR_LOCK_TIMEOUT_MS), 10));
  const metricsHost = normalizeLoopbackHost(options.metrics_host?.trim() || env.NARADA_CLOUDFLARE_METRICS_HOST?.trim() || '127.0.0.1');
  const metricsPort = normalizePort(options.metrics_port ?? Number.parseInt(env.NARADA_CLOUDFLARE_METRICS_PORT || '61731', 10), 'metrics_port');
  const operation = options.operation ?? 'start';
  if (!['start', 'restart', 'rotate', 'run'].includes(operation)) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_operation_invalid', { operation });
  }
  return {
    host,
    gatewayPort,
    routerUrl,
    routerStateRoot,
    routerToken,
    bridgeToken,
    cloudflaredBinary: options.cloudflared_binary?.trim() || env.NARADA_CLOUDFLARED_BINARY?.trim() || 'cloudflared',
    wranglerBinary: options.wrangler_binary?.trim() || env.NARADA_WRANGLER_BINARY?.trim() || (process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'),
    tunnelRunner: options.tunnel_runner?.trim() ? normalizeTunnelRunner(options.tunnel_runner.trim()) : (env.NARADA_CLOUDFLARE_TUNNEL_RUNNER?.trim() ? normalizeTunnelRunner(env.NARADA_CLOUDFLARE_TUNNEL_RUNNER.trim()) : undefined),
    tunnelToken,
    tunnelTokenFile,
    tunnelName,
    cloudflaredConfig,
    metricsHost,
    metricsPort,
    publicOrigin,
    bridgeTokenFile,
    stateRoot,
    cliEntrypoint,
    naradaRoot,
    logPath: options.log_path?.trim() || undefined,
    timeoutMs,
    lockTimeoutMs,
    fetchFn: options.fetch_fn ?? fetch,
    operation,
  };
}

async function resolveNormalizedOptions(options: OperatorConsoleMirrorOptions): Promise<NormalizedOptions> {
  const normalized = normalizeOptions(options);
  const previous = await readOperatorConsoleMirrorState(normalized.stateRoot);
  const bridgeTokenFile = previous?.bridge_token_file ? resolve(previous.bridge_token_file) : normalized.bridgeTokenFile;
  const bridgeToken = normalized.bridgeToken ?? await readSecretFile(bridgeTokenFile);
  return {
    ...normalized,
    bridgeToken,
    tunnelRunner: normalized.tunnelRunner ?? previous?.tunnel.runner,
    tunnelName: normalized.tunnelName ?? previous?.tunnel.name ?? undefined,
    publicOrigin: normalized.publicOrigin ?? previous?.public_origin ?? null,
    bridgeTokenFile,
  };
}

async function readSecretFile(path: string): Promise<string | undefined> {
  try {
    const value = (await readFile(path, 'utf8')).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function writeMirrorState(state: OperatorConsoleMirrorState): Promise<void> {
  await mkdir(dirname(state.state_path), { recursive: true });
  const temporaryPath = `${state.state_path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await renameWithRetry(temporaryPath, state.state_path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  const retryableCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      await rename(from, to);
      return;
    } catch (error: unknown) {
      const code = isNodeError(error) ? error.code : undefined;
      if (!retryableCodes.has(code ?? '') || Date.now() >= deadline) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }
}

function isMirrorState(value: unknown): value is OperatorConsoleMirrorState {
  if (!isRecord(value) || value.schema !== OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA || typeof value.status !== 'string') return false;
  return typeof value.instance_nonce === 'string'
    && typeof value.owner_pid === 'number'
    && isRecord(value.gateway)
    && isRecord(value.tunnel)
    && typeof value.state_path === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && typeof (value as NodeJS.ErrnoException).code === 'string';
}

function normalizeLoopbackHost(value: string): string {
  const normalized = value.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(normalized)) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_host_not_loopback', { host: value });
  }
  return normalized;
}

function normalizeTunnelRunner(value: string): OperatorConsoleMirrorTunnelRunner {
  if (value === 'cloudflared' || value === 'wrangler') return value;
  throw new OperatorConsoleMirrorError('operator_console_mirror_tunnel_runner_invalid', { runner: value });
}

function normalizePort(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new OperatorConsoleMirrorError(`operator_console_mirror_${name}_invalid`, { value });
  }
  return value;
}

function normalizeTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 500 || value > 120_000) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_timeout_invalid', { value });
  }
  return value;
}

function normalizeLockTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 500 || value > 120_000) {
    throw new OperatorConsoleMirrorError('operator_console_mirror_lock_timeout_invalid', { value });
  }
  return value;
}

function requireString(value: string, name: string): string {
  if (!value) throw new OperatorConsoleMirrorError(`operator_console_mirror_${name}_required`);
  return value;
}

function formatHost(value: string): string {
  return value.includes(':') ? `[${value}]` : value;
}

function defaultRouterStateRoot(env: NodeJS.ProcessEnv): string {
  const localAppData = env.LOCALAPPDATA?.trim()
    || join(env.USERPROFILE?.trim() || env.HOME?.trim() || homedir(), 'AppData', 'Local');
  return join(localAppData, 'Narada', 'operator-router');
}

async function readRouterToken(stateRoot: string | undefined): Promise<string> {
  const root = stateRoot ?? defaultRouterStateRoot(process.env);
  try {
    const token = (await readFile(join(root, 'registration-token'), 'utf8')).trim();
    if (token) return token;
  } catch {
    // Normalize missing router authority into one actionable lifecycle error.
  }
  throw new OperatorConsoleMirrorError('operator_console_mirror_router_token_unavailable', { state_root: root });
}

function errorCode(error: unknown): string {
  return error instanceof OperatorConsoleMirrorError ? error.code : 'operator_console_mirror_runtime_failed';
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function mirrorLockPath(stateRoot: string): string {
  return join(stateRoot, 'mirror.lock');
}

async function acquireMirrorLock(stateRoot: string, timeoutMs: number): Promise<() => Promise<void>> {
  await mkdir(stateRoot, { recursive: true });
  const path = mirrorLockPath(stateRoot);
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify({
          schema: 'narada.operator_console_mirror.lock.v1',
          token,
          pid: process.pid,
          created_at: new Date().toISOString(),
        }));
      } finally {
        await handle.close();
      }
      const heartbeat = setInterval(() => {
        void utimes(path, new Date(), new Date()).catch(() => undefined);
      }, Math.max(1_000, Math.floor(MIRROR_LOCK_STALE_AFTER_MS / 3)));
      heartbeat.unref?.();
      return async (): Promise<void> => {
        clearInterval(heartbeat);
        try {
          const current = await readFile(path, 'utf8');
          if (current.includes(token)) await unlink(path);
        } catch {
          // Another owner may already have reclaimed the stale lock.
        }
      };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      try {
        const lockStat = await stat(path);
        if (Date.now() - lockStat.mtimeMs > MIRROR_LOCK_STALE_AFTER_MS) await unlink(path);
      } catch {
        // Race with the current owner acquiring or releasing the lock.
      }
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new OperatorConsoleMirrorError('operator_console_mirror_lock_timeout', {
    lock_path: path,
    timeout_ms: timeoutMs,
  });
}

function isOwnedMirrorProcess(pid: number, nonce: string): boolean {
  if (!processIsAlive(pid)) return false;
  try {
    if (process.platform === 'win32') {
      const result = runGovernedCommandSync('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($p) { $p.CommandLine }`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const commandLine = String(result.stdout ?? '').toLowerCase();
      return commandLine.includes('console') && commandLine.includes('mirror') && commandLine.includes('run') && commandLine.includes(nonce.toLowerCase());
    }
    const result = runGovernedCommandSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const commandLine = String(result.stdout ?? '').toLowerCase();
    return commandLine.includes('console') && commandLine.includes('mirror') && commandLine.includes('run') && commandLine.includes(nonce.toLowerCase());
  } catch {
    return false;
  }
}

function isOwnedTunnelProcess(pid: number, state: OperatorConsoleMirrorState): boolean {
  if (!processIsAlive(pid)) return false;
  try {
    const commandLine = process.platform === 'win32'
      ? String(runGovernedCommandSync('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($p) { $p.CommandLine }`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout ?? '')
      : String(runGovernedCommandSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout ?? '');
    const normalized = commandLine.toLowerCase().replaceAll('\\', '/');
    const binaryName = state.tunnel.binary.toLowerCase().replaceAll('\\', '/').split('/').at(-1) ?? 'cloudflared';
    if (!normalized.includes(binaryName) || !normalized.includes('tunnel') || !normalized.includes('run')) return false;
    if ((state.tunnel.health_source ?? 'metrics') === 'process') return true;
    if (!state.tunnel.metrics_url) return false;
    const metricsPort = new URL(state.tunnel.metrics_url).port;
    return normalized.includes(metricsPort);
  } catch {
    return false;
  }
}

async function terminateProcess(pid: number, timeoutMs: number): Promise<void> {
  if (!processIsAlive(pid)) return;
  if (process.platform === 'win32') {
    try {
      runGovernedCommandSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      if (processIsAlive(pid)) throw new OperatorConsoleMirrorError('operator_console_mirror_stop_failed', { pid });
    }
    await waitForExit(pid, timeoutMs);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGTERM'); } catch { return; }
  }
  if (await waitForExit(pid, timeoutMs)) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { return; }
  }
  await waitForExit(pid, timeoutMs);
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processIsAlive(pid) && Date.now() < deadline) await delay(50);
  return !processIsAlive(pid);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
