export const OPERATOR_SURFACE_DESCRIPTOR_SCHEMA = 'narada.operator.surface_descriptor.v3' as const;
export const OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA = 'narada.operator_workspace.route_directory.v3' as const;
export const OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH = '/console/routes' as const;
export const OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;

export type OperatorSurfaceId =
  | 'site-registry'
  | 'launcher'
  | 'site-operations'
  | 'agent-sessions'
  | 'artifacts';

export type OperatorSurfaceScope =
  | 'user-site'
  | 'operator-console'
  | 'local-site'
  | 'nars-session';

export type OperatorSurfaceAuthorityKind =
  | 'user-site'
  | 'operator-console'
  | 'site'
  | 'nars-session-index'
  | 'nars-session'
  | 'artifact';

export interface OperatorSurfaceAuthorityRef {
  kind: OperatorSurfaceAuthorityKind;
  id: string | null;
}

export type OperatorSurfaceHostKind = 'local' | 'cloudflare';

export interface OperatorSurfaceHostRef {
  kind: OperatorSurfaceHostKind;
  id: string;
  origin: string | null;
}

export type OperatorSurfaceProjectionKind =
  | 'workspace'
  | 'registry'
  | 'launcher'
  | 'site-operations'
  | 'session-inventory'
  | 'agent-session'
  | 'artifact'
  | 'diagnostic';

export interface OperatorSurfaceProjectionBinding {
  kind: OperatorSurfaceProjectionKind;
  owner: string;
}

export type OperatorSurfaceIntentKind =
  | 'none'
  | 'registry-workflow'
  | 'launcher-control'
  | 'site-control'
  | 'session-input'
  | 'artifact-open';

export type OperatorSurfaceIntentProtocol = 'http' | 'websocket' | 'mcp';

export type OperatorSurfaceIntentEndpointBase = 'workspace' | 'authority';

export interface OperatorSurfaceIntentBinding {
  kind: OperatorSurfaceIntentKind;
  endpoint: string | null;
  endpointBase: OperatorSurfaceIntentEndpointBase | null;
  protocols: readonly OperatorSurfaceIntentProtocol[];
}

export type OperatorSurfaceAvailability = 'available' | 'unavailable' | 'planned';

export type OperatorSurfaceRouteKind = 'page' | 'workflow';

export type OperatorSurfaceNavigationKey = 'sites' | 'add' | 'manage' | 'launcher' | 'sessions';

export interface OperatorSurfaceNavigationItem {
  key: OperatorSurfaceNavigationKey;
  label: string;
  href: string;
}

function projectedRouteDetail(availability: OperatorSurfaceAvailability): string {
  if (availability === 'available') return 'Route is available from this host.';
  if (availability === 'unavailable') return 'Route is not currently reachable from this host.';
  return 'Route is declared but not currently available from this host.';
}

export type OperatorSessionDisplayState =
  | 'active'
  | 'starting_or_degraded'
  | 'closed'
  | 'stale'
  | 'historical';

export interface OperatorSurfaceRouteDescriptor {
  id: string;
  path: string;
  kind: OperatorSurfaceRouteKind;
  label: string;
  navigationKey?: OperatorSurfaceNavigationKey;
  target?: OperatorSurfaceRouteTarget;
}

export type OperatorSurfaceRouteTargetKind = 'site' | 'session' | 'artifact';

export interface OperatorSurfaceRouteTarget {
  kind: OperatorSurfaceRouteTargetKind;
  id: string;
}

export interface OperatorSurfaceRouteProjection extends OperatorSurfaceRouteDescriptor {
  availability: OperatorSurfaceAvailability;
  projectedDetail: string;
  authority: OperatorSurfaceAuthorityRef;
  authorityHost: OperatorSurfaceHostRef;
  projection: OperatorSurfaceProjectionBinding;
  intent: OperatorSurfaceIntentBinding;
  diagnosticOnly: boolean;
  legacyReplacement?: string;
}

