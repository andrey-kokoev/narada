import { provide, inject, ref, type InjectionKey, type Ref } from 'vue';
import {
  OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA,
  type OperatorSurfaceAvailability,
  type OperatorSurfaceAuthorityKind,
  type OperatorSurfaceHostKind,
  type OperatorSurfaceId,
  type OperatorSurfaceIntentKind,
  type OperatorSurfaceIntentEndpointBase,
  type OperatorSurfaceIntentProtocol,
  type OperatorSurfaceNavigationKey,
  type OperatorSurfaceProjectionKind,
  type OperatorSurfaceRouteKind,
  type OperatorSurfaceRouteDescriptor,
  type OperatorSurfaceRouteProjection,
  type OperatorSurfaceRouteTarget,
  type OperatorSurfaceProjection,
  type OperatorSurfaceScope,
  type OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';

export type OperatorWorkspaceRouteDirectoryFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface OperatorWorkspaceRouteDirectoryTransport {
  read(): Promise<OperatorWorkspaceRouteDirectory>;
}

export interface OperatorWorkspaceRouteDirectoryRequestOptions {
  projectionId?: string | null;
  browserToken?: string | null;
}

function isAuthorityKind(value: unknown): value is OperatorSurfaceAuthorityKind {
  return value === 'user-site'
    || value === 'operator-console'
    || value === 'site'
    || value === 'nars-session-index'
    || value === 'nars-session'
    || value === 'artifact';
}

function isProjectionKind(value: unknown): value is OperatorSurfaceProjectionKind {
  return value === 'workspace'
    || value === 'registry'
    || value === 'launcher'
    || value === 'site-operations'
    || value === 'session-inventory'
    || value === 'agent-session'
    || value === 'artifact'
    || value === 'diagnostic';
}

function isIntentKind(value: unknown): value is OperatorSurfaceIntentKind {
  return value === 'none'
    || value === 'registry-workflow'
    || value === 'launcher-control'
    || value === 'site-control'
    || value === 'session-input'
    || value === 'artifact-open';
}

function isIntentProtocol(value: unknown): value is OperatorSurfaceIntentProtocol {
  return value === 'http' || value === 'websocket' || value === 'mcp';
}

function isHostKind(value: unknown): value is OperatorSurfaceHostKind {
  return value === 'local' || value === 'cloudflare';
}

function isEndpointBase(value: unknown): value is OperatorSurfaceIntentEndpointBase {
  return value === 'workspace' || value === 'authority';
}

function parseAuthority(value: unknown): { kind: OperatorSurfaceAuthorityKind; id: string | null } | null {
  if (!isRecord(value) || !isAuthorityKind(value.kind) || (value.id !== null && !isString(value.id))) return null;
  return { kind: value.kind, id: value.id ?? null };
}

function parseHost(value: unknown): { kind: OperatorSurfaceHostKind; id: string; origin: string | null } | null {
  if (!isRecord(value)
    || !isHostKind(value.kind)
    || !isString(value.id)
    || value.id.length === 0
    || (value.origin !== null && !isString(value.origin))) return null;
  return { kind: value.kind, id: value.id, origin: value.origin ?? null };
}

function parseProjection(value: unknown): { kind: OperatorSurfaceProjectionKind; owner: string } | null {
  if (!isRecord(value) || !isProjectionKind(value.kind) || !isString(value.owner) || value.owner.length === 0) return null;
  return { kind: value.kind, owner: value.owner };
}

function parseIntent(value: unknown): { kind: OperatorSurfaceIntentKind; endpoint: string | null; endpointBase: OperatorSurfaceIntentEndpointBase | null; protocols: OperatorSurfaceIntentProtocol[] } | null {
  if (!isRecord(value)
    || !isIntentKind(value.kind)
    || (value.endpoint !== null && !isString(value.endpoint))
    || (value.endpointBase !== null && !isEndpointBase(value.endpointBase))
    || !Array.isArray(value.protocols)
    || value.protocols.some((protocol) => !isIntentProtocol(protocol))) return null;
  return { kind: value.kind, endpoint: value.endpoint ?? null, endpointBase: value.endpointBase ?? null, protocols: value.protocols };
}

export class OperatorWorkspaceRouteDirectoryError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'OperatorWorkspaceRouteDirectoryError';
    this.code = code;
    this.status = status;
  }
}

export interface OperatorWorkspaceRouteDirectoryState {
  directory: Ref<OperatorWorkspaceRouteDirectory | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: () => Promise<void>;
}

