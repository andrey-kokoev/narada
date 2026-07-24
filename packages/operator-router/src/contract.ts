export const OPERATOR_ROUTER_IDENTITY = 'narada.operator-router' as const;
export const OPERATOR_ROUTER_VERSION = '0.1.0' as const;
export const OPERATOR_ROUTER_HEALTH_SCHEMA = 'narada.operator_router.health.v1' as const;
export const OPERATOR_ROUTER_ROUTES_SCHEMA = 'narada.operator_router.routes.v1' as const;
export const OPERATOR_ROUTER_ADMIN_ROUTES_SCHEMA = 'narada.operator_router.admin_routes.v1' as const;
export const OPERATOR_ROUTER_STATE_SCHEMA = 'narada.operator_router.state.v1' as const;
export const OPERATOR_ROUTER_REGISTRATION_SCHEMA = 'narada.operator_router.route_registration.v1' as const;

export const DEFAULT_OPERATOR_ROUTER_PORT = 61729;
export const DEFAULT_OPERATOR_ROUTER_LEASE_MS = 60_000;
export const MIN_OPERATOR_ROUTER_LEASE_MS = 5_000;
export const MAX_OPERATOR_ROUTER_LEASE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_OPERATOR_ROUTER_TIMEOUT_MS = 15_000;
export const DEFAULT_OPERATOR_ROUTER_WS_PING_INTERVAL_MS = 5_000;
export const DEFAULT_OPERATOR_ROUTER_WS_PONG_TIMEOUT_MS = 10_000;
export const MAX_OPERATOR_ROUTER_BODY_BYTES = 10 * 1024 * 1024;
export const MAX_OPERATOR_ROUTER_ROUTES = 1_024;

export type OperatorRouterRouteClass =
  | 'operator-console'
  | 'agent-web-ui'
  | 'nars-artifact'
  | 'site-operations';

export type OperatorRouterBackendKind = 'http' | 'nars-artifact';
export type OperatorRouterRouteMode = 'prefix' | 'exact';
export type OperatorRouterRouteState = 'healthy' | 'degraded';
export type OperatorRouterProtocol = 'http' | 'websocket';

export interface OperatorRouterWebSocketLiveness {
  mode: 'ping_pong';
  ping_interval_ms: number;
  pong_timeout_ms: number;
}

function normalizeWebSocketLiveness(value: Partial<OperatorRouterWebSocketLiveness> | null | undefined): OperatorRouterWebSocketLiveness {
  if (value !== undefined && value !== null && typeof value !== 'object') throw new Error('operator_router_websocket_liveness_invalid');
  const mode = value?.mode ?? 'ping_pong';
  if (mode !== 'ping_pong') throw new Error('operator_router_websocket_liveness_mode_invalid');
  const pingIntervalMs = value?.ping_interval_ms ?? DEFAULT_OPERATOR_ROUTER_WS_PING_INTERVAL_MS;
  const pongTimeoutMs = value?.pong_timeout_ms ?? DEFAULT_OPERATOR_ROUTER_WS_PONG_TIMEOUT_MS;
  if (!Number.isInteger(pingIntervalMs) || pingIntervalMs < 1_000 || pingIntervalMs > 60_000) {
    throw new Error('operator_router_websocket_ping_interval_invalid');
  }
  if (!Number.isInteger(pongTimeoutMs) || pongTimeoutMs < 1_000 || pongTimeoutMs > 120_000 || pongTimeoutMs < pingIntervalMs) {
    throw new Error('operator_router_websocket_pong_timeout_invalid');
  }
  return { mode, ping_interval_ms: pingIntervalMs, pong_timeout_ms: pongTimeoutMs };
}

export interface OperatorRouterProcessEvidence {
  instance_nonce: string;
  pid: number | null;
  started_at: string | null;
}