export interface OperatorSessionWireRecord {
  session_id: string;
  site_id: string | null;
  agent_id: string | null;
  runtime_kind: string | null;
  launch_operator_surface_kind: string | null;
  started_at: string | null;
  last_seen_at: string | null;
  terminal_state: string | null;
  display_state: OperatorSessionDisplayState;
  display_state_reason: string;
  heartbeat_fresh: boolean;
  heartbeat_age_ms: number | null;
  health_status: string;
}

export interface OperatorSessionListWireResponse {
  schema: 'narada.operator_console.agent_sessions.v1';
  status: 'success' | 'refused';
  generated_at: string;
  count: number;
  sessions: OperatorSessionWireRecord[];
  refusals: string[];
}

export interface OperatorSurfaceAvailabilityDetail {
  available: string;
  unavailable: string;
  planned: string;
}

export interface OperatorSurfaceAction {
  href: string;
  label: string;
}

export interface OperatorSurfaceDescriptor {
  schema: typeof OPERATOR_SURFACE_DESCRIPTOR_SCHEMA;
  id: OperatorSurfaceId;
  name: string;
  scope: OperatorSurfaceScope;
  owner: string;
  authority: OperatorSurfaceAuthorityRef;
  authorityHost: OperatorSurfaceHostRef;
  projection: OperatorSurfaceProjectionBinding;
  intent: OperatorSurfaceIntentBinding;
  diagnosticOnly: boolean;
  legacyReplacement?: string;
  routes: readonly OperatorSurfaceRouteDescriptor[];
  defaultAvailability: 'available' | 'planned';
  detail: OperatorSurfaceAvailabilityDetail;
  nextAction?: OperatorSurfaceAction;
}

export interface OperatorSurfaceProjection extends OperatorSurfaceDescriptor {
  availability: OperatorSurfaceAvailability;
  projectedDetail: string;
  projectedRoutes: readonly OperatorSurfaceRouteProjection[];
}

export type OperatorSurfaceAvailabilityOverrides = Partial<
  Record<OperatorSurfaceId, OperatorSurfaceAvailability>
>;

export type OperatorSurfaceRouteAvailabilityOverrides = Partial<
  Record<OperatorSurfaceId, Partial<Record<string, OperatorSurfaceAvailability>>>
>;

export type OperatorSurfaceAdditionalRouteOverrides = Partial<
  Record<OperatorSurfaceId, readonly OperatorSurfaceRouteDescriptor[]>
>;

export interface OperatorSurfaceCatalogProjectionInput {
  workspaceHost?: OperatorSurfaceHostRef;
  authorityHost?: Partial<Record<OperatorSurfaceId, OperatorSurfaceHostRef>>;
  availability?: OperatorSurfaceAvailabilityOverrides;
  routeAvailability?: OperatorSurfaceRouteAvailabilityOverrides;
  additionalRoutes?: OperatorSurfaceAdditionalRouteOverrides;
}

export interface OperatorWorkspaceRouteDirectory {
  schema: typeof OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA;
  workspaceHost: OperatorSurfaceHostRef;
  surfaces: readonly OperatorSurfaceProjection[];
}

function authorityForRoute(
  surface: OperatorSurfaceDescriptor,
  route: OperatorSurfaceRouteDescriptor,
): OperatorSurfaceAuthorityRef {
  if (route.target?.kind === 'site' && surface.authority.kind === 'site') {
    return { kind: surface.authority.kind, id: route.target.id };
  }
  if (route.target?.kind === 'session' && (surface.authority.kind === 'nars-session' || surface.authority.kind === 'nars-session-index')) {
    return { kind: 'nars-session', id: route.target.id };
  }
  if (route.target?.kind === 'artifact' && surface.authority.kind === 'artifact') {
    return { kind: surface.authority.kind, id: route.target.id };
  }
  return surface.authority;
}

