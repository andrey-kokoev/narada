export const CLOUDFLARE_HOST_FLEET_REGISTRY_SCHEMA = 'narada.cloudflare.host_fleet_registry.v1' as const;
export const CLOUDFLARE_HOST_FLEET_OVERVIEW_SCHEMA = 'narada.cloudflare.host_fleet.overview.v1' as const;
export const CLOUDFLARE_HOST_FLEET_SESSIONS_SCHEMA = 'narada.cloudflare.host_fleet.sessions.v1' as const;
export const CLOUDFLARE_HOST_FLEET_TARGET_SCHEMA = 'narada.cloudflare.host_fleet.target.v1' as const;

export type CloudflareHostFleetLifecycle = 'pending' | 'active' | 'revoked' | 'retired';
export type CloudflareHostFleetPlatform = 'windows' | 'linux' | 'macos' | 'cloudflare' | 'unknown';

interface CloudflareHostFleetGateway {
  transport: 'service-binding' | 'https';
  binding?: string;
  url?: string;
  credential_binding: string;
  admitted_paths: readonly string[];
}

interface CloudflareHostFleetRecord {
  host_id: string;
  host_instance_id: string;
  display_name: string;
  platform: CloudflareHostFleetPlatform;
  lifecycle_state: CloudflareHostFleetLifecycle;
  admitted_sites: readonly string[];
  capabilities: readonly string[];
  gateway: CloudflareHostFleetGateway;
}

interface CloudflareHostFleetRegistry {
  schema: typeof CLOUDFLARE_HOST_FLEET_REGISTRY_SCHEMA;
  revision: number;
  hosts: readonly CloudflareHostFleetRecord[];
}

interface WorkerWebSocket extends WebSocket {
  accept(): void;
}

interface WorkerWebSocketPair {
  0: WorkerWebSocket;
  1: WorkerWebSocket;
}

declare const WebSocketPair: { new(): WorkerWebSocketPair };

export interface CloudflareHostFleetEnvironment {
  [binding: string]: unknown;
  NARADA_HOST_FLEET_REGISTRY?: string;
}

export interface CloudflareHostFleetOverview {
  schema: typeof CLOUDFLARE_HOST_FLEET_OVERVIEW_SCHEMA;
  status: 'success' | 'refused';
  generated_at: string;
  registry_revision: number | null;
  count: number;
  hosts: readonly Record<string, unknown>[];
  refusals: readonly string[];
}

const HOST_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BINDING_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_HOSTS = 256;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown, max = 256): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 256) return null;
  const result = value.map((item) => stringValue(item)).filter((item): item is string => item !== null);
  return result.length === value.length ? [...new Set(result)] : null;
}

function safePath(value: unknown): string | null {
  const path = stringValue(value, 512);
  if (!path || !path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('?') || path.includes('#')) return null;
  return path === '/' ? path : path.replace(/\/+$/, '');
}

function gateway(value: unknown): CloudflareHostFleetGateway | null {
  const item = record(value);
  const transport = item?.transport;
  const credentialBinding = stringValue(item?.credential_binding, 64);
  const rawAdmittedPaths = item?.admitted_paths;
  const admittedPaths = Array.isArray(rawAdmittedPaths)
    ? rawAdmittedPaths.map(safePath).filter((path): path is string => path !== null)
    : null;
  const rawAdmittedPathCount = Array.isArray(rawAdmittedPaths) ? rawAdmittedPaths.length : -1;
  if ((transport !== 'service-binding' && transport !== 'https')
    || !credentialBinding || !BINDING_ID.test(credentialBinding)
    || !admittedPaths || admittedPaths.length === 0 || admittedPaths.length !== rawAdmittedPathCount) return null;
  if (transport === 'service-binding') {
    const binding = stringValue(item?.binding, 64);
    if (!binding || !BINDING_ID.test(binding)) return null;
    return { transport, binding, credential_binding: credentialBinding, admitted_paths: [...new Set(admittedPaths)] };
  }
  const url = stringValue(item?.url, 2_048);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return { transport, url: parsed.toString().replace(/\/$/, ''), credential_binding: credentialBinding, admitted_paths: [...new Set(admittedPaths)] };
  } catch {
    return null;
  }
}