function normalizeNullableString(value: unknown, errorCode: string): string | null {
  if (value !== null && value !== undefined && typeof value !== 'string') throw new Error(errorCode);
  return value == null ? null : value;
}

export interface OperatorRouterReconstructionSource {
  kind: 'explicit' | 'nars-session' | 'site-operation';
  site_root: string | null;
  site_id: string | null;
  session_id: string | null;
}

export interface OperatorRouterRouteRegistration {
  schema: typeof OPERATOR_ROUTER_REGISTRATION_SCHEMA;
  route_id: string;
  route_class: OperatorRouterRouteClass;
  backend_kind: OperatorRouterBackendKind;
  public_path: string;
  route_mode: OperatorRouterRouteMode;
  target_url: string | null;
  websocket_target_url: string | null;
  health_url: string | null;
  owner_id: string;
  site_id: string | null;
  session_id: string | null;
  process_evidence: OperatorRouterProcessEvidence;
  protocols: readonly OperatorRouterProtocol[];
  methods: readonly string[];
  max_body_bytes: number;
  timeout_ms: number;
  websocket_liveness: OperatorRouterWebSocketLiveness;
  lease_ms: number;
  lease_expires_at: string;
  state: OperatorRouterRouteState;
  last_health_at: string | null;
  last_health_error: string | null;
  reconstruction: OperatorRouterReconstructionSource | null;
}

export interface OperatorRouterRouteRegistrationInput {
  route_id: string;
  route_class: OperatorRouterRouteClass;
  backend_kind?: OperatorRouterBackendKind;
  public_path: string;
  route_mode?: OperatorRouterRouteMode;
  target_url?: string | null;
  websocket_target_url?: string | null;
  health_url?: string | null;
  owner_id: string;
  site_id?: string | null;
  session_id?: string | null;
  process_evidence: OperatorRouterProcessEvidence;
  protocols?: readonly OperatorRouterProtocol[];
  methods?: readonly string[];
  max_body_bytes?: number;
  timeout_ms?: number;
  websocket_liveness?: Partial<OperatorRouterWebSocketLiveness> | null;
  lease_ms?: number;
  reconstruction?: OperatorRouterReconstructionSource | null;
}

export interface OperatorRouterRouteProjection {
  route_id: string;
  route_class: OperatorRouterRouteClass;
  backend_kind: OperatorRouterBackendKind;
  public_path: string;
  route_mode: OperatorRouterRouteMode;
  owner_id: string;
  site_id: string | null;
  session_id: string | null;
  protocols: readonly OperatorRouterProtocol[];
  methods: readonly string[];
  state: OperatorRouterRouteState;
  lease_expires_at: string;
  last_health_at: string | null;
  last_health_error: string | null;
}

export interface OperatorRouterHealthResponse {
  schema: typeof OPERATOR_ROUTER_HEALTH_SCHEMA;
  identity: typeof OPERATOR_ROUTER_IDENTITY;
  version: typeof OPERATOR_ROUTER_VERSION;
  status: 'healthy';
  listener_host: string;
  listener_port: number;
  route_count: number;
  healthy_route_count: number;
  degraded_route_count: number;
  router_uptime_ms: number;
}

export interface OperatorRouterRoutesResponse {
  schema: typeof OPERATOR_ROUTER_ROUTES_SCHEMA;
  identity: typeof OPERATOR_ROUTER_IDENTITY;
  routes: OperatorRouterRouteProjection[];
}

/**
 * Authenticated route inventory used by lifecycle commands.  Process evidence
 * is intentionally omitted from the public `/routes` projection and exposed
 * only through the router's token-protected admin surface.
 */
export interface OperatorRouterAdminRoutesResponse {
  schema: typeof OPERATOR_ROUTER_ADMIN_ROUTES_SCHEMA;
  identity: typeof OPERATOR_ROUTER_IDENTITY;
  routes: OperatorRouterRouteRegistration[];
}

