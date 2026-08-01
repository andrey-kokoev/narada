import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect as connectTcp } from 'node:net';
import type { Duplex } from 'node:stream';
import { connect as connectTls } from 'node:tls';
import {
  OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA,
  type OperatorConsoleHttpRouteParityEntry,
} from '@narada2/operator-console-contract';

export const OPERATOR_CONSOLE_REMOTE_GATEWAY_IDENTITY = 'narada.operator-console-remote-gateway' as const;
export const OPERATOR_CONSOLE_REMOTE_GATEWAY_HEALTH_SCHEMA = 'narada.operator_console_remote_gateway.health.v1' as const;
export const OPERATOR_CONSOLE_REMOTE_GATEWAY_REFUSAL_SCHEMA = 'narada.operator_console_remote_gateway.refusal.v1' as const;

const BRIDGE_TOKEN_HEADER = 'x-narada-operator-console-bridge-token';
const HOST_GATEWAY_TOKEN_HEADER = 'x-narada-host-gateway-token';
const HOST_ID_HEADER = 'x-narada-host-id';
const HOST_INSTANCE_ID_HEADER = 'x-narada-host-instance-id';
const DEFAULT_PORT = 61_730;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ROUTE_POLICY_TTL_MS = 5_000;
const REMOTE_GATEWAY_METHODS = new Set(['GET', 'POST', 'OPTIONS']);
const DEFAULT_REQUEST_BYTES = 4 * 1024 * 1024;
const DEFAULT_RESPONSE_BYTES = 16 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type FetchFunction = typeof fetch;

export interface OperatorConsoleRemoteGatewayConfig {
  router_url: string;
  router_token: string;
  bridge_token: string;
  /** Optional dedicated credential for host-qualified fleet crossings. */
  host_gateway_token?: string;
  host?: string;
  port?: number;
  timeout_ms?: number;
  max_request_bytes?: number;
  max_response_bytes?: number;
  route_policy_ttl_ms?: number;
  fetch_fn?: FetchFunction;
  now?: () => string;
  audit?: (event: OperatorConsoleRemoteGatewayAuditEvent) => void;
}

export interface OperatorConsoleRemoteGatewayAuditEvent {
  schema: 'narada.operator_console_remote_gateway.audit.v1';
  event: 'request_admitted' | 'request_refused' | 'upstream_failure';
  method: string;
  path: string;
  status: number;
  reason?: string;
  occurred_at: string;
}

export interface OperatorConsoleRemoteGateway {
  start(): Promise<string>;
  stop(): Promise<void>;
  getUrl(): string | null;
}

export function operatorConsoleRemoteGatewayPathDisposition(
  method: string,
  pathname: string,
  routePolicy: readonly OperatorConsoleHttpRouteParityEntry[],
): { admitted: true } | { admitted: false; status: 405 | 404; reason: string } {
  if (!isSafePath(pathname)) return { admitted: false, status: 404, reason: 'operator_console_gateway_path_invalid' };
  const normalizedMethod = method.toUpperCase();
  const matchingRoutes = routePolicy.filter((route) => {
    if (route.protocol !== 'http'
      || route.disposition !== 'proxy'
      || !REMOTE_GATEWAY_METHODS.has(route.method.toUpperCase())) return false;
    try { return new RegExp(route.pattern).test(pathname); } catch { return false; }
  });
  const effectiveMethod = normalizedMethod === 'HEAD' ? 'GET' : normalizedMethod;
  if (matchingRoutes.some((route) => route.method.toUpperCase() === effectiveMethod)) return { admitted: true };
  if (matchingRoutes.length > 0) {
    return { admitted: false, status: 405, reason: normalizedMethod === 'POST'
      ? 'operator_console_gateway_intent_not_admitted'
      : 'operator_console_gateway_method_not_admitted' };
  }
  return { admitted: false, status: 404, reason: 'operator_console_gateway_path_not_admitted' };
}