function host(value: unknown): CloudflareHostFleetRecord | null {
  const item = record(value);
  const hostId = stringValue(item?.host_id, 64)?.toLowerCase() ?? '';
  const instanceId = stringValue(item?.host_instance_id, 128) ?? '';
  const displayName = stringValue(item?.display_name) ?? '';
  const platform = item?.platform;
  const lifecycle = item?.lifecycle_state;
  const admittedSites = strings(item?.admitted_sites);
  const capabilities = strings(item?.capabilities);
  const binding = gateway(item?.gateway);
  if (!HOST_ID.test(hostId) || !INSTANCE_ID.test(instanceId) || !displayName
    || !['windows', 'linux', 'macos', 'cloudflare', 'unknown'].includes(platform as string)
    || !['pending', 'active', 'revoked', 'retired'].includes(lifecycle as string)
    || !admittedSites || !capabilities || !binding) return null;
  return {
    host_id: hostId,
    host_instance_id: instanceId,
    display_name: displayName,
    platform: platform as CloudflareHostFleetPlatform,
    lifecycle_state: lifecycle as CloudflareHostFleetLifecycle,
    admitted_sites: admittedSites,
    capabilities,
    gateway: binding,
  };
}

function readRegistry(raw: unknown): { status: 'success'; registry: CloudflareHostFleetRegistry } | { status: 'refused'; refusals: readonly string[] } {
  const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : raw;
  const value = record(parsed);
  if (!value || value.schema !== CLOUDFLARE_HOST_FLEET_REGISTRY_SCHEMA) return { status: 'refused', refusals: ['host_fleet_registry_schema_invalid'] };
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) return { status: 'refused', refusals: ['host_fleet_registry_revision_invalid'] };
  if (!Array.isArray(value.hosts) || value.hosts.length > MAX_HOSTS) return { status: 'refused', refusals: ['host_fleet_registry_hosts_invalid'] };
  const hosts: CloudflareHostFleetRecord[] = [];
  const keys = new Set<string>();
  for (const candidate of value.hosts) {
    const entry = host(candidate);
    if (!entry) return { status: 'refused', refusals: ['host_fleet_registry_host_invalid'] };
    const key = `${entry.host_id}@${entry.host_instance_id}`;
    if (keys.has(key)) return { status: 'refused', refusals: [`host_fleet_registry_duplicate:${key}`] };
    keys.add(key);
    hosts.push(entry);
  }
  return { status: 'success', registry: { schema: CLOUDFLARE_HOST_FLEET_REGISTRY_SCHEMA, revision: Number(value.revision), hosts } };
}

function publicHost(entry: CloudflareHostFleetRecord): Record<string, unknown> {
  return {
    host_id: entry.host_id,
    host_instance_id: entry.host_instance_id,
    display_name: entry.display_name,
    platform: entry.platform,
    lifecycle_state: entry.lifecycle_state,
    admitted_sites: [...entry.admitted_sites],
    capabilities: [...entry.capabilities],
    gateway: {
      transport: entry.gateway.transport,
      admitted_path_count: entry.gateway.admitted_paths.length,
    },
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function refusal(code: string, status = 409): Response {
  return json({ schema: 'narada.host_fleet.refusal.v1', status: 'refused', reason: code }, status);
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && !decoded.includes('/') && !decoded.includes('\\') && !decoded.includes('..') ? decoded : null;
  } catch {
    return null;
  }
}

function routeParts(pathname: string): string[] | null {
  const prefix = '/api/narada/fleet/hosts/';
  if (!pathname.startsWith(prefix)) return null;
  const parts = pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeSegment);
  return parts.every((part): part is string => part !== null) ? parts : null;
}

function admitted(entry: CloudflareHostFleetRecord, path: string): boolean {
  return entry.gateway.admitted_paths.some((candidate) => candidate.endsWith('/*')
    ? path.startsWith(candidate.slice(0, -1))
    : path === candidate);
}

