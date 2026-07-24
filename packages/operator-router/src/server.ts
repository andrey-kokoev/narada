import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { Readable, type Duplex } from 'node:stream';
import {
  readNarsArtifactContent,
  readNarsArtifact,
  publicNarsArtifactRecord,
} from '@narada2/nars-session-core/artifacts';
import {
  OPERATOR_ROUTER_HEALTH_SCHEMA,
  OPERATOR_ROUTER_IDENTITY,
  OPERATOR_ROUTER_ADMIN_ROUTES_SCHEMA,
  OPERATOR_ROUTER_REGISTRATION_SCHEMA,
  OPERATOR_ROUTER_ROUTES_SCHEMA,
  OPERATOR_ROUTER_STATE_SCHEMA,
  OPERATOR_ROUTER_VERSION,
  MAX_OPERATOR_ROUTER_LEASE_MS,
  MAX_OPERATOR_ROUTER_ROUTES,
  MIN_OPERATOR_ROUTER_LEASE_MS,
  type OperatorRouterWebSocketLiveness,
  projectRouteRegistration,
  type OperatorRouterHealthResponse,
  type OperatorRouterAdminRoutesResponse,
  type OperatorRouterRouteRegistration,
  type OperatorRouterRouteRegistrationInput,
  type OperatorRouterRoutesResponse,
  type OperatorRouterState,
  validateRouteRegistration,
} from './contract.js';

const HEALTH_INTERVAL_MS = 5_000;
const MAINTENANCE_INTERVAL_MS = 1_000;
const ADMIN_BODY_LIMIT = 256 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;
const HEADERS_TIMEOUT_MS = 15_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const ROUTER_TOKEN_HEADER = 'x-narada-router-token';
const RESERVED_PATHS = new Set(['/health', '/routes']);

export interface OperatorRouterServerConfig {
  host: string;
  port: number;
  state_root: string;
  registration_token?: string;
  now?: () => Date;
  fetch_fn?: typeof fetch;
  health_interval_ms?: number;
  maintenance_interval_ms?: number;
  websocket_lifecycle_sink?: (event: OperatorRouterWebSocketLifecycleEvent) => void;
}

export interface OperatorRouterWebSocketLifecycleEvent {
  schema: 'narada.operator_router.websocket_lifecycle.v1';
  connection_id: string;
  route_id: string;
  session_id: string | null;
  phase: 'client_connected' | 'upstream_connected' | 'upstream_upgraded' | 'ping_sent' | 'pong_received' | 'closed';
  leg?: 'client' | 'upstream';
  reason?: string;
  occurred_at: string;
}

function routesOverlap(left: OperatorRouterRouteRegistration, right: OperatorRouterRouteRegistration): boolean {
  if (left.route_id === right.route_id) return true;
  if (left.public_path === right.public_path) return true;
  if (left.public_path === '/' || right.public_path === '/') return false;
  const leftContains = left.route_mode === 'prefix'
    && (right.public_path === left.public_path || right.public_path.startsWith(`${left.public_path}/`));
  const rightContains = right.route_mode === 'prefix'
    && (left.public_path === right.public_path || left.public_path.startsWith(`${right.public_path}/`));
  return (leftContains || rightContains) && left.route_mode === 'prefix' && right.route_mode === 'prefix';
}

function requestPathIsSafe(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (pathname.includes('\\') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/u.test(decoded)) return false;
  return !decoded.split('/').some((segment) => segment === '.' || segment === '..');
}

function requestTargetPath(requestTarget: string): string {
  const queryIndex = requestTarget.indexOf('?');
  return queryIndex < 0 ? requestTarget : requestTarget.slice(0, queryIndex);
}

export interface OperatorRouterServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  getUrl(): string | null;
  getRegistrationToken(): string;
}

interface RouteStore {
  load(): Promise<OperatorRouterState>;
  save(state: OperatorRouterState): Promise<void>;
}

function defaultStateRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? join(localAppData, 'Narada', 'operator-router') : join(homedir(), '.narada', 'operator-router');
}

function statePaths(stateRoot: string): { state: string; token: string; lock: string } {
  return {
    state: join(stateRoot, 'routes.json'),
    token: join(stateRoot, 'registration-token'),
    lock: join(stateRoot, 'router.lock'),
  };
}