export function operatorConsoleRemoteGatewayWebSocketPathDisposition(
  method: string,
  pathname: string,
  routePolicy: readonly OperatorConsoleHttpRouteParityEntry[],
): { admitted: true } | { admitted: false; status: 405 | 404; reason: string } {
  if (!isSafePath(pathname)) return { admitted: false, status: 404, reason: 'operator_console_gateway_path_invalid' };
  const normalizedMethod = method.toUpperCase();
  const matchingRoutes = routePolicy.filter((route) => {
    if (route.protocol !== 'websocket' || route.disposition !== 'proxy' || route.method.toUpperCase() !== 'GET') return false;
    try { return new RegExp(route.pattern).test(pathname); } catch { return false; }
  });
  if (normalizedMethod === 'GET' && matchingRoutes.length > 0) return { admitted: true };
  if (matchingRoutes.length > 0) return { admitted: false, status: 405, reason: 'operator_console_gateway_websocket_method_not_admitted' };
  return { admitted: false, status: 404, reason: 'operator_console_gateway_websocket_path_not_admitted' };
}

export function createOperatorConsoleRemoteGateway(
  config: OperatorConsoleRemoteGatewayConfig,
): OperatorConsoleRemoteGateway {
  const routerUrl = normalizeRouterUrl(config.router_url);
  const routerToken = requireSecret(config.router_token, 'router_token');
  const bridgeToken = requireSecret(config.bridge_token, 'bridge_token');
  const hostGatewayToken = config.host_gateway_token === undefined
    ? null
    : requireSecret(config.host_gateway_token, 'host_gateway_token');
  const host = normalizeLoopbackHost(config.host ?? '127.0.0.1');
  const port = normalizePort(config.port ?? DEFAULT_PORT, true);
  const timeoutMs = normalizeBound(config.timeout_ms ?? DEFAULT_TIMEOUT_MS, 100, 120_000, 'timeout_ms');
  const maxRequestBytes = normalizeBound(config.max_request_bytes ?? DEFAULT_REQUEST_BYTES, 1, 64 * 1024 * 1024, 'max_request_bytes');
  const maxResponseBytes = normalizeBound(config.max_response_bytes ?? DEFAULT_RESPONSE_BYTES, 1, 64 * 1024 * 1024, 'max_response_bytes');
  const routePolicyTtlMs = normalizeBound(config.route_policy_ttl_ms ?? DEFAULT_ROUTE_POLICY_TTL_MS, 1_000, 120_000, 'route_policy_ttl_ms');
  const fetchFn = config.fetch_fn ?? fetch;
  const now = config.now ?? (() => new Date().toISOString());
  let server: Server | null = null;
  let url: string | null = null;
  const activeUpgradeSockets = new Set<Duplex>();
  let routePolicy: readonly OperatorConsoleHttpRouteParityEntry[] | null = null;
  let routePolicyExpiresAt = 0;

  async function refreshRoutePolicy(): Promise<readonly OperatorConsoleHttpRouteParityEntry[]> {
    const response = await fetchFn(`${routerUrl}/console/routes`, {
      headers: { 'x-narada-router-token': routerToken, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await readResponseBody(response, maxResponseBytes);
    if (!response.ok || body === null) throw new Error('operator_console_gateway_route_policy_unavailable');
    let payload: unknown;
    try { payload = JSON.parse(body.toString('utf8')); } catch { throw new Error('operator_console_gateway_route_policy_invalid'); }
    const parity = readRouteParity(payload);
    if (!parity) throw new Error('operator_console_gateway_route_policy_invalid');
    routePolicy = parity;
    routePolicyExpiresAt = Date.now() + routePolicyTtlMs;
    return parity;
  }

  async function ensureRoutePolicy(): Promise<readonly OperatorConsoleHttpRouteParityEntry[]> {
    if (routePolicy && Date.now() < routePolicyExpiresAt) return routePolicy;
    routePolicy = null;
    routePolicyExpiresAt = 0;
    try { return await refreshRoutePolicy(); }
    catch { throw new Error('operator_console_gateway_route_policy_unavailable'); }
  }

  function audit(event: OperatorConsoleRemoteGatewayAuditEvent): void {
    try { config.audit?.(event); } catch { /* audit sinks cannot change admission */ }
  }

  function refusal(res: ServerResponse, status: number, reason: string, method: string, path: string): void {
    const body = JSON.stringify({
      schema: OPERATOR_CONSOLE_REMOTE_GATEWAY_REFUSAL_SCHEMA,
      status: 'refused',
      code: reason,
    });
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(body);
    audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status, reason, occurred_at: now() });
  }

  async function handleHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let policy: readonly OperatorConsoleHttpRouteParityEntry[] | null = null;
    try { policy = await ensureRoutePolicy(); } catch { /* represented in the health response */ }
    const response = await fetchFn(`${routerUrl}/health`, {
      headers: { 'x-narada-router-token': routerToken },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const healthBody = await readResponseBody(response, maxResponseBytes);
    let payload: unknown = null;
    if (healthBody !== null) {
      try { payload = JSON.parse(healthBody.toString('utf8')); } catch { payload = null; }
    }
    const healthy = response.ok && policy !== null;
    const body = JSON.stringify({
      schema: OPERATOR_CONSOLE_REMOTE_GATEWAY_HEALTH_SCHEMA,
      identity: OPERATOR_CONSOLE_REMOTE_GATEWAY_IDENTITY,
      status: healthy ? 'healthy' : 'degraded',
      listener_host: host,
      listener_port: port,
      router: { status: response.status, healthy: response.ok, payload },
      route_policy: policy ? { status: 'ready', route_count: policy.length } : { status: 'unavailable' },
    });
    res.writeHead(healthy ? 200 : 503, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(body);
    audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_admitted', method: req.method ?? 'GET', path: '/health', status: healthy ? 200 : 503, occurred_at: now() });
  }

  async function handleProxy(req: IncomingMessage, res: ServerResponse, requestUrl: URL): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const path = requestUrl.pathname;
    let policy: readonly OperatorConsoleHttpRouteParityEntry[];
    try { policy = await ensureRoutePolicy(); }
    catch {
      refusal(res, 503, 'operator_console_gateway_route_policy_unavailable', method, path);
      return;
    }
    let disposition = operatorConsoleRemoteGatewayPathDisposition(method, path, policy);
    if (!disposition.admitted && disposition.reason !== 'operator_console_gateway_path_invalid') {
      // A newly leased session or artifact route must become reachable without
      // waiting for the bounded policy cache to expire. The Router remains the
      // final authority when the route is forwarded.
      try {
        policy = await refreshRoutePolicy();
        disposition = operatorConsoleRemoteGatewayPathDisposition(method, path, policy);
      } catch {
        refusal(res, 503, 'operator_console_gateway_route_policy_unavailable', method, path);
        return;
      }
    }
    if (!disposition.admitted) {
      refusal(res, disposition.status, disposition.reason, method, path);
      return;
    }
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,accept,x-request-id',
        'cache-control': 'no-store',
      });
      res.end();
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_admitted', method, path, status: 204, occurred_at: now() });
      return;
    }

    const body = method === 'GET' || method === 'HEAD' ? undefined : await readIncomingBody(req, maxRequestBytes);
    if (body === null) {
      refusal(res, 413, 'operator_console_gateway_request_body_too_large', method, path);
      return;
    }
    const target = new URL(path + requestUrl.search, `${routerUrl}/`);
    const headers = new Headers({ 'x-narada-router-token': routerToken });
    for (const name of ['accept', 'content-type', 'if-none-match', 'if-modified-since', 'cache-control', 'x-request-id']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    let upstream: Response;
    try {
      upstream = await fetchFn(target, {
        method,
        headers,
        ...(body === undefined ? {} : { body: body as unknown as BodyInit }),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 160) : 'operator_console_gateway_upstream_unavailable';
      refusal(res, 502, 'operator_console_gateway_upstream_unavailable', method, path);
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'upstream_failure', method, path, status: 502, reason, occurred_at: now() });
      return;
    }
    const responseBody = await readResponseBody(upstream, maxResponseBytes);
    if (responseBody === null) {
      refusal(res, 502, 'operator_console_gateway_response_too_large', method, path);
      return;
    }
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_HEADERS.has(name) && name !== 'set-cookie' && name !== 'content-length') responseHeaders[name] = value;
    });
    responseHeaders['cache-control'] = 'no-store';
    if (responseBody.byteLength > 0 && method !== 'HEAD') responseHeaders['content-length'] = String(responseBody.byteLength);
    res.writeHead(upstream.status, responseHeaders);
    if (method === 'HEAD') res.end();
    else res.end(responseBody);
    audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_admitted', method, path, status: upstream.status, occurred_at: now() });
  }

  async function handleUpgrade(req: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
    const path = requestUrl.pathname;
    const credential = authorizeCredential(req, bridgeToken, hostGatewayToken);
    if (!credential.ok) {
      refuseUpgrade(client, 401, credential.reason);
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status: 401, reason: credential.reason, occurred_at: now() });
      return;
    }
    let policy: readonly OperatorConsoleHttpRouteParityEntry[];
    try { policy = await ensureRoutePolicy(); }
    catch {
      refuseUpgrade(client, 503, 'operator_console_gateway_route_policy_unavailable');
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status: 503, reason: 'operator_console_gateway_route_policy_unavailable', occurred_at: now() });
      return;
    }
    let disposition = operatorConsoleRemoteGatewayWebSocketPathDisposition(method, path, policy);
    if (!disposition.admitted && disposition.reason !== 'operator_console_gateway_path_invalid') {
      // Keep WebSocket session leases consistent with the HTTP lease path.
      try {
        policy = await refreshRoutePolicy();
        disposition = operatorConsoleRemoteGatewayWebSocketPathDisposition(method, path, policy);
      } catch {
        refuseUpgrade(client, 503, 'operator_console_gateway_route_policy_unavailable');
        audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status: 503, reason: 'operator_console_gateway_route_policy_unavailable', occurred_at: now() });
        return;
      }
    }
    if (!disposition.admitted) {
      refuseUpgrade(client, disposition.status, disposition.reason);
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status: disposition.status, reason: disposition.reason, occurred_at: now() });
      return;
    }
    const key = readHeader(req, 'sec-websocket-key');
    if (!key) {
      refuseUpgrade(client, 400, 'operator_console_gateway_websocket_key_required');
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_refused', method, path, status: 400, reason: 'operator_console_gateway_websocket_key_required', occurred_at: now() });
      return;
    }
    const target = new URL(path + requestUrl.search, `${routerUrl}/`);
    const targetPort = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
    const upstream = target.protocol === 'https:'
      ? connectTls({ host: target.hostname, port: targetPort, servername: target.hostname })
      : connectTcp({ host: target.hostname, port: targetPort });
    activeUpgradeSockets.add(client);
    activeUpgradeSockets.add(upstream);
    let closed = false;
    let handshakeComplete = false;
    let handshakeBuffer = Buffer.alloc(0);
    const fail = (reason: string): void => {
      if (closed) return;
      closed = true;
      client.destroy();
      upstream.destroy();
      activeUpgradeSockets.delete(client);
      activeUpgradeSockets.delete(upstream);
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'upstream_failure', method, path, status: 502, reason, occurred_at: now() });
    };
    const onData = (chunk: Buffer): void => {
      if (handshakeComplete) return;
      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
      if (handshakeBuffer.byteLength > maxResponseBytes) { fail('operator_console_gateway_websocket_handshake_too_large'); return; }
      const headerEnd = handshakeBuffer.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd < 0) return;
      const header = handshakeBuffer.subarray(0, headerEnd).toString('latin1');
      if (!/^HTTP\/1\.1 101(?:\s|$)/u.test(header)) { refuseUpgrade(client, 502, 'operator_console_gateway_websocket_upstream_rejected'); fail('operator_console_gateway_websocket_upstream_rejected'); return; }
      handshakeComplete = true;
      upstream.removeListener('data', onData);
      upstream.setTimeout(0);
      client.write(handshakeBuffer.subarray(0, headerEnd + 4));
      const remainder = handshakeBuffer.subarray(headerEnd + 4);
      if (remainder.byteLength > 0) client.write(remainder);
      if (head.byteLength > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
      audit({ schema: 'narada.operator_console_remote_gateway.audit.v1', event: 'request_admitted', method, path, status: 101, occurred_at: now() });
    };
    client.pause();
    client.once('error', () => fail('operator_console_gateway_websocket_client_error'));
    client.once('close', () => fail('operator_console_gateway_websocket_client_closed'));
    upstream.once('error', () => fail('operator_console_gateway_websocket_upstream_error'));
    upstream.once('close', () => { if (!closed) fail('operator_console_gateway_websocket_upstream_closed'); });
    upstream.on('data', onData);
    upstream.setTimeout(timeoutMs, () => fail('operator_console_gateway_websocket_handshake_timeout'));
    const connected = target.protocol === 'https:' ? 'secureConnect' : 'connect';
    upstream.once(connected, () => {
      const lines = [
        `GET ${target.pathname || '/'}${target.search} HTTP/1.1`,
        `Host: ${target.host}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        `Origin: ${target.origin}`,
        `Sec-WebSocket-Key: ${key}`,
        `Sec-WebSocket-Version: ${readHeader(req, 'sec-websocket-version') ?? '13'}`,
      ];
      const protocol = readHeader(req, 'sec-websocket-protocol');
      if (protocol) lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    });
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
    const method = req.method ?? 'GET';
    const path = requestUrl.pathname;
    const credential = authorizeCredential(req, bridgeToken, hostGatewayToken);
    if (!credential.ok) {
      refusal(res, 401, credential.reason, method, path);
      return;
    }
    if (path === '/health' && method === 'GET') {
      try { await handleHealth(req, res); } catch { refusal(res, 503, 'operator_console_gateway_router_unavailable', method, path); }
      return;
    }
    await handleProxy(req, res, requestUrl);
  }

  return {
    async start(): Promise<string> {
      if (server) throw new Error('operator_console_gateway_already_started');
      await ensureRoutePolicy();
      server = createServer((req, res) => {
        handleRequest(req, res).catch(() => {
          if (!res.headersSent) refusal(res, 500, 'operator_console_gateway_internal_error', req.method ?? 'GET', req.url ?? '/');
          else res.destroy();
        });
      });
      server.on('upgrade', (req, socket, head) => { void handleUpgrade(req, socket, head); });
      return await new Promise<string>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(port, host, () => {
          const address = server!.address();
          const actualPort = typeof address === 'object' && address !== null ? address.port : port;
          url = `http://${formatHost(host)}:${actualPort}`;
          resolve(url);
        });
      });
    },
    async stop(): Promise<void> {
      if (!server) return;
      const current = server;
      server = null;
      url = null;
      routePolicy = null;
      routePolicyExpiresAt = 0;
      for (const socket of activeUpgradeSockets) socket.destroy();
      activeUpgradeSockets.clear();
      await new Promise<void>((resolve, reject) => current.close((error) => error ? reject(error) : resolve()));
    },
    getUrl(): string | null { return url; },
  };
}