export interface OperatorRouterState {
  schema: typeof OPERATOR_ROUTER_STATE_SCHEMA;
  generation: number;
  routes: OperatorRouterRouteRegistration[];
}

const ALLOWED_ROUTE_CLASSES = new Set<OperatorRouterRouteClass>([
  'operator-console',
  'agent-web-ui',
  'nars-artifact',
  'site-operations',
]);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export function isLoopbackUrl(value: string, protocols: readonly string[] = ['http:', 'https:', 'ws:', 'wss:']): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol)
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.hash.length === 0
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1' || parsed.hostname === '[::1]');
  } catch {
    return false;
  }
}

function normalizePublicPath(value: string): string {
  const path = value.trim();
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new Error('operator_router_public_path_invalid');
  }
  if (!path.startsWith('/') || path.includes('..') || path.includes('?') || path.includes('#') || decodedPath.includes('..') || decodedPath.includes('\\')) {
    throw new Error('operator_router_public_path_invalid');
  }
  const normalized = `/${path.replace(/^\/+|\/+$/g, '')}`;
  const canonical = normalized === '//' ? '/' : normalized;
  if (canonical === '/health' || canonical === '/routes' || canonical === '/admin' || canonical.startsWith('/admin/')) {
    throw new Error('operator_router_public_path_reserved');
  }
  return canonical;
}

function normalizeRouteId(value: string): string {
  const routeId = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(routeId)) throw new Error('operator_router_route_id_invalid');
  return routeId;
}

function normalizeMethods(methods: unknown): string[] {
  if (methods !== undefined && !Array.isArray(methods)) throw new Error('operator_router_methods_invalid');
  if (Array.isArray(methods) && methods.some((method) => typeof method !== 'string')) throw new Error('operator_router_methods_invalid');
  const normalized = Array.from(new Set(((methods ?? ['GET', 'HEAD']) as string[]).map((method) => method.trim().toUpperCase())));
  if (normalized.length === 0 || normalized.length > 8 || normalized.some((method) => !ALLOWED_METHODS.has(method))) {
    throw new Error('operator_router_methods_invalid');
  }
  return normalized;
}

function normalizeProtocols(protocols: unknown): OperatorRouterProtocol[] {
  if (protocols !== undefined && !Array.isArray(protocols)) throw new Error('operator_router_protocols_invalid');
  if (Array.isArray(protocols) && protocols.some((protocol) => typeof protocol !== 'string')) throw new Error('operator_router_protocols_invalid');
  const normalized = Array.from(new Set((protocols ?? ['http']) as string[])) as string[];
  if (normalized.length === 0 || normalized.some((protocol) => protocol !== 'http' && protocol !== 'websocket')) {
    throw new Error('operator_router_protocols_invalid');
  }
  return normalized as OperatorRouterProtocol[];
}

function normalizeLeaseMs(value: number | undefined): number {
  const leaseMs = value ?? DEFAULT_OPERATOR_ROUTER_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs < MIN_OPERATOR_ROUTER_LEASE_MS || leaseMs > MAX_OPERATOR_ROUTER_LEASE_MS) {
    throw new Error('operator_router_lease_invalid');
  }
  return leaseMs;
}

function normalizeBodyBytes(value: number | undefined): number {
  const maxBodyBytes = value ?? 1024 * 1024;
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 0 || maxBodyBytes > MAX_OPERATOR_ROUTER_BODY_BYTES) {
    throw new Error('operator_router_body_limit_invalid');
  }
  return maxBodyBytes;
}

function normalizeTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_OPERATOR_ROUTER_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('operator_router_timeout_invalid');
  return timeoutMs;
}