function nowFrom(config: OperatorRouterServerConfig): Date {
  return config.now?.() ?? new Date();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackHost(value: string): boolean {
  const host = value.trim().replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function effectiveHttpPort(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

function requestHostMatchesListener(req: IncomingMessage, expectedPort: number): boolean {
  const hostHeader = headerValue(req.headers.host);
  if (!hostHeader) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.pathname === '/'
      && parsed.search.length === 0
      && parsed.hash.length === 0
      && isLoopbackHost(parsed.hostname)
      && effectiveHttpPort(parsed) === String(expectedPort);
  } catch {
    return false;
  }
}

function requestOriginIsSameLoopbackOrigin(req: IncomingMessage, expectedPort: number): boolean {
  const origin = headerValue(req.headers.origin);
  if (!origin) return true;
  const host = headerValue(req.headers.host);
  if (!host) return false;
  try {
    const requestUrl = new URL(`http://${host}`);
    const parsed = new URL(origin);
    const requestPort = effectiveHttpPort(requestUrl);
    const originPort = effectiveHttpPort(parsed);
    return parsed.protocol === requestUrl.protocol
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.pathname === '/'
      && parsed.search.length === 0
      && parsed.hash.length === 0
      && isLoopbackHost(parsed.hostname)
      && isLoopbackHost(requestUrl.hostname)
      && parsed.hostname === requestUrl.hostname
      && requestPort === String(expectedPort)
      && originPort === String(expectedPort);
  } catch {
    return false;
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function routeMatches(route: OperatorRouterRouteRegistration, pathname: string): boolean {
  if (route.route_mode === 'exact') return pathname === route.public_path;
  if (route.public_path === '/') return true;
  return pathname === route.public_path || pathname.startsWith(`${route.public_path}/`);
}

function routeRank(route: OperatorRouterRouteRegistration): number {
  return route.public_path === '/' ? 0 : route.public_path.length;
}

function findRoute(routes: readonly OperatorRouterRouteRegistration[], pathname: string): OperatorRouterRouteRegistration | null {
  return [...routes]
    .filter((route) => routeMatches(route, pathname))
    .sort((left, right) => routeRank(right) - routeRank(left))[0] ?? null;
}

function targetUrlForRequest(route: OperatorRouterRouteRegistration, pathname: string, search: string, websocket = false): URL | null {
  const raw = websocket ? route.websocket_target_url : route.target_url;
  if (!raw) return null;
  const target = new URL(raw);
  if (route.route_mode === 'exact') {
    target.search = search;
    return target;
  }
  const suffix = route.public_path === '/'
    ? pathname
    : pathname.slice(route.public_path.length) || '/';
  const basePath = target.pathname.replace(/\/+$/, '');
  target.pathname = `${basePath}${suffix.startsWith('/') ? suffix : `/${suffix}`}` || '/';
  target.search = search;
  return target;
}

function publicProjection(route: OperatorRouterRouteRegistration): ReturnType<typeof projectRouteRegistration> {
  return projectRouteRegistration(route);
}

function processAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readOrCreateToken(path: string, supplied?: string): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true });
  if (supplied?.trim()) {
    const token = supplied.trim();
    try {
      const existing = (await readFile(path, 'utf8')).trim();
      if (!existing) throw new Error('operator_router_registration_token_empty');
      if (existing !== token) throw new Error('operator_router_registration_token_conflict');
      return existing;
    } catch (error) {
      if (error instanceof Error && (error.message === 'operator_router_registration_token_conflict' || error.message === 'operator_router_registration_token_empty')) throw error;
      try {
        await writeFile(path, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      } catch (writeError) {
        if (!isRecord(writeError) || writeError.code !== 'EEXIST') throw writeError;
        const raced = (await readFile(path, 'utf8')).trim();
        if (!raced) throw new Error('operator_router_registration_token_empty');
        if (raced !== token) throw new Error('operator_router_registration_token_conflict');
        return raced;
      }
    }
    return token;
  }
  try {
    const existing = (await readFile(path, 'utf8')).trim();
    if (!existing) throw new Error('operator_router_registration_token_empty');
    return existing;
  } catch (error) {
    if (error instanceof Error && error.message === 'operator_router_registration_token_empty') throw error;
    if (!isRecord(error) || error.code !== 'ENOENT') throw error;
    // The token is created below when the file is absent.
  }
  const token = randomBytes(32).toString('base64url');
  try {
    await writeFile(path, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (!isRecord(error) || error.code !== 'EEXIST') throw error;
  }
  const materialized = (await readFile(path, 'utf8')).trim();
  if (!materialized) throw new Error('operator_router_registration_token_empty');
  return materialized;
}

function isTokenEqual(expected: string, supplied: string | null): boolean {
  if (!supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  await mkdir(join(path, '..'), { recursive: true });
  const instanceNonce = randomBytes(16).toString('hex');
  try {
    const handle = await open(path, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, instance_nonce: instanceNonce, created_at: new Date().toISOString() }));
    await handle.close();
    return async () => {
      try {
        const current = JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown; instance_nonce?: unknown };
        if (current.pid === process.pid && current.instance_nonce === instanceNonce) await unlink(path);
      } catch {
        // A replaced or already-removed lock is owned by another lifecycle.
      }
    };
  } catch (error) {
    if (!isRecord(error) || error.code !== 'EEXIST') throw error;
    let existing: { pid?: unknown; instance_nonce?: unknown };
    let existingText: string;
    try {
      existingText = await readFile(path, 'utf8');
      existing = JSON.parse(existingText) as { pid?: unknown; instance_nonce?: unknown };
    } catch (readError) {
      throw new Error('operator_router_singleton_lock_invalid', { cause: readError });
    }
    if (typeof existing.pid !== 'number' || typeof existing.instance_nonce !== 'string' || !existing.instance_nonce) {
      throw new Error('operator_router_singleton_lock_invalid');
    }
    if (processAlive(existing.pid)) throw new Error('operator_router_singleton_already_running');
    const currentText = await readFile(path, 'utf8').catch(() => null);
    if (currentText !== existingText) throw new Error('operator_router_singleton_already_running');
    await unlink(path).catch(() => undefined);
    return acquireLock(path);
  }
}

function createRouteStore(statePath: string, now: () => Date): RouteStore {
  function restoreRoute(value: unknown, observedAt: Date): OperatorRouterRouteRegistration | null {
    if (!isRecord(value) || typeof value.lease_expires_at !== 'string') return null;
    if (value.schema !== OPERATOR_ROUTER_REGISTRATION_SCHEMA || (value.state !== 'healthy' && value.state !== 'degraded')) return null;
    if (value.last_health_at !== null && typeof value.last_health_at !== 'string') return null;
    if (value.last_health_error !== null && typeof value.last_health_error !== 'string') return null;
    const expiresAt = Date.parse(value.lease_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= observedAt.getTime()) return null;
    const remainingLeaseMs = Math.max(MIN_OPERATOR_ROUTER_LEASE_MS, Math.min(MAX_OPERATOR_ROUTER_LEASE_MS, Math.trunc(expiresAt - observedAt.getTime())));
    try {
      const normalized = validateRouteRegistration({ ...value, lease_ms: remainingLeaseMs } as unknown as OperatorRouterRouteRegistrationInput, observedAt);
      return {
        ...normalized,
        lease_expires_at: new Date(expiresAt).toISOString(),
        state: value.state === 'degraded' ? 'degraded' : 'healthy',
        last_health_at: typeof value.last_health_at === 'string' ? value.last_health_at : null,
        last_health_error: typeof value.last_health_error === 'string' ? value.last_health_error : null,
      };
    } catch {
      return null;
    }
  }

  return {
    async load(): Promise<OperatorRouterState> {
      try {
        const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'));
        if (!isRecord(parsed) || parsed.schema !== OPERATOR_ROUTER_STATE_SCHEMA || !Array.isArray(parsed.routes)) {
          throw new Error('operator_router_state_invalid');
        }
        const observedAt = now();
        if (parsed.routes.length > MAX_OPERATOR_ROUTER_ROUTES) throw new Error('operator_router_state_invalid');
        const routes: OperatorRouterRouteRegistration[] = [];
        for (const route of parsed.routes) {
          if (!isRecord(route)) throw new Error('operator_router_state_route_invalid');
          if (typeof route.lease_expires_at !== 'string' || Date.parse(route.lease_expires_at) <= observedAt.getTime()) continue;
          const restored = restoreRoute(route, observedAt);
          if (!restored) throw new Error('operator_router_state_route_invalid');
          routes.push(restored);
        }
        if (typeof parsed.generation !== 'number' || !Number.isInteger(parsed.generation) || parsed.generation < 0) throw new Error('operator_router_state_invalid');
        if (new Set(routes.map((route) => route.route_id)).size !== routes.length) throw new Error('operator_router_state_route_invalid');
        for (let index = 0; index < routes.length; index += 1) {
          for (let other = index + 1; other < routes.length; other += 1) {
            if (routesOverlap(routes[index]!, routes[other]!)) throw new Error('operator_router_state_route_invalid');
          }
        }
        return { schema: OPERATOR_ROUTER_STATE_SCHEMA, generation: parsed.generation, routes };
      } catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') return { schema: OPERATOR_ROUTER_STATE_SCHEMA, generation: 0, routes: [] };
        if (error instanceof Error && (error.message === 'operator_router_state_invalid' || error.message === 'operator_router_state_route_invalid')) throw error;
        throw new Error('operator_router_state_read_failed');
      }
    },
    async save(state: OperatorRouterState): Promise<void> {
      await mkdir(join(statePath, '..'), { recursive: true });
      const temporaryPath = `${statePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, statePath);
    },
  };
}

async function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown> | null> {
  const body = await readRequestBody(req, maxBytes);
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function forwardedHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of ['accept', 'accept-encoding', 'accept-language', 'authorization', 'content-type', 'cookie', 'if-match', 'if-modified-since', 'if-none-match', 'origin', 'range', 'referer', 'user-agent', 'x-csrf-token', 'x-requested-with', 'x-xsrf-token']) {
    const value = headerValue(req.headers[name]);
    if (value) headers[name] = value;
  }
  headers['x-forwarded-host'] = headerValue(req.headers.host) ?? '127.0.0.1';
  headers['x-forwarded-proto'] = 'http';
  return headers;
}

function responseHeaders(response: Response): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const name of ['cache-control', 'content-disposition', 'content-encoding', 'content-language', 'content-length', 'content-range', 'content-security-policy', 'content-type', 'etag', 'last-modified', 'location', 'retry-after', 'vary', 'www-authenticate', 'x-narada-artifact-id', 'x-narada-artifact-kind']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : [];
  if (setCookies.length > 0) headers['set-cookie'] = setCookies;
  return headers;
}

async function resolveArtifactContent(route: OperatorRouterRouteRegistration, pathname: string): Promise<{ content: Buffer; contentType: string; headers: Record<string, string> } | null> {
  const source = route.reconstruction;
  if (!source?.site_root || !source.session_id) return null;
  if (pathname !== route.public_path && !pathname.startsWith(`${route.public_path}/`)) return null;
  const suffix = pathname.slice(route.public_path.length).replace(/^\/+/, '');
  const parts = suffix.split('/').filter(Boolean);
  if (parts.length !== 1 && parts.length !== 2) return null;
  if (parts.length === 2 && parts[1] !== 'content') return null;
  const artifactId = decodeURIComponent(parts[0] ?? '');
  if (!artifactId || artifactId === '.' || artifactId === '..' || artifactId.includes('/') || artifactId.includes('\\') || /[\u0000-\u001f\u007f]/u.test(artifactId)) return null;
  const sessions = await import('@narada2/nars-session-core/session-index');
  const discovered = sessions.discoverNarsSessions({ siteRoot: source.site_root });
  const session = discovered.sessions.find((entry: Record<string, unknown>) => entry.session_id === source.session_id);
  const record = session?.record as Record<string, unknown> | undefined;
  const sessionPath = typeof record?.session_path === 'string' ? record.session_path : null;
  if (!sessionPath) return null;
  if (parts.length === 2) {
    const artifact = readNarsArtifactContent({ sessionPath, artifactId });
    return { content: artifact.content, contentType: artifact.content_type, headers: artifact.headers };
  }
  const artifact = readNarsArtifact({ sessionPath, artifactId });
  const body = Buffer.from(JSON.stringify(publicNarsArtifactRecord(artifact)));
  return { content: body, contentType: 'application/json; charset=utf-8', headers: {} };
}

interface WebSocketControlTracker {
  buffer: Buffer;
}

function trackWebSocketControlFrames(tracker: WebSocketControlTracker, chunk: Buffer, onPong: () => void): void {
  tracker.buffer = Buffer.concat([tracker.buffer, chunk]);
  while (tracker.buffer.length >= 2) {
    const first = tracker.buffer[0]!;
    const second = tracker.buffer[1]!;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    const lengthCode = second & 0x7f;
    let headerLength = 2;
    let payloadLength = lengthCode;
    if (lengthCode === 126) {
      if (tracker.buffer.length < 4) return;
      payloadLength = tracker.buffer.readUInt16BE(2);
      headerLength = 4;
    } else if (lengthCode === 127) {
      if (tracker.buffer.length < 10) return;
      const wideLength = tracker.buffer.readBigUInt64BE(2);
      if (wideLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        tracker.buffer = Buffer.alloc(0);
        return;
      }
      payloadLength = Number(wideLength);
      headerLength = 10;
    }
    const frameLength = headerLength + (masked ? 4 : 0) + payloadLength;
    if (tracker.buffer.length < frameLength) return;
    if (opcode === 0x0a) onPong();
    tracker.buffer = tracker.buffer.subarray(frameLength);
  }
}

function websocketPingFrame(masked: boolean): Buffer {
  if (!masked) return Buffer.from([0x89, 0x00]);
  const mask = randomBytes(4);
  return Buffer.concat([Buffer.from([0x89, 0x80]), mask]);
}

function proxySocketRequest(
  client: Duplex,
  req: IncomingMessage,
  head: Buffer,
  target: URL,
  timeoutMs: number,
  activeSockets: Set<Duplex>,
  liveness: OperatorRouterWebSocketLiveness,
  lifecycleSink: ((event: OperatorRouterWebSocketLifecycleEvent) => void) | undefined,
  routeId: string,
  sessionId: string | null,
): void {
  const connectionId = randomBytes(12).toString('hex');
  const occurredAt = () => new Date().toISOString();
  const emitLifecycle = (
    phase: OperatorRouterWebSocketLifecycleEvent['phase'],
    details: Pick<OperatorRouterWebSocketLifecycleEvent, 'leg' | 'reason'> = {},
  ) => lifecycleSink?.({
    schema: 'narada.operator_router.websocket_lifecycle.v1',
    connection_id: connectionId,
    route_id: routeId,
    session_id: sessionId,
    phase,
    ...details,
    occurred_at: occurredAt(),
  });
  const port = Number(target.port) || (target.protocol === 'wss:' ? 443 : 80);
  const connectOptions = { host: target.hostname, port };
  const upstream = target.protocol === 'wss:'
    ? connectTls({ ...connectOptions, servername: target.hostname })
    : connectTcp(connectOptions);
  activeSockets?.add(upstream);
  upstream.once('close', () => activeSockets?.delete(upstream));
  emitLifecycle('client_connected');
  const requestHeaders = [
    `GET ${target.pathname || '/'}${target.search} HTTP/1.1`,
    `Host: ${target.host}`,
    'Connection: Upgrade',
    'Upgrade: websocket',
    `Sec-WebSocket-Key: ${headerValue(req.headers['sec-websocket-key']) ?? ''}`,
    `Sec-WebSocket-Version: ${headerValue(req.headers['sec-websocket-version']) ?? '13'}`,
    ...(headerValue(req.headers['sec-websocket-protocol']) ? [`Sec-WebSocket-Protocol: ${headerValue(req.headers['sec-websocket-protocol'])}`] : []),
    ...(headerValue(req.headers['sec-websocket-extensions']) ? [`Sec-WebSocket-Extensions: ${headerValue(req.headers['sec-websocket-extensions'])}`] : []),
    ...(headerValue(req.headers.origin) ? [`Origin: ${headerValue(req.headers.origin)}`] : []),
    ...(headerValue(req.headers.authorization) ? [`Authorization: ${headerValue(req.headers.authorization)}`] : []),
    ...(headerValue(req.headers.cookie) ? [`Cookie: ${headerValue(req.headers.cookie)}`] : []),
    '\r\n',
  ].join('\r\n');
  let closed = false;
  let handshakeComplete = false;
  let handshakeBuffer = Buffer.alloc(0);
  let clientPingSentAt: number | null = null;
  let upstreamPingSentAt: number | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const clientTracker: WebSocketControlTracker = { buffer: Buffer.alloc(0) };
  const upstreamTracker: WebSocketControlTracker = { buffer: Buffer.alloc(0) };
  const fail = (reason: string) => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    emitLifecycle('closed', { reason });
    client.destroy();
    upstream.destroy();
  };
  const markPong = (leg: 'client' | 'upstream') => {
    if (leg === 'client') clientPingSentAt = null;
    else upstreamPingSentAt = null;
    emitLifecycle('pong_received', { leg });
  };
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      if (closed) return;
      const now = Date.now();
      if (clientPingSentAt !== null && now - clientPingSentAt >= liveness.pong_timeout_ms) {
        fail('client_pong_timeout');
        return;
      }
      if (upstreamPingSentAt !== null && now - upstreamPingSentAt >= liveness.pong_timeout_ms) {
        fail('upstream_pong_timeout');
        return;
      }
      try {
        if (clientPingSentAt === null) {
          client.write(websocketPingFrame(false));
          clientPingSentAt = now;
          emitLifecycle('ping_sent', { leg: 'client' });
        }
        if (upstreamPingSentAt === null) {
          upstream.write(websocketPingFrame(true));
          upstreamPingSentAt = now;
          emitLifecycle('ping_sent', { leg: 'upstream' });
        }
      } catch {
        fail('heartbeat_write_failed');
      }
    }, liveness.ping_interval_ms);
    heartbeatTimer.unref();
  };
  upstream.setTimeout(timeoutMs, () => fail('upstream_handshake_timeout'));
  upstream.once('error', () => fail('upstream_error'));
  client.once('error', () => fail('client_error'));
  client.once('close', () => fail('client_closed'));
  upstream.once('close', () => fail('upstream_closed'));
  upstream.once(target.protocol === 'wss:' ? 'secureConnect' : 'connect', () => {
    emitLifecycle('upstream_connected');
    upstream.write(requestHeaders);
    if (head.length) upstream.write(head);
    client.on('data', (chunk: Buffer) => {
      if (handshakeComplete) trackWebSocketControlFrames(clientTracker, chunk, () => markPong('client'));
      if (!upstream.write(chunk)) client.pause();
    });
    upstream.on('data', (chunk: Buffer) => {
      if (!handshakeComplete) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd >= 0) {
          const header = handshakeBuffer.subarray(0, headerEnd).toString('latin1');
          if (!/^HTTP\/1\.1 101(?:\s|$)/u.test(header)) {
            client.write(chunk);
            fail('upstream_upgrade_rejected');
            return;
          }
          handshakeComplete = true;
          upstream.setTimeout(0);
          emitLifecycle('upstream_upgraded');
          startHeartbeat();
          trackWebSocketControlFrames(upstreamTracker, handshakeBuffer.subarray(headerEnd + 4), () => markPong('upstream'));
          handshakeBuffer = Buffer.alloc(0);
        }
      } else {
        trackWebSocketControlFrames(upstreamTracker, chunk, () => markPong('upstream'));
      }
      if (!client.write(chunk)) upstream.pause();
    });
    client.on('drain', () => upstream.resume());
    upstream.on('drain', () => client.resume());
  });
}

function routeLeaseValid(route: OperatorRouterRouteRegistration, now: Date): boolean {
  return Date.parse(route.lease_expires_at) > now.getTime();
}

export async function createOperatorRouterServer(config: Partial<OperatorRouterServerConfig> = {}): Promise<OperatorRouterServer> {
  const resolved: OperatorRouterServerConfig = {
    host: config.host ?? '127.0.0.1',
    port: config.port ?? 61729,
    state_root: config.state_root ?? defaultStateRoot(),
    registration_token: config.registration_token,
    now: config.now,
    fetch_fn: config.fetch_fn ?? fetch,
    health_interval_ms: config.health_interval_ms ?? HEALTH_INTERVAL_MS,
    maintenance_interval_ms: config.maintenance_interval_ms ?? MAINTENANCE_INTERVAL_MS,
    websocket_lifecycle_sink: config.websocket_lifecycle_sink,
  };
  if (!isLoopbackHost(resolved.host)) throw new Error('operator_router_host_not_loopback');
  if (!Number.isInteger(resolved.port) || resolved.port < 0 || resolved.port > 65_535) throw new Error('operator_router_port_invalid');
  const paths = statePaths(resolved.state_root);
  const token = await readOrCreateToken(paths.token, resolved.registration_token);
  const store = createRouteStore(paths.state, () => nowFrom(resolved));
  let state = await store.load();
  let server: Server | null = null;
  let url: string | null = null;
  let releaseLock: (() => Promise<void>) | null = null;
  let healthTimer: NodeJS.Timeout | null = null;
  let maintenanceTimer: NodeJS.Timeout | null = null;
  const activeUpgradeSockets = new Set<Duplex>();
  let stateWriteQueue: Promise<void> = Promise.resolve();
  let healthInFlight: Promise<void> | null = null;
  let maintenanceInFlight: Promise<void> | null = null;
  const startedAt = nowFrom(resolved);
  const fetchFn = resolved.fetch_fn ?? fetch;

  async function persist(): Promise<void> {
    state = { ...state, generation: state.generation + 1 };
    const snapshot = structuredClone(state);
    const write = stateWriteQueue.then(() => store.save(snapshot));
    stateWriteQueue = write.catch(() => {});
    await write;
  }

  async function healthCheck(route: OperatorRouterRouteRegistration): Promise<void> {
    if (route.process_evidence.pid !== null && !processAlive(route.process_evidence.pid)) {
      route.state = 'degraded';
      route.last_health_error = 'owner_process_not_alive';
      route.last_health_at = nowFrom(resolved).toISOString();
      return;
    }
    if (!route.health_url) {
      route.state = 'healthy';
      route.last_health_error = null;
      route.last_health_at = nowFrom(resolved).toISOString();
      return;
    }
    try {
      const response = await fetchFn(route.health_url, { method: 'GET', signal: AbortSignal.timeout(route.timeout_ms) });
      route.state = response.ok ? 'healthy' : 'degraded';
      route.last_health_error = response.ok ? null : `health_status:${response.status}`;
    } catch (error) {
      route.state = 'degraded';
      route.last_health_error = error instanceof Error ? error.name.slice(0, 80) : 'health_probe_failed';
    }
    route.last_health_at = nowFrom(resolved).toISOString();
  }

  async function maintainRoutes(): Promise<void> {
    const now = nowFrom(resolved);
    const remaining = state.routes.filter((route) => routeLeaseValid(route, now));
    if (remaining.length !== state.routes.length) {
      state.routes = remaining;
      await persist();
    }
  }

  async function refreshHealth(): Promise<void> {
    const routes = state.routes.filter((route) => routeLeaseValid(route, nowFrom(resolved)));
    if (routes.length === 0) return;
    await Promise.all(routes.map((route) => healthCheck(route)));
    await persist();
  }

  function scheduleHealthRefresh(): void {
    if (healthInFlight) return;
    let current: Promise<void>;
    current = refreshHealth().finally(() => {
      if (healthInFlight === current) healthInFlight = null;
    });
    healthInFlight = current;
    current.catch(() => undefined);
  }

  function scheduleRouteMaintenance(): void {
    if (maintenanceInFlight) return;
    let current: Promise<void>;
    current = maintainRoutes().finally(() => {
      if (maintenanceInFlight === current) maintenanceInFlight = null;
    });
    maintenanceInFlight = current;
    current.catch(() => undefined);
  }

  function authorized(req: IncomingMessage): boolean {
    const suppliedHeader = headerValue(req.headers[ROUTER_TOKEN_HEADER]);
    const authorization = headerValue(req.headers.authorization);
    const supplied = suppliedHeader ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null);
    return isTokenEqual(token, supplied);
  }

  async function registerRoute(input: OperatorRouterRouteRegistrationInput): Promise<OperatorRouterRouteRegistration> {
    const route = validateRouteRegistration(input, nowFrom(resolved));
    if (!state.routes.some((candidate) => candidate.route_id === route.route_id) && state.routes.length >= MAX_OPERATOR_ROUTER_ROUTES) {
      throw new Error('operator_router_route_limit_reached');
    }
    const conflict = state.routes.find((existing) => existing.route_id !== route.route_id && routesOverlap(existing, route));
    if (conflict) throw new Error(`operator_router_route_overlap:${conflict.route_id}`);
    const existing = state.routes.find((candidate) => candidate.route_id === route.route_id);
    if (existing && (existing.owner_id !== route.owner_id || existing.process_evidence.instance_nonce !== route.process_evidence.instance_nonce)) {
      const ownerIsStale = existing.state === 'degraded'
        || (existing.process_evidence.pid !== null && !processAlive(existing.process_evidence.pid));
      if (!ownerIsStale) throw new Error('operator_router_route_owner_conflict');
    }
    state.routes = [...state.routes.filter((candidate) => candidate.route_id !== route.route_id), route];
    await healthCheck(route);
    await persist();
    return route;
  }

  async function renewRoute(routeId: string, body: Record<string, unknown>): Promise<OperatorRouterRouteRegistration> {
    const route = state.routes.find((candidate) => candidate.route_id === routeId);
    if (!route) throw new Error('operator_router_route_not_found');
    if (body.owner_id !== route.owner_id || body.instance_nonce !== route.process_evidence.instance_nonce) throw new Error('operator_router_route_owner_conflict');
    const leaseMs = typeof body.lease_ms === 'number' ? body.lease_ms : route.lease_ms;
    const renewed = validateRouteRegistration({
      ...route,
      lease_ms: leaseMs,
      process_evidence: route.process_evidence,
    }, nowFrom(resolved));
    const updated = { ...route, lease_expires_at: renewed.lease_expires_at, state: 'healthy' as const };
    await healthCheck(updated);
    state.routes = state.routes.map((candidate) => candidate.route_id === routeId ? updated : candidate);
    await persist();
    return updated;
  }

  async function handleAdmin(req: IncomingMessage, res: ServerResponse, urlObject: URL): Promise<void> {
    if (!authorized(req)) {
      jsonResponse(res, 401, { error: 'operator_router_registration_authorization_required' });
      return;
    }
    if (urlObject.pathname === '/admin/routes' && req.method === 'GET') {
      const payload: OperatorRouterAdminRoutesResponse = {
        schema: OPERATOR_ROUTER_ADMIN_ROUTES_SCHEMA,
        identity: OPERATOR_ROUTER_IDENTITY,
        routes: structuredClone(state.routes),
      };
      jsonResponse(res, 200, payload);
      return;
    }
    if (urlObject.pathname === '/admin/routes' && req.method === 'POST') {
      const body = await readJsonBody(req, ADMIN_BODY_LIMIT);
      if (!body) { jsonResponse(res, 400, { error: 'operator_router_registration_payload_invalid' }); return; }
      try { jsonResponse(res, 200, await registerRoute(body as unknown as OperatorRouterRouteRegistrationInput)); }
      catch (error) { jsonResponse(res, 400, { error: error instanceof Error ? error.message : 'operator_router_registration_refused' }); }
      return;
    }
    const renewMatch = urlObject.pathname.match(/^\/admin\/routes\/([^/]+)\/renew$/);
    if (renewMatch && req.method === 'POST') {
      const body = await readJsonBody(req, ADMIN_BODY_LIMIT);
      if (!body) { jsonResponse(res, 400, { error: 'operator_router_renew_payload_invalid' }); return; }
      let routeId: string;
      try { routeId = decodeURIComponent(renewMatch[1]!); }
      catch { jsonResponse(res, 400, { error: 'operator_router_route_id_invalid' }); return; }
      try { jsonResponse(res, 200, await renewRoute(routeId, body)); }
      catch (error) { jsonResponse(res, 400, { error: error instanceof Error ? error.message : 'operator_router_renew_refused' }); }
      return;
    }
    const deleteMatch = urlObject.pathname.match(/^\/admin\/routes\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      let routeId: string;
      try { routeId = decodeURIComponent(deleteMatch[1]!); }
      catch { jsonResponse(res, 400, { error: 'operator_router_route_id_invalid' }); return; }
      const body = await readJsonBody(req, ADMIN_BODY_LIMIT);
      const route = state.routes.find((candidate) => candidate.route_id === routeId);
      if (!route) { jsonResponse(res, 404, { error: 'operator_router_route_not_found' }); return; }
      if (!body || body.owner_id !== route.owner_id || body.instance_nonce !== route.process_evidence.instance_nonce) { jsonResponse(res, 409, { error: 'operator_router_route_owner_conflict' }); return; }
      state.routes = state.routes.filter((candidate) => candidate.route_id !== routeId);
      await persist();
      jsonResponse(res, 200, { status: 'removed', route_id: routeId });
      return;
    }
    jsonResponse(res, 404, { error: 'operator_router_admin_route_not_found' });
  }

  async function proxyHttp(req: IncomingMessage, res: ServerResponse, route: OperatorRouterRouteRegistration, pathname: string, search: string): Promise<void> {
    if (!route.methods.includes(req.method ?? 'GET')) { jsonResponse(res, 405, { error: 'operator_router_method_not_admitted' }); return; }
    if (route.backend_kind === 'nars-artifact') {
      try {
        const artifact = await resolveArtifactContent(route, pathname);
        if (!artifact) { jsonResponse(res, 404, { error: 'operator_router_artifact_not_found' }); return; }
        res.writeHead(200, { 'content-type': artifact.contentType, 'content-length': artifact.content.byteLength, ...artifact.headers });
        if (req.method === 'HEAD') res.end();
        else res.end(artifact.content);
      } catch {
        jsonResponse(res, 404, { error: 'operator_router_artifact_not_found' });
      }
      return;
    }
    const target = targetUrlForRequest(route, pathname, search);
    if (!target) { jsonResponse(res, 502, { error: 'operator_router_target_unavailable' }); return; }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req, route.max_body_bytes);
    if (body === null) { jsonResponse(res, 413, { error: 'operator_router_request_body_too_large' }); return; }
    try {
      const upstream = await fetchFn(target, {
        method: req.method,
        headers: forwardedHeaders(req),
        ...(body ? { body: body as unknown as BodyInit } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(route.timeout_ms),
      });
      res.writeHead(upstream.status, responseHeaders(upstream));
      if (req.method === 'HEAD' || !upstream.body) { res.end(); return; }
      Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } catch {
      jsonResponse(res, 502, { error: 'operator_router_upstream_unavailable' });
    }
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requestHostMatchesListener(req, resolved.port) || !requestOriginIsSameLoopbackOrigin(req, resolved.port)) {
      jsonResponse(res, 421, { error: 'operator_router_host_or_origin_not_loopback' });
      return;
    }
    if (!requestPathIsSafe(requestTargetPath(req.url ?? '/'))) {
      jsonResponse(res, 400, { error: 'operator_router_request_path_invalid' });
      return;
    }
    let urlObject: URL;
    try {
      urlObject = new URL(req.url ?? '/', `http://${req.headers.host ?? `${resolved.host}:${resolved.port}`}`);
    } catch {
      jsonResponse(res, 400, { error: 'operator_router_request_url_invalid' });
      return;
    }
    if (!requestPathIsSafe(urlObject.pathname)) {
      jsonResponse(res, 400, { error: 'operator_router_request_path_invalid' });
      return;
    }
    if (urlObject.pathname === '/health' && req.method === 'GET') {
      const healthy = state.routes.filter((route) => route.state === 'healthy').length;
      const payload: OperatorRouterHealthResponse = {
        schema: OPERATOR_ROUTER_HEALTH_SCHEMA,
        identity: OPERATOR_ROUTER_IDENTITY,
        version: OPERATOR_ROUTER_VERSION,
        status: 'healthy',
        listener_host: resolved.host,
        listener_port: resolved.port,
        route_count: state.routes.length,
        healthy_route_count: healthy,
        degraded_route_count: state.routes.length - healthy,
        router_uptime_ms: Math.max(0, nowFrom(resolved).getTime() - startedAt.getTime()),
      };
      jsonResponse(res, 200, payload);
      return;
    }
    if (urlObject.pathname === '/routes' && req.method === 'GET') {
      const payload: OperatorRouterRoutesResponse = {
        schema: OPERATOR_ROUTER_ROUTES_SCHEMA,
        identity: OPERATOR_ROUTER_IDENTITY,
        routes: state.routes.map(publicProjection),
      };
      jsonResponse(res, 200, payload);
      return;
    }
    if (urlObject.pathname.startsWith('/admin/')) { await handleAdmin(req, res, urlObject); return; }
    if (RESERVED_PATHS.has(urlObject.pathname)) { jsonResponse(res, 404, { error: 'operator_router_route_not_found' }); return; }
    const route = findRoute(state.routes, urlObject.pathname);
    if (!route) { jsonResponse(res, 404, { error: 'operator_router_route_not_found' }); return; }
    if (!routeLeaseValid(route, nowFrom(resolved))) { jsonResponse(res, 410, { error: 'operator_router_route_lease_expired' }); return; }
    if (route.state === 'degraded') { jsonResponse(res, 503, { error: 'operator_router_route_degraded', route_id: route.route_id }); return; }
    if (!route.protocols.includes('http')) { jsonResponse(res, 404, { error: 'operator_router_http_not_admitted' }); return; }
    await proxyHttp(req, res, route, urlObject.pathname, urlObject.search);
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (req.method !== 'GET' || headerValue(req.headers.upgrade)?.toLowerCase() !== 'websocket' || !requestHostMatchesListener(req, resolved.port) || !requestOriginIsSameLoopbackOrigin(req, resolved.port)) { socket.destroy(); return; }
    if (!requestPathIsSafe(requestTargetPath(req.url ?? '/'))) { socket.destroy(); return; }
    let urlObject: URL;
    try {
      urlObject = new URL(req.url ?? '/', `http://${req.headers.host ?? `${resolved.host}:${resolved.port}`}`);
    } catch {
      socket.destroy();
      return;
    }
    if (!requestPathIsSafe(urlObject.pathname)) { socket.destroy(); return; }
    const route = findRoute(state.routes, urlObject.pathname);
    if (!route || route.state === 'degraded' || !routeLeaseValid(route, nowFrom(resolved)) || !route.protocols.includes('websocket') || !route.methods.includes('GET')) { socket.destroy(); return; }
    const target = targetUrlForRequest(route, urlObject.pathname, urlObject.search, true);
    if (!target || (target.protocol !== 'ws:' && target.protocol !== 'wss:')) { socket.destroy(); return; }
    activeUpgradeSockets.add(socket);
    socket.once('close', () => activeUpgradeSockets.delete(socket));
    proxySocketRequest(
      socket,
      req,
      head,
      target,
      route.timeout_ms,
      activeUpgradeSockets,
      route.websocket_liveness,
      resolved.websocket_lifecycle_sink,
      route.route_id,
      route.session_id,
    );
  }

  return {
    async start(): Promise<string> {
      if (server) throw new Error('operator_router_already_started');
      releaseLock = await acquireLock(paths.lock);
      server = createServer((req, res) => { handleRequest(req, res).catch(() => { if (!res.headersSent) jsonResponse(res, 500, { error: 'operator_router_internal_error' }); }); });
      server.requestTimeout = REQUEST_TIMEOUT_MS;
      server.headersTimeout = HEADERS_TIMEOUT_MS;
      server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
      server.on('upgrade', (req, socket, head) => { handleUpgrade(req, socket, head).catch(() => socket.destroy()); });
      try {
        const actualUrl = await new Promise<string>((resolvePromise, reject) => {
          server!.once('error', reject);
          server!.listen(resolved.port, resolved.host, () => {
            server!.off('error', reject);
            const address = server!.address();
            const actualPort = typeof address === 'object' && address ? address.port : resolved.port;
            resolved.port = actualPort;
            resolvePromise(`http://${resolved.host}:${actualPort}`);
          });
        });
        url = actualUrl;
        healthTimer = setInterval(scheduleHealthRefresh, resolved.health_interval_ms);
        maintenanceTimer = setInterval(scheduleRouteMaintenance, resolved.maintenance_interval_ms);
        healthTimer.unref();
        maintenanceTimer.unref();
        await refreshHealth();
        return actualUrl;
      } catch (error) {
        await stop();
        throw error;
      }
    },
    async stop(): Promise<void> {
      if (healthTimer) clearInterval(healthTimer);
      if (maintenanceTimer) clearInterval(maintenanceTimer);
      healthTimer = null;
      maintenanceTimer = null;
      for (const socket of activeUpgradeSockets) socket.destroy();
      activeUpgradeSockets.clear();
      if (server) {
        await new Promise<void>((resolvePromise) => server!.close(() => resolvePromise()));
        server = null;
        url = null;
      }
      await healthInFlight?.catch(() => undefined);
      await maintenanceInFlight?.catch(() => undefined);
      await stateWriteQueue.catch(() => undefined);
      if (releaseLock) await releaseLock();
      releaseLock = null;
    },
    getUrl(): string | null { return url; },
    getRegistrationToken(): string { return token; },
  } satisfies OperatorRouterServer;
}