function readRouteParity(value: unknown): readonly OperatorConsoleHttpRouteParityEntry[] | null {
  if (!isRecord(value)) return null;
  const parity = value.httpRouteParity;
  if (!isRecord(parity)
    || parity.schema !== OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA
    || parity.status !== 'complete'
    || parity.source !== 'local_operator_console_route_table'
    || typeof parity.generatedAt !== 'string'
    || !Array.isArray(parity.routes)
    || parity.routes.length === 0
    || parity.routes.length > 512) return null;
  const ids = new Set<string>();
  const routes: OperatorConsoleHttpRouteParityEntry[] = [];
  for (const candidate of parity.routes) {
    if (!isRecord(candidate)
      || typeof candidate.routeId !== 'string'
      || candidate.routeId.length === 0
      || candidate.routeId.length > 160
      || ids.has(candidate.routeId)
      || typeof candidate.method !== 'string'
      || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(candidate.method.toUpperCase())
      || !['http', 'websocket'].includes(candidate.protocol as string)
      || typeof candidate.pattern !== 'string'
      || candidate.pattern.length === 0
      || candidate.pattern.length > 512
      || !hasAdmittedRouteNamespace(candidate.pattern)
      || !['proxy', 'local-only'].includes(candidate.disposition as string)
      || !['document', 'observation', 'intent'].includes(candidate.kind as string)
      || (candidate.intentKind !== null && typeof candidate.intentKind !== 'string')
      || (candidate.kind === 'intent' && typeof candidate.intentKind !== 'string')) return null;
    try {
      const pattern = new RegExp(candidate.pattern);
      if (pattern.global || pattern.sticky) return null;
    } catch {
      return null;
    }
    ids.add(candidate.routeId);
    routes.push({
      routeId: candidate.routeId,
      method: candidate.method.toUpperCase(),
      protocol: candidate.protocol as OperatorConsoleHttpRouteParityEntry['protocol'],
      pattern: candidate.pattern,
      disposition: candidate.disposition as OperatorConsoleHttpRouteParityEntry['disposition'],
      kind: candidate.kind as OperatorConsoleHttpRouteParityEntry['kind'],
      intentKind: candidate.intentKind as string | null,
    });
  }
  return routes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAdmittedRouteNamespace(pattern: string): boolean {
  const normalized = pattern.replaceAll('\\', '');
  return ['^/console', '^/sessions', '^/artifacts', '^/sites'].some((prefix) => normalized.startsWith(prefix));
}

function isSafePath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.includes('\\') || /[\u0000-\u001f\u007f]/u.test(pathname)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  return !decoded.split('/').some((segment) => segment === '.' || segment === '..');
}