function validateProcessEvidence(evidence: OperatorRouterProcessEvidence): OperatorRouterProcessEvidence {
  if (!evidence || typeof evidence.instance_nonce !== 'string' || !/^[A-Za-z0-9._-]{8,128}$/.test(evidence.instance_nonce)) {
    throw new Error('operator_router_process_nonce_required');
  }
  if (evidence.pid !== null && (!Number.isInteger(evidence.pid) || evidence.pid < 0)) throw new Error('operator_router_process_pid_invalid');
  if (evidence.started_at !== null && Number.isNaN(Date.parse(evidence.started_at))) throw new Error('operator_router_process_started_at_invalid');
  return { instance_nonce: evidence.instance_nonce, pid: evidence.pid ?? null, started_at: evidence.started_at ?? null };
}

function validateReconstruction(source: OperatorRouterReconstructionSource | null | undefined): OperatorRouterReconstructionSource | null {
  if (!source) return null;
  if (typeof source !== 'object' || Array.isArray(source)) throw new Error('operator_router_reconstruction_invalid');
  if (source.kind !== 'explicit' && source.kind !== 'nars-session' && source.kind !== 'site-operation') throw new Error('operator_router_reconstruction_kind_invalid');
  if (source.site_root !== null && source.site_root !== undefined && typeof source.site_root !== 'string') throw new Error('operator_router_reconstruction_site_root_invalid');
  if (source.site_id !== null && source.site_id !== undefined && typeof source.site_id !== 'string') throw new Error('operator_router_reconstruction_site_id_invalid');
  if (source.session_id !== null && source.session_id !== undefined && typeof source.session_id !== 'string') throw new Error('operator_router_reconstruction_session_id_invalid');
  const normalized = {
    kind: source.kind,
    site_root: source.site_root ?? null,
    site_id: source.site_id ?? null,
    session_id: source.session_id ?? null,
  };
  if (normalized.kind === 'nars-session' && (!normalized.site_root || !normalized.session_id)) {
    throw new Error('operator_router_nars_session_reconstruction_identity_required');
  }
  if (normalized.kind === 'site-operation' && (!normalized.site_root || !normalized.site_id)) {
    throw new Error('operator_router_site_operation_reconstruction_identity_required');
  }
  return normalized;
}