function credential(env: CloudflareHostFleetEnvironment, entry: CloudflareHostFleetRecord): string | null {
  const value = env[entry.gateway.credential_binding];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function binding(env: CloudflareHostFleetEnvironment, entry: CloudflareHostFleetRecord): { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> } | null {
  const value = entry.gateway.binding ? env[entry.gateway.binding] : null;
  return value && typeof value === 'object' && typeof (value as { fetch?: unknown }).fetch === 'function'
    ? value as { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> }
    : null;
}

async function gatewayRequest(
  request: Request,
  env: CloudflareHostFleetEnvironment,
  entry: CloudflareHostFleetRecord,
  path: string,
  fetchFn: typeof fetch,
): Promise<Response> {
  if (!admitted(entry, path)) return refusal(`host_gateway_path_not_admitted:${path}`, 404);
  const token = credential(env, entry);
  if (!token) return refusal('host_gateway_credential_unavailable', 503);
  const target = entry.gateway.url
    ? new URL(path + new URL(request.url).search, `${entry.gateway.url}/`)
    : new URL(path, 'http://host-gateway.internal');
  const headers = new Headers({
    accept: 'application/json',
    'x-narada-host-id': entry.host_id,
    'x-narada-host-instance-id': entry.host_instance_id,
    'x-narada-operator-console-bridge-token': token,
  });
  for (const name of ['content-type', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }
  const upstream = binding(env, entry);
  return upstream
    ? upstream.fetch(new Request(target, init))
    : fetchFn(new Request(target, init));
}

async function boundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('host_gateway_response_too_large');
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('host_gateway_response_too_large');
  try { return JSON.parse(text) as unknown; } catch { throw new Error('host_gateway_response_invalid_json'); }
}

function projectSessions(payload: unknown, entry: CloudflareHostFleetRecord): Array<Record<string, unknown>> {
  const value = record(payload);
  if (!value || value.schema !== 'narada.operator_console.agent_sessions.v1' || !Array.isArray(value.sessions)) throw new Error('host_session_discovery_contract_invalid');
  const sessions: Array<Record<string, unknown>> = [];
  for (const candidate of value.sessions.slice(0, 500)) {
    const session = record(candidate);
    if (!session || typeof session.session_id !== 'string' || typeof session.site_id !== 'string' || typeof session.agent_id !== 'string') continue;
    if (!entry.admitted_sites.includes(session.site_id)) continue;
    sessions.push({
      target: {
        host_id: entry.host_id,
        host_instance_id: entry.host_instance_id,
        site_id: session.site_id,
        agent_id: session.agent_id,
        runtime_session_id: session.session_id,
      },
      state: session.display_state === 'active' ? 'active' : session.display_state === 'stale' ? 'stale' : session.display_state === 'closed' || session.display_state === 'historical' ? 'closed' : 'degraded',
      health_status: session.health_status === 'healthy' || session.health_status === 'online' ? 'online' : session.health_status ?? 'unknown',
      started_at: typeof session.started_at === 'string' ? session.started_at : null,
      last_seen_at: typeof session.last_seen_at === 'string' ? session.last_seen_at : null,
    });
  }
  return sessions;
}

function exactSession(
  sessions: readonly Record<string, unknown>[],
  entry: CloudflareHostFleetRecord,
  siteId: string,
  agentId: string,
  sessionId?: string,
): Record<string, unknown> | null {
  const matches = sessions.filter((candidate) => {
    const target = record(candidate.target);
    return target?.host_id === entry.host_id
      && target.host_instance_id === entry.host_instance_id
      && target.site_id === siteId
      && target.agent_id === agentId
      && (!sessionId || target.runtime_session_id === sessionId);
  });
  return matches.length === 1 ? matches[0]! : null;
}

async function openFleetWebSocket(
  request: Request,
  env: CloudflareHostFleetEnvironment,
  entry: CloudflareHostFleetRecord,
  sessionId: string,
  fetchFn: typeof fetch,
): Promise<Response> {
  const path = `/sessions/${encodeURIComponent(sessionId)}/events`;
  if (!admitted(entry, path)) return refusal(`host_gateway_path_not_admitted:${path}`, 404);
  const key = request.headers.get('sec-websocket-key');
  const version = request.headers.get('sec-websocket-version');
  if (!key || version !== '13') return refusal('host_fleet_websocket_handshake_invalid', 400);
  const token = credential(env, entry);
  if (!token) return refusal('host_gateway_credential_unavailable', 503);
  const target = entry.gateway.url ? new URL(path, `${entry.gateway.url}/`) : new URL(path, 'http://host-gateway.internal');
  const headers = new Headers({
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': version,
    'x-narada-host-id': entry.host_id,
    'x-narada-host-instance-id': entry.host_instance_id,
    'x-narada-operator-console-bridge-token': token,
  });
  const protocol = request.headers.get('sec-websocket-protocol');
  if (protocol) headers.set('sec-websocket-protocol', protocol);
  const upstream = binding(env, entry);
  let response: Response;
  try {
    response = await (upstream ? upstream.fetch(new Request(target, { method: 'GET', headers })) : fetchFn(new Request(target, { method: 'GET', headers })));
  } catch {
    return refusal('host_gateway_websocket_upstream_unavailable', 503);
  }
  const upstreamSocket = (response as Response & { webSocket?: WorkerWebSocket }).webSocket;
  if (response.status !== 101 || !upstreamSocket) return refusal('host_gateway_websocket_upstream_rejected', 502);
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  upstreamSocket.accept();
  let closed = false;
  const close = (code = 1011, reason = 'host_fleet_websocket_closed'): void => {
    if (closed) return;
    closed = true;
    try { server.close(code, reason); } catch { /* best effort */ }
    try { upstreamSocket.close(code, reason); } catch { /* best effort */ }
  };
  server.addEventListener('message', (event: MessageEvent<unknown>) => {
    try { upstreamSocket.send(event.data as string | ArrayBuffer | Blob); } catch { close(); }
  });
  upstreamSocket.addEventListener('message', (event: MessageEvent<unknown>) => {
    try { server.send(event.data as string | ArrayBuffer | Blob); } catch { close(); }
  });
  server.addEventListener('close', () => close(1000, 'client_closed'));
  upstreamSocket.addEventListener('close', () => close(1000, 'upstream_closed'));
  server.addEventListener('error', () => close());
  upstreamSocket.addEventListener('error', () => close());
  return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
}

export function isCloudflareHostFleetPath(pathname: string): boolean {
  return pathname === '/api/narada/fleet/hosts' || pathname.startsWith('/api/narada/fleet/hosts/');
}

export function projectCloudflareHostFleetOverview(raw: unknown, generatedAt: string): CloudflareHostFleetOverview {
  const parsed = readRegistry(raw);
  if (parsed.status === 'refused') return {
    schema: CLOUDFLARE_HOST_FLEET_OVERVIEW_SCHEMA,
    status: 'refused',
    generated_at: generatedAt,
    registry_revision: null,
    count: 0,
    hosts: [],
    refusals: parsed.refusals,
  };
  return {
    schema: CLOUDFLARE_HOST_FLEET_OVERVIEW_SCHEMA,
    status: 'success',
    generated_at: generatedAt,
    registry_revision: parsed.registry.revision,
    count: parsed.registry.hosts.length,
    hosts: parsed.registry.hosts.map(publicHost),
    refusals: [],
  };
}

export async function handleCloudflareHostFleetRequest(
  request: Request,
  env: CloudflareHostFleetEnvironment,
  now: () => string,
  fetchFn: typeof fetch = fetch,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isCloudflareHostFleetPath(url.pathname)) return null;
  if (url.pathname === '/api/narada/fleet/hosts' && request.method === 'GET') {
    return json(projectCloudflareHostFleetOverview(env.NARADA_HOST_FLEET_REGISTRY ?? null, now()));
  }
  const parts = routeParts(url.pathname);
  const parsed = readRegistry(env.NARADA_HOST_FLEET_REGISTRY ?? null);
  if (parsed.status === 'refused') return json({ schema: CLOUDFLARE_HOST_FLEET_OVERVIEW_SCHEMA, status: 'refused', generated_at: now(), registry_revision: null, count: 0, hosts: [], refusals: parsed.refusals }, 503);
  if (!parts || parts.length < 2) return refusal('host_fleet_route_invalid', 400);
  const entry = parsed.registry.hosts.find((candidate) => candidate.host_id === parts[0] && candidate.host_instance_id === parts[1]);
  if (!entry) return refusal('host_not_registered', 404);
  if (entry.lifecycle_state === 'revoked' || entry.lifecycle_state === 'retired') return refusal(`host_${entry.lifecycle_state}`, 409);
  if (parts[2] === 'health' && request.method === 'GET') {
    const upstream = await gatewayRequest(request, env, entry, '/health', fetchFn);
    const payload = await upstream.clone().json().catch(() => null);
    return json({ schema: 'narada.host_fleet.gateway_health.v1', host: { host_id: entry.host_id, host_instance_id: entry.host_instance_id }, status: upstream.ok ? 'online' : 'degraded', gateway_schema: record(payload)?.schema ?? null, detail: record(payload)?.detail ?? null, observed_at: now() }, upstream.ok ? 200 : 503);
  }
  if (parts[2] === 'sessions' && parts.length === 3 && request.method === 'GET') {
    try {
      const upstream = await gatewayRequest(request, env, entry, '/console/sessions/api/sessions', fetchFn);
      const payload = await boundedJson(upstream);
      const sessions = projectSessions(payload, entry);
      return json({ schema: CLOUDFLARE_HOST_FLEET_SESSIONS_SCHEMA, status: upstream.ok ? 'success' : 'refused', generated_at: now(), host: publicHost(entry), count: sessions.length, sessions, refusals: upstream.ok ? [] : [`host_gateway_http_${upstream.status}`] }, upstream.ok ? 200 : 503);
    } catch (error) {
      return refusal(error instanceof Error ? error.message : String(error), 503);
    }
  }
  if (parts[2] === 'target' && request.method === 'GET') {
    const siteId = url.searchParams.get('site_id')?.trim() ?? '';
    const agentId = url.searchParams.get('agent_id')?.trim() ?? '';
    const sessionId = url.searchParams.get('runtime_session_id')?.trim() || undefined;
    if (!siteId || !agentId) return refusal('host_fleet_target_required', 400);
    if (!entry.admitted_sites.includes(siteId)) return refusal('host_site_not_admitted', 409);
    try {
      const upstream = await gatewayRequest(request, env, entry, '/console/sessions/api/sessions', fetchFn);
      const sessions = projectSessions(await boundedJson(upstream), entry);
      const target = exactSession(sessions, entry, siteId, agentId, sessionId);
      if (!target) return json({ schema: CLOUDFLARE_HOST_FLEET_TARGET_SCHEMA, status: 'refused', generated_at: now(), target: null, refusal: sessionId ? 'runtime_target_not_found_or_ambiguous' : 'runtime_target_ambiguous_or_not_found' }, 409);
      return json({ schema: CLOUDFLARE_HOST_FLEET_TARGET_SCHEMA, status: 'resolved', generated_at: now(), target: target.target, session: target, refusal: null });
    } catch (error) {
      return refusal(error instanceof Error ? error.message : String(error), 503);
    }
  }
  if (parts[2] === 'sessions' && parts.length === 4 && parts[3] === 'events' && request.method === 'GET' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return refusal('host_fleet_websocket_session_id_required', 400);
  }
  if (parts[2] === 'sessions' && parts.length === 5 && parts[4] === 'events' && request.method === 'GET' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const siteId = url.searchParams.get('site_id')?.trim() ?? '';
    const agentId = url.searchParams.get('agent_id')?.trim() ?? '';
    if (!siteId || !agentId) return refusal('host_fleet_websocket_target_required', 400);
    if (!entry.admitted_sites.includes(siteId)) return refusal('host_site_not_admitted', 409);
    try {
      const discovery = await gatewayRequest(request, env, entry, '/console/sessions/api/sessions', fetchFn);
      const sessions = projectSessions(await boundedJson(discovery), entry);
      const target = exactSession(sessions, entry, siteId, agentId, parts[3]);
      if (!target) return refusal('runtime_target_not_found_or_ambiguous', 409);
      return openFleetWebSocket(request, env, entry, parts[3]!, fetchFn);
    } catch (error) {
      return refusal(error instanceof Error ? error.message : String(error), 503);
    }
  }
  return refusal('host_fleet_route_not_admitted', 404);
}