function authorizeCredential(
  req: IncomingMessage,
  bridgeToken: string,
  hostGatewayToken: string | null,
): { ok: true; class: 'bridge_compatibility' | 'dedicated_host_gateway' } | { ok: false; reason: string } {
  const hostQualified = Boolean(readHeader(req, HOST_ID_HEADER) || readHeader(req, HOST_INSTANCE_ID_HEADER));
  if (hostQualified && hostGatewayToken !== null) {
    return constantTimeEqual(readHeader(req, HOST_GATEWAY_TOKEN_HEADER) ?? '', hostGatewayToken)
      ? { ok: true, class: 'dedicated_host_gateway' }
      : { ok: false, reason: 'operator_console_gateway_host_credential_required' };
  }
  return constantTimeEqual(readHeader(req, BRIDGE_TOKEN_HEADER) ?? '', bridgeToken)
    ? { ok: true, class: 'bridge_compatibility' }
    : { ok: false, reason: 'operator_console_gateway_bridge_credential_required' };
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function refuseUpgrade(socket: Duplex, status: number, code: string): void {
  const reason = status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : status === 405 ? 'Method Not Allowed' : 'Bad Gateway';
  const body = JSON.stringify({ schema: OPERATOR_CONSOLE_REMOTE_GATEWAY_REFUSAL_SCHEMA, status: 'refused', code });
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nCache-Control: no-store\r\n\r\n${body}`);
  socket.destroy();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function readIncomingBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += next.byteLength;
    if (total > maxBytes) return null;
    chunks.push(next);
  }
  return Buffer.concat(chunks, total);
}

async function readResponseBody(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function normalizeRouterUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('operator_console_gateway_router_url_invalid'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('operator_console_gateway_router_url_invalid');
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname.toLowerCase())) throw new Error('operator_console_gateway_router_not_loopback');
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) throw new Error('operator_console_gateway_router_url_invalid');
  return parsed.toString().replace(/\/$/, '');
}

function normalizeLoopbackHost(value: string): string {
  const normalized = value.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(normalized)) throw new Error('operator_console_gateway_host_not_loopback');
  return normalized;
}

function normalizePort(value: number, allowZero: boolean): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 65_535) throw new Error('operator_console_gateway_port_invalid');
  return value;
}

function normalizeBound(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`operator_console_gateway_${name}_invalid`);
  return value;
}

function requireSecret(value: string, name: string): string {
  if (typeof value !== 'string' || value.length < 16) throw new Error(`operator_console_gateway_${name}_required`);
  return value;
}

function formatHost(value: string): string {
  return value.includes(':') ? `[${value}]` : value;
}