const routeDirectoryKey: InjectionKey<OperatorWorkspaceRouteDirectoryState> = Symbol('operator-workspace-route-directory');

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSurfaceId(value: unknown): value is OperatorSurfaceId {
  return value === 'site-registry'
    || value === 'launcher'
    || value === 'site-operations'
    || value === 'agent-sessions'
    || value === 'artifacts';
}

function isAvailability(value: unknown): value is OperatorSurfaceAvailability {
  return value === 'available' || value === 'unavailable' || value === 'planned';
}

function isRouteKind(value: unknown): value is OperatorSurfaceRouteKind {
  return value === 'page' || value === 'workflow';
}

function isTargetKind(value: unknown): value is OperatorSurfaceRouteTarget['kind'] {
  return value === 'site' || value === 'session' || value === 'artifact';
}

function isNavigationKey(value: unknown): value is OperatorSurfaceNavigationKey {
  return value === 'sites' || value === 'add' || value === 'manage' || value === 'launcher' || value === 'sessions';
}

function isScope(value: unknown): value is OperatorSurfaceScope {
  return value === 'user-site' || value === 'operator-console' || value === 'local-site' || value === 'nars-session';
}

function parseTarget(value: unknown): OperatorSurfaceRouteTarget | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isTargetKind(value.kind) || !isString(value.id) || value.id.length === 0) {
    return null;
  }
  return { kind: value.kind, id: value.id };
}

function parseRouteDescriptor(value: unknown): OperatorSurfaceRouteDescriptor | null {
  if (!isRecord(value)
    || !isString(value.id)
    || !isString(value.path)
    || !isRouteKind(value.kind)
    || !isString(value.label)) {
    return null;
  }
  const target = parseTarget(value.target);
  if (target === null || (value.navigationKey !== undefined && !isNavigationKey(value.navigationKey))) return null;
  return {
    id: value.id,
    path: value.path,
    kind: value.kind,
    label: value.label,
    ...(value.navigationKey === undefined ? {} : { navigationKey: value.navigationKey }),
    ...(target === undefined ? {} : { target }),
  };
}

function parseRouteProjection(value: unknown): OperatorSurfaceRouteProjection | null {
  if (!isRecord(value)
    || !isAvailability(value.availability)
    || !isString(value.projectedDetail)
    || typeof value.diagnosticOnly !== 'boolean') return null;
  const descriptor = parseRouteDescriptor(value);
  if (!descriptor) return null;
  const authority = parseAuthority(value.authority);
  const authorityHost = parseHost(value.authorityHost);
  const projection = parseProjection(value.projection);
  const intent = parseIntent(value.intent);
  if (!authority || !authorityHost || !projection || !intent || (value.legacyReplacement !== undefined && !isString(value.legacyReplacement))) return null;
  return {
    ...descriptor,
    availability: value.availability,
    projectedDetail: value.projectedDetail,
    authority,
    authorityHost,
    projection,
    intent,
    diagnosticOnly: value.diagnosticOnly,
    ...(value.legacyReplacement === undefined ? {} : { legacyReplacement: value.legacyReplacement }),
  };
}

function parseSurface(value: unknown): OperatorSurfaceProjection | null {
  if (!isRecord(value)
    || value.schema !== OPERATOR_SURFACE_DESCRIPTOR_SCHEMA
    || !isSurfaceId(value.id)
    || !isString(value.name)
    || !isScope(value.scope)
    || !isString(value.owner)
    || typeof value.diagnosticOnly !== 'boolean'
    || (value.defaultAvailability !== 'available' && value.defaultAvailability !== 'planned')
    || !isAvailability(value.availability)
    || !isString(value.projectedDetail)
    || !isRecord(value.detail)
    || !isString(value.detail.available)
    || !isString(value.detail.unavailable)
    || !isString(value.detail.planned)
    || !Array.isArray(value.routes)
    || !Array.isArray(value.projectedRoutes)) {
    return null;
  }
  const routes = value.routes.map(parseRouteDescriptor);
  const projectedRoutes = value.projectedRoutes.map(parseRouteProjection);
  const authority = parseAuthority(value.authority);
  const authorityHost = parseHost(value.authorityHost);
  const projection = parseProjection(value.projection);
  const intent = parseIntent(value.intent);
  if (routes.some((route) => route === null)
    || projectedRoutes.some((route) => route === null)
    || !authority
    || !authorityHost
    || !projection
    || !intent
    || (value.legacyReplacement !== undefined && !isString(value.legacyReplacement))) return null;
  const routeIds = new Set<string>();
  const parsedRoutes = routes.filter((route): route is OperatorSurfaceRouteDescriptor => route !== null);
  const parsedProjectedRoutes = projectedRoutes.filter((route): route is OperatorSurfaceRouteProjection => route !== null);
  for (const route of parsedRoutes) {
    if (routeIds.has(route.id)) return null;
    routeIds.add(route.id);
  }
  for (const route of parsedProjectedRoutes) {
    if (!routeIds.has(route.id)) return null;
  }
  const nextAction = value.nextAction === undefined
    ? undefined
    : isRecord(value.nextAction) && isString(value.nextAction.href) && isString(value.nextAction.label)
      ? { href: value.nextAction.href, label: value.nextAction.label }
      : null;
  if (nextAction === null) return null;
  return {
    schema: value.schema,
    id: value.id,
    name: value.name,
    scope: value.scope,
    owner: value.owner,
    authority,
    authorityHost,
    projection,
    intent,
    diagnosticOnly: value.diagnosticOnly,
    ...(value.legacyReplacement === undefined ? {} : { legacyReplacement: value.legacyReplacement }),
    routes: parsedRoutes,
    defaultAvailability: value.defaultAvailability,
    detail: {
      available: value.detail.available,
      unavailable: value.detail.unavailable,
      planned: value.detail.planned,
    },
    availability: value.availability,
    projectedDetail: value.projectedDetail,
    projectedRoutes: parsedProjectedRoutes,
    ...(nextAction === undefined ? {} : { nextAction }),
  };
}