export function projectOperatorSurfaceRouteBinding(
  surface: OperatorSurfaceDescriptor,
  route: OperatorSurfaceRouteDescriptor,
): Pick<OperatorSurfaceRouteProjection, 'authority' | 'authorityHost' | 'projection' | 'intent' | 'diagnosticOnly' | 'legacyReplacement'> {
  return {
    authority: authorityForRoute(surface, route),
    authorityHost: surface.authorityHost,
    projection: surface.projection,
    intent: surface.intent,
    diagnosticOnly: surface.diagnosticOnly,
    ...(surface.legacyReplacement === undefined ? {} : { legacyReplacement: surface.legacyReplacement }),
  };
}

export const operatorSurfaceDescriptors: readonly OperatorSurfaceDescriptor[] = [
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'site-registry',
    name: 'Site Registry',
    scope: 'user-site',
    owner: 'Canonical Site Registry',
    authority: { kind: 'user-site', id: null },
    authorityHost: { kind: 'local', id: 'user-site', origin: null },
    projection: { kind: 'registry', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'registry-workflow', endpoint: '/console/registry', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'sites', path: '/console/registry', kind: 'page', label: 'Sites', navigationKey: 'sites' },
      { id: 'add', path: '/console/registry/add', kind: 'workflow', label: 'Add Site', navigationKey: 'add' },
      { id: 'manage', path: '/console/registry/manage', kind: 'workflow', label: 'Manage', navigationKey: 'manage' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Inspect the canonical inventory and enter governed Site workflows.',
      unavailable: 'The Site Registry projection is not available from this host.',
      planned: 'The Site Registry projection is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'launcher',
    name: 'Agent Launcher',
    scope: 'operator-console',
    owner: 'Narada CLI workspace-launch',
    authority: { kind: 'operator-console', id: '@narada2/cli' },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'launcher', owner: '@narada2/workspace-launch-ui' },
    intent: { kind: 'launcher-control', endpoint: '/console/launch', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'launcher', path: '/console/launch', kind: 'page', label: 'Launcher', navigationKey: 'launcher' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Open the router for CLI-owned launcher sessions and their browser surfaces.',
      unavailable: 'The Agent Launcher is not reachable from this host.',
      planned: 'The Agent Launcher route is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'site-operations',
    name: 'Site Operations',
    scope: 'local-site',
    owner: 'Task and Agent Operations',
    authority: { kind: 'site', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'site-operations', owner: '@narada2/cli' },
    intent: { kind: 'site-control', endpoint: '/sites/<site-id>/operations/', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'operations', path: '/sites/<site-id>/operations/', kind: 'page', label: 'Operations' },
    ],
    defaultAvailability: 'planned',
    detail: {
      available: 'Enter the selected Site\'s task, assignment, review, and agent projections.',
      unavailable: 'Site Operations are not available for the selected Site.',
      planned: 'Select a Site before entering its task, assignment, review, and agent projection.',
    },
    nextAction: { href: '/console/registry', label: 'Select a Site in Site Registry' },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'agent-sessions',
    name: 'Agent Sessions',
    scope: 'nars-session',
    owner: 'Agent Web UI',
    authority: { kind: 'nars-session-index', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'session-inventory', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'none', endpoint: null, endpointBase: null, protocols: [] },
    diagnosticOnly: false,
    routes: [
      { id: 'sessions', path: '/console/sessions', kind: 'page', label: 'Sessions', navigationKey: 'sessions' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Inspect live and historical NARS sessions from the canonical session index.',
      unavailable: 'The session projection is not reachable from this host.',
      planned: 'Available after the session index projection is registered.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'artifacts',
    name: 'Artifacts',
    scope: 'nars-session',
    owner: 'Artifact projection',
    authority: { kind: 'artifact', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'artifact', owner: '@narada2/agent-web-ui' },
    intent: { kind: 'artifact-open', endpoint: '/artifacts/<session-id>/<artifact-id>/', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'artifact', path: '/artifacts/<session-id>/<artifact-id>/', kind: 'page', label: 'Artifact' },
    ],
    defaultAvailability: 'planned',
    detail: {
      available: 'Inspect session-owned artifacts through their governed projection.',
      unavailable: 'The artifact projection is not reachable from this host.',
      planned: 'Available after session and artifact projections are registered.',
    },
  },
] as const;

