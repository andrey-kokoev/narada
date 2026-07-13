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
  type OperatorRouterRoutesResponse,
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
  timeout_ms?: number;
}

export interface OperatorRouterRouteSetOptions {
  admin: OperatorRouterAdminOptions;
  routes: readonly OperatorRouterRouteRegistrationInput[];
  renew_interval_ms?: number;
  register_fn?: typeof registerOperatorRoute;
  renew_fn?: typeof renewOperatorRoute;
  unregister_fn?: typeof unregisterOperatorRoute;
}

export interface OperatorRouterRouteSet {
  route_ids: readonly string[];
  renew(): Promise<void>;
  stop(): Promise<void>;
}

function defaultStateRoot(): string {
  const configured = process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT?.trim();
  if (configured) return configured;
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

function boundedClientTimeout(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) throw new Error('operator_router_client_timeout_invalid');
  return timeout;
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
    signal: AbortSignal.timeout(boundedClientTimeout(options.timeout_ms, 10_000)),
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

export async function readOperatorRouterRoutes(options: { url: string; fetch_fn?: typeof fetch; timeout_ms?: number }): Promise<OperatorRouterRoutesResponse> {
  const response = await (options.fetch_fn ?? fetch)(`${options.url.replace(/\/+$/, '')}/routes`, {
    signal: AbortSignal.timeout(boundedClientTimeout(options.timeout_ms, 3_000)),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)
    || payload.schema !== 'narada.operator_router.routes.v1'
    || payload.identity !== OPERATOR_ROUTER_IDENTITY
    || !Array.isArray(payload.routes)) {
    throw new Error(`operator_router_routes_read_failed:${response.status}`);
  }
  return payload as unknown as OperatorRouterRoutesResponse;
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

function routeSetRenewInterval(value: number | undefined): number {
  const interval = value ?? 30_000;
  if (!Number.isInteger(interval) || interval < 1_000 || interval > 60 * 60 * 1000) {
    throw new Error('operator_router_route_set_renew_interval_invalid');
  }
  return interval;
}

export async function registerOperatorRouteSet(options: OperatorRouterRouteSetOptions): Promise<OperatorRouterRouteSet> {
  if (!options.routes.length) throw new Error('operator_router_route_set_empty');
  const routeIds = options.routes.map((route) => route.route_id);
  if (new Set(routeIds).size !== routeIds.length) throw new Error('operator_router_route_set_duplicate_route');
  const renewIntervalMs = routeSetRenewInterval(options.renew_interval_ms);
  const shortestLeaseMs = Math.min(...options.routes.map((route) => route.lease_ms ?? 60_000));
  if (renewIntervalMs * 2 > shortestLeaseMs) throw new Error('operator_router_route_set_renew_interval_exceeds_lease');
  const register = options.register_fn ?? registerOperatorRoute;
  const renewRoute = options.renew_fn ?? renewOperatorRoute;
  const unregister = options.unregister_fn ?? unregisterOperatorRoute;
  const registered: OperatorRouterRouteRegistration[] = [];
  try {
    for (const route of options.routes) registered.push(await register(options.admin, route));
  } catch (error) {
    await Promise.all(registered.map((route) => unregister(options.admin, route.route_id, {
      owner_id: route.owner_id,
      instance_nonce: route.process_evidence.instance_nonce,
    }).catch(() => undefined)));
    throw error;
  }

  let stopped = false;
  let renewal: NodeJS.Timeout | null = null;
  let renewalInFlight: Promise<void> | null = null;
  const renew = async (): Promise<void> => {
    if (stopped) return;
    if (renewalInFlight) return renewalInFlight;
    const work = (async (): Promise<void> => {
      for (let index = 0; index < options.routes.length; index += 1) {
        if (stopped) return;
        const input = options.routes[index]!;
        try {
          registered[index] = await renewRoute(options.admin, input.route_id, {
            owner_id: input.owner_id,
            instance_nonce: input.process_evidence.instance_nonce,
            lease_ms: input.lease_ms,
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'operator_router_route_not_found' && !stopped) {
            try {
              registered[index] = await register(options.admin, input);
            } catch {
              // The next bounded renewal will retry registration while the owner remains alive.
            }
          }
        }
      }
    })();
    let wrapped: Promise<void>;
    wrapped = work.finally(() => {
      if (renewalInFlight === wrapped) renewalInFlight = null;
    });
    renewalInFlight = wrapped;
    return wrapped;
  };
  renewal = setInterval(() => { renew().catch(() => undefined); }, renewIntervalMs);
  renewal.unref();

  return {
    route_ids: [...routeIds],
    renew,
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      if (renewal) clearInterval(renewal);
      renewal = null;
      await renewalInFlight?.catch(() => undefined);
      await Promise.all(registered.map((route) => unregister(options.admin, route.route_id, {
        owner_id: route.owner_id,
        instance_nonce: route.process_evidence.instance_nonce,
      }).catch(() => undefined)));
    },
  };
}

export function routerHealth(response: unknown): OperatorRouterHealthResponse | null {
  if (!isRecord(response) || response.identity !== OPERATOR_ROUTER_IDENTITY || response.schema !== 'narada.operator_router.health.v1') return null;
  return response as unknown as OperatorRouterHealthResponse;
}