export function parseOperatorWorkspaceRouteDirectory(value: unknown): OperatorWorkspaceRouteDirectory | null {
  if (!isRecord(value)
    || value.schema !== OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA
    || !parseHost(value.workspaceHost)
    || !Array.isArray(value.surfaces)) {
    return null;
  }
  const surfaces = value.surfaces.map(parseSurface);
  if (surfaces.some((surface) => surface === null)) return null;
  const surfaceIds = new Set<string>();
  const parsedSurfaces = surfaces.filter((surface): surface is OperatorSurfaceProjection => surface !== null);
  for (const surface of parsedSurfaces) {
    if (surfaceIds.has(surface.id)) return null;
    surfaceIds.add(surface.id);
  }
  return { schema: OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA, workspaceHost: parseHost(value.workspaceHost)!, surfaces: parsedSurfaces };
}

export function createOperatorWorkspaceRouteDirectoryTransport(
  path: string = OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH,
  fetchLike: OperatorWorkspaceRouteDirectoryFetch = (input, init) => fetch(input, init),
  requestOptions: OperatorWorkspaceRouteDirectoryRequestOptions = {},
): OperatorWorkspaceRouteDirectoryTransport {
  return {
    async read(): Promise<OperatorWorkspaceRouteDirectory> {
      const requestUrl = new URL(path, 'http://narada.local');
      if (requestOptions.projectionId) requestUrl.searchParams.set('projection_id', requestOptions.projectionId);
      const input = /^https?:\/\//i.test(path)
        ? requestUrl.toString()
        : `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
      const headers = new Headers({ Accept: 'application/json' });
      if (requestOptions.browserToken) headers.set('x-narada-browser-token-fingerprint', requestOptions.browserToken);
      const response = await fetchLike(input, { headers });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OperatorWorkspaceRouteDirectoryError(
          'invalid_json',
          `Operator route directory returned HTTP ${response.status} without valid JSON.`,
          response.status,
        );
      }
      if (!response.ok) {
        throw new OperatorWorkspaceRouteDirectoryError(
          'http_error',
          `Operator route directory failed with HTTP ${response.status}.`,
          response.status,
        );
      }
      const directory = parseOperatorWorkspaceRouteDirectory(payload);
      if (!directory) {
        throw new OperatorWorkspaceRouteDirectoryError(
          'invalid_response',
          'Operator route directory did not match its contract.',
          response.status,
        );
      }
      return directory;
    },
  };
}

export function createOperatorWorkspaceRouteDirectoryState(
  transport: OperatorWorkspaceRouteDirectoryTransport = createOperatorWorkspaceRouteDirectoryTransport(),
): OperatorWorkspaceRouteDirectoryState {
  const directory = ref<OperatorWorkspaceRouteDirectory | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      directory.value = await transport.read();
    } catch (cause) {
      directory.value = null;
      error.value = cause instanceof Error ? cause.message : 'Operator route directory is unavailable.';
    } finally {
      loading.value = false;
    }
  }

  return { directory, loading, error, load };
}

export function provideOperatorWorkspaceRouteDirectory(
  state: OperatorWorkspaceRouteDirectoryState,
): void {
  provide(routeDirectoryKey, state);
}

export function useOperatorWorkspaceRouteDirectory(): OperatorWorkspaceRouteDirectoryState | null {
  return inject(routeDirectoryKey, null);
}