function normalizedPath(path: string): string {
  const value = path.trim() || '/';
  const withoutTrailingSlash = value.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

export function projectOperatorSurfaceCatalog(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorSurfaceProjection[] {
  return operatorSurfaceDescriptors.map((descriptor) => {
    const projectedDescriptor = {
      ...descriptor,
      authorityHost: input.authorityHost?.[descriptor.id] ?? descriptor.authorityHost,
    };
    const availability = input.availability?.[descriptor.id] ?? descriptor.defaultAvailability;
    const routes = [...descriptor.routes, ...(input.additionalRoutes?.[descriptor.id] ?? [])];
    const routeIds = new Set<string>();
    const projectedRoutes = routes.map((route) => {
      if (routeIds.has(route.id)) {
        throw new Error(`operator_surface_route_duplicate:${descriptor.id}:${route.id}`);
      }
      routeIds.add(route.id);
      const routeOverride = input.routeAvailability?.[descriptor.id]?.[route.id];
      const routeAvailability = availability === 'available'
        ? routeOverride ?? 'available'
        : availability;
      return {
        ...route,
        ...projectOperatorSurfaceRouteBinding(projectedDescriptor, route),
        availability: routeAvailability,
        projectedDetail: projectedRouteDetail(routeAvailability),
      } satisfies OperatorSurfaceRouteProjection;
    });
    return {
      ...projectedDescriptor,
      routes,
      availability,
      projectedDetail: descriptor.detail[availability],
      projectedRoutes,
    };
  });
}

export function projectOperatorWorkspaceRouteDirectory(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorWorkspaceRouteDirectory {
  return {
    schema: OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA,
    workspaceHost: input.workspaceHost ?? { kind: 'local', id: 'operator-console', origin: null },
    surfaces: projectOperatorSurfaceCatalog(input),
  };
}

export function primaryOperatorSurfaceRoute(
  descriptor: OperatorSurfaceDescriptor,
): OperatorSurfaceRouteDescriptor | undefined {
  return descriptor.routes[0];
}

export function primaryProjectedOperatorSurfaceRoute(
  projection: OperatorSurfaceProjection,
): OperatorSurfaceRouteProjection | undefined {
  return projection.projectedRoutes[0];
}

export function firstAvailableConcreteProjectedOperatorSurfaceRoute(
  projection: OperatorSurfaceProjection,
): OperatorSurfaceRouteProjection | undefined {
  return projection.projectedRoutes.find((route) =>
    route.availability === 'available' && !route.path.includes('<') && !route.path.includes('>'));
}

export function operatorSurfaceRoutePath(
  surfaceId: OperatorSurfaceId,
  routeId: string,
): string {
  const descriptor = operatorSurfaceDescriptors.find((candidate) => candidate.id === surfaceId);
  const route = descriptor?.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    throw new Error(`operator_surface_route_not_declared:${surfaceId}:${routeId}`);
  }
  return route.path;
}

export function projectOperatorSurfaceNavigation(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorSurfaceNavigationItem[] {
  return projectOperatorWorkspaceRouteDirectory(input).surfaces.flatMap((surface) => {
    if (surface.availability !== 'available') return [];
    return surface.projectedRoutes.flatMap((route) => {
      if (!route.navigationKey || route.availability !== 'available') return [];
      return [{ key: route.navigationKey, label: route.label, href: route.path }];
    });
  });
}

export function findOperatorSurfaceRoute(
  path: string,
): { surface: OperatorSurfaceDescriptor; route: OperatorSurfaceRouteDescriptor } | undefined {
  const normalized = normalizedPath(path);
  for (const surface of operatorSurfaceDescriptors) {
    const route = surface.routes.find((candidate) => normalizedPath(candidate.path) === normalized);
    if (route) return { surface, route };
  }
  return undefined;
}
