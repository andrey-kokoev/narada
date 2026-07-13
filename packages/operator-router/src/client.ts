import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import {
  DEFAULT_OPERATOR_ROUTER_PORT,
  OPERATOR_ROUTER_HEALTH_SCHEMA,
  OPERATOR_ROUTER_IDENTITY,
  OPERATOR_ROUTER_VERSION,
  type OperatorRouterHealthResponse,
  type OperatorRouterRouteRegistration,
  type OperatorRouterRouteRegistrationInput,
} from './contract.js';

const ROUTER_TOKEN_HEADER = 'x-narada-router-token';

export interface EnsureOperatorRouterOptions {
  host?: string;
  port?: number;
  state_root?: string;
  entrypoint?: string;
  timeout_ms?: number;
  fetch_fn?: typeof fetch;
  spawn_impl?: typeof spawn;
}

function assertLoopbackHost(host: string): void {
  const normalized = host.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized !== '127.0.0.1' && normalized !== 'localhost' && normalized !== '::1') throw new Error('operator_router_host_not_loopback');
}

export interface EnsureOperatorRouterResult {
  url: string;
  ownership: 'started' | 'attached';
  registration_token: string;
  child: ChildProcess | null;
}

export interface OperatorRouterAdminOptions {
  url: string;
  registration_token: string;
  fetch_fn?: typeof fetch;
}

function defaultStateRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? join(localAppData, 'Narada', 'operator-router') : join(homedir(), '.narada', 'operator-router');
}

function defaultEntrypoint(): string {
  return fileURLToPath(new URL('./main.js', import.meta.url));
}

function baseUrl(host: string, port: number): string {
  const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${displayHost}:${port}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readToken(stateRoot: string): Promise<string> {
  const token = (await readFile(join(stateRoot, 'registration-token'), 'utf8')).trim();
  if (!token) throw new Error('operator_router_registration_token_empty');
  return token;
}

async function probeRouter(url: string, fetchFn: typeof fetch): Promise<'absent' | 'matching' | 'foreign' | 'unhealthy'> {
  try {
    const response = await fetchFn(`${url}/health`, { signal: AbortSignal.timeout(800) });
    const body: unknown = await response.json().catch(() => null);
    if (!isRecord(body)
      || body.schema !== OPERATOR_ROUTER_HEALTH_SCHEMA
      || body.identity !== OPERATOR_ROUTER_IDENTITY
      || body.version !== OPERATOR_ROUTER_VERSION) return 'foreign';
    return response.ok && body.status === 'healthy' ? 'matching' : 'unhealthy';
  } catch {
    return 'absent';
  }
}

async function waitForRouter(url: string, fetchFn: typeof fetch, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: string = 'absent';
  while (Date.now() < deadline) {
    lastStatus = await probeRouter(url, fetchFn);
    if (lastStatus === 'matching') return;
    if (lastStatus === 'foreign' || lastStatus === 'unhealthy') throw new Error(`operator_router_start_refused:${lastStatus}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`operator_router_start_timeout:${lastStatus}`);
}

export async function ensureOperatorRouter(options: EnsureOperatorRouterOptions = {}): Promise<EnsureOperatorRouterResult> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? DEFAULT_OPERATOR_ROUTER_PORT;
  assertLoopbackHost(host);
  const stateRoot = options.state_root ?? defaultStateRoot();
  const url = baseUrl(host, port);
  const fetchFn = options.fetch_fn ?? fetch;
  const existing = await probeRouter(url, fetchFn);
  if (existing === 'matching') return { url, ownership: 'attached', registration_token: await readToken(stateRoot), child: null };
  if (existing === 'foreign' || existing === 'unhealthy') throw new Error(`operator_router_port_occupied:${port}:${existing}`);

  const entrypoint = options.entrypoint ?? process.env.NARADA_OPERATOR_ROUTER_ENTRYPOINT ?? defaultEntrypoint();
  const child = spawnHiddenPostureProcess(process.execPath, [entrypoint, '--host', host, '--port', String(port), '--state-root', stateRoot], {
    posture: 'operator_projection_host',
    spawnImpl: options.spawn_impl ?? spawn,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NARADA_OPERATOR_ROUTER_STATE_ROOT: stateRoot },
  });
  child.unref();
  await waitForRouter(url, fetchFn, options.timeout_ms ?? 10_000);
  return { url, ownership: 'started', registration_token: await readToken(stateRoot), child };
}

async function adminRequest<T>(options: OperatorRouterAdminOptions, path: string, method: string, body?: unknown): Promise<T> {
  const response = await (options.fetch_fn ?? fetch)(`${options.url.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      [ROUTER_TOKEN_HEADER]: options.registration_token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = isRecord(payload) && typeof payload.error === 'string' ? payload.error : `status_${response.status}`;
    throw new Error(reason);
  }
  return payload as T;
}

export function registerOperatorRoute(
  options: OperatorRouterAdminOptions,
  input: OperatorRouterRouteRegistrationInput,
): Promise<OperatorRouterRouteRegistration> {
  return adminRequest<OperatorRouterRouteRegistration>(options, '/admin/routes', 'POST', input);
}

export function renewOperatorRoute(
  options: OperatorRouterAdminOptions,
  routeId: string,
  input: { owner_id: string; instance_nonce: string; lease_ms?: number },
): Promise<OperatorRouterRouteRegistration> {
  return adminRequest<OperatorRouterRouteRegistration>(options, `/admin/routes/${encodeURIComponent(routeId)}/renew`, 'POST', input);
}

export function unregisterOperatorRoute(
  options: OperatorRouterAdminOptions,
  routeId: string,
  input: { owner_id: string; instance_nonce: string },
): Promise<{ status: string; route_id: string }> {
  return adminRequest(options, `/admin/routes/${encodeURIComponent(routeId)}`, 'DELETE', input);
}

export function routerHealth(response: unknown): OperatorRouterHealthResponse | null {
  if (!isRecord(response) || response.identity !== OPERATOR_ROUTER_IDENTITY || response.schema !== 'narada.operator_router.health.v1') return null;
  return response as unknown as OperatorRouterHealthResponse;
}