export function validateRouteRegistration(
  input: OperatorRouterRouteRegistrationInput,
  now = new Date(),
): OperatorRouterRouteRegistration {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('operator_router_registration_invalid');
  if (!ALLOWED_ROUTE_CLASSES.has(input.route_class)) throw new Error('operator_router_route_class_invalid');
  if (typeof input.route_id !== 'string' || typeof input.public_path !== 'string' || typeof input.owner_id !== 'string') throw new Error('operator_router_registration_identity_invalid');
  const backendKind = input.backend_kind ?? 'http';
  if (backendKind !== 'http' && backendKind !== 'nars-artifact') throw new Error('operator_router_backend_kind_invalid');
  if ((input.route_class === 'nars-artifact') !== (backendKind === 'nars-artifact')) {
    throw new Error('operator_router_route_class_backend_mismatch');
  }
  const publicPath = normalizePublicPath(input.public_path);
  const routeMode = input.route_mode ?? 'prefix';
  if (routeMode !== 'prefix' && routeMode !== 'exact') throw new Error('operator_router_route_mode_invalid');
  const targetUrl = input.target_url ?? null;
  const websocketTargetUrl = input.websocket_target_url ?? null;
  if (targetUrl !== null && typeof targetUrl !== 'string') throw new Error('operator_router_target_url_invalid');
  if (websocketTargetUrl !== null && typeof websocketTargetUrl !== 'string') throw new Error('operator_router_websocket_target_invalid');
  if (input.health_url !== null && input.health_url !== undefined && typeof input.health_url !== 'string') throw new Error('operator_router_health_target_invalid');
  if (targetUrl && !isLoopbackUrl(targetUrl, ['http:', 'https:'])) throw new Error('operator_router_target_not_loopback');
  if (websocketTargetUrl && !isLoopbackUrl(websocketTargetUrl, ['ws:', 'wss:'])) throw new Error('operator_router_websocket_target_not_loopback');
  if (input.health_url && !isLoopbackUrl(input.health_url, ['http:', 'https:'])) throw new Error('operator_router_health_target_not_loopback');
  const protocols = normalizeProtocols(input.protocols);
  const methods = normalizeMethods(input.methods);
  if (protocols.includes('http') && backendKind === 'http' && !targetUrl) throw new Error('operator_router_target_url_required');
  if (protocols.includes('websocket') && !websocketTargetUrl) throw new Error('operator_router_websocket_target_required');
  if (backendKind === 'nars-artifact' && (protocols.length !== 1 || !protocols.includes('http'))) throw new Error('operator_router_artifact_protocol_invalid');
  const reconstruction = validateReconstruction(input.reconstruction);
  if (backendKind === 'nars-artifact' && (!reconstruction || reconstruction.kind !== 'nars-session')) {
    throw new Error('operator_router_artifact_reconstruction_required');
  }
  if (input.route_class === 'site-operations' && (!reconstruction || reconstruction.kind !== 'site-operation')) {
    throw new Error('operator_router_site_operation_reconstruction_required');
  }
  const siteId = normalizeNullableString(input.site_id, 'operator_router_site_id_invalid');
  const sessionId = normalizeNullableString(input.session_id, 'operator_router_session_id_invalid');
  if (input.route_class === 'agent-web-ui' && !sessionId) throw new Error('operator_router_agent_session_identity_required');
  if (input.route_class === 'site-operations' && !siteId) throw new Error('operator_router_site_identity_required');
  if (backendKind === 'nars-artifact' && !sessionId) throw new Error('operator_router_artifact_session_identity_required');
  if (reconstruction && reconstruction.site_id !== null && siteId !== reconstruction.site_id) {
    throw new Error('operator_router_site_identity_mismatch');
  }
  if (reconstruction && reconstruction.session_id !== null && sessionId !== reconstruction.session_id) {
    throw new Error('operator_router_session_identity_mismatch');
  }
  const leaseMs = normalizeLeaseMs(input.lease_ms);
  const websocketLiveness = normalizeWebSocketLiveness(input.websocket_liveness);
  const expires = new Date(now.getTime() + leaseMs).toISOString();
  const ownerId = input.owner_id.trim();
  if (!ownerId) throw new Error('operator_router_owner_required');
  return {
    schema: OPERATOR_ROUTER_REGISTRATION_SCHEMA,
    route_id: normalizeRouteId(input.route_id),
    route_class: input.route_class,
    backend_kind: backendKind,
    public_path: publicPath,
    route_mode: routeMode,
    target_url: targetUrl,
    websocket_target_url: websocketTargetUrl,
    health_url: input.health_url ?? null,
    owner_id: ownerId,
    site_id: siteId,
    session_id: sessionId,
    process_evidence: validateProcessEvidence(input.process_evidence),
    protocols,
    methods,
    max_body_bytes: normalizeBodyBytes(input.max_body_bytes),
    timeout_ms: normalizeTimeoutMs(input.timeout_ms),
    websocket_liveness: websocketLiveness,
    lease_ms: leaseMs,
    lease_expires_at: expires,
    state: 'healthy',
    last_health_at: null,
    last_health_error: null,
    reconstruction,
  };
}

export function projectRouteRegistration(route: OperatorRouterRouteRegistration): OperatorRouterRouteProjection {
  return {
    route_id: route.route_id,
    route_class: route.route_class,
    backend_kind: route.backend_kind,
    public_path: route.public_path,
    route_mode: route.route_mode,
    owner_id: route.owner_id,
    site_id: route.site_id,
    session_id: route.session_id,
    protocols: route.protocols,
    methods: route.methods,
    state: route.state,
    lease_expires_at: route.lease_expires_at,
    last_health_at: route.last_health_at,
    last_health_error: route.last_health_error,
  };
}
