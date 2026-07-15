import {
  operatorSurfaceDescriptors,
  projectOperatorWorkspaceRouteDirectory,
  type OperatorSurfaceAvailability,
  type OperatorSurfaceHostRef,
  type OperatorSurfaceId,
  type OperatorSurfaceRouteDescriptor,
  type OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';

export const CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_STATE_SCHEMA = 'narada.cloudflare_nars_workspace.directory_state.v1' as const;
export const CLOUDFLARE_NARS_WORKSPACE_ROUTE_LEASE_SCHEMA = 'narada.cloudflare_nars_workspace.route_lease.v1' as const;
export const CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_HEALTH_SCHEMA = 'narada.cloudflare_nars_workspace.directory_health.v1' as const;

export type CloudflareNarsWorkspaceRouteLeaseStatus = 'active' | 'unavailable' | 'expired';
export type CloudflareNarsWorkspaceRouteHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface CloudflareNarsWorkspaceUiConfig {
  cloudflare_projection_id?: string;
  cloudflare_api_base_url?: string;
  cloudflare_browser_token?: string;
  cloudflare_authority_session_id?: string;
  workspace_route_directory?: {
    endpoint: string;
    projection_id: string;
    browser_token: string;
  };
  [key: string]: unknown;
}

function normalizeRoutePath(path: string): string {
  const value = String(path ?? '').split('?')[0].trim();
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

export interface CloudflareNarsWorkspaceRouteLease {
  schema: typeof CLOUDFLARE_NARS_WORKSPACE_ROUTE_LEASE_SCHEMA;
  lease_id: string;
  projection_id: string;
  surface_id: OperatorSurfaceId;
  route: OperatorSurfaceRouteDescriptor;
  authority_host: OperatorSurfaceHostRef;
  registered_at: string;
  expires_at: string | null;
  status: CloudflareNarsWorkspaceRouteLeaseStatus;
  health_status: CloudflareNarsWorkspaceRouteHealthStatus;
  last_health_at: string | null;
  ui_config: CloudflareNarsWorkspaceUiConfig | null;
}

export interface CloudflareNarsWorkspaceRouteRegistration {
  schema?: typeof CLOUDFLARE_NARS_WORKSPACE_ROUTE_LEASE_SCHEMA;
  lease_id: string;
  projection_id: string;
  surface_id: OperatorSurfaceId;
  route: OperatorSurfaceRouteDescriptor;
  authority_host?: OperatorSurfaceHostRef | null;
  expires_at?: string | null;
  ui_config?: CloudflareNarsWorkspaceUiConfig | null;
}

export interface CloudflareNarsWorkspaceDirectoryState {
  schema: typeof CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_STATE_SCHEMA;
  leases: CloudflareNarsWorkspaceRouteLease[];
}

export interface CloudflareNarsWorkspaceDirectoryHealth {
  schema: typeof CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_HEALTH_SCHEMA;
  status: 'healthy' | 'degraded';
  lease_count: number;
  active_lease_count: number;
  unavailable_lease_count: number;
  generated_at: string;
}

export interface CloudflareNarsWorkspaceDirectoryService {
  register(input: CloudflareNarsWorkspaceRouteRegistration, now: string): { status: 'registered' | 'refused'; code?: string; lease?: CloudflareNarsWorkspaceRouteLease };
  updateHealth(input: { lease_id: string; health_status: CloudflareNarsWorkspaceRouteHealthStatus }, now: string): { status: 'updated' | 'refused'; code?: string; lease?: CloudflareNarsWorkspaceRouteLease };
  revoke(leaseId: string): { status: 'revoked' | 'refused'; code?: string; lease?: CloudflareNarsWorkspaceRouteLease };
  projectDirectory(input: { workspace_host: OperatorSurfaceHostRef; projection_id?: string | null; now: string }): OperatorWorkspaceRouteDirectory;
  findByPath(path: string, now: string): CloudflareNarsWorkspaceRouteLease | null;
  health(now: string): CloudflareNarsWorkspaceDirectoryHealth;
  snapshot(): CloudflareNarsWorkspaceDirectoryState;
}

export function createCloudflareNarsWorkspaceDirectoryService(input: {
  initial_state?: CloudflareNarsWorkspaceDirectoryState | null;
} = {}): CloudflareNarsWorkspaceDirectoryService {
  const leases = new Map<string, CloudflareNarsWorkspaceRouteLease>();
  for (const lease of input.initial_state?.leases ?? []) {
    if (lease?.lease_id) leases.set(lease.lease_id, lease);
  }
  function visibleLeases(projectionId: string | null | undefined, now: string): CloudflareNarsWorkspaceRouteLease[] {
    return [...leases.values()]
      .filter((lease) => !projectionId || lease.projection_id === projectionId)
      .map((lease) => effectiveLease(lease, now));
  }

  return {
    register(registration, now) {
      const validation = validateRegistration(registration);
      if (validation) return { status: 'refused', code: validation };
      const existingRoute = [...leases.values()].find((lease) =>
        lease.lease_id !== registration.lease_id
        && lease.surface_id === registration.surface_id
        && lease.route.id === registration.route.id,
      );
      if (existingRoute) return { status: 'refused', code: 'workspace_route_already_leased' };
      const existing = leases.get(registration.lease_id);
      const lease: CloudflareNarsWorkspaceRouteLease = {
        schema: CLOUDFLARE_NARS_WORKSPACE_ROUTE_LEASE_SCHEMA,
        lease_id: registration.lease_id,
        projection_id: registration.projection_id,
        surface_id: registration.surface_id,
        route: structuredClone(registration.route),
        authority_host: registration.authority_host ?? { kind: 'cloudflare', id: 'worker', origin: null },
        registered_at: existing?.registered_at ?? now,
        expires_at: registration.expires_at ?? null,
        status: 'active',
        health_status: 'healthy',
        last_health_at: now,
        ui_config: registration.ui_config ?? null,
      };
      leases.set(lease.lease_id, lease);
      return { status: 'registered', lease };
    },

    findByPath(path, now) {
      const normalized = normalizeRoutePath(path);
      const lease = [...leases.values()].find((candidate) => normalizeRoutePath(candidate.route.path) === normalized);
      return lease ? effectiveLease(lease, now) : null;
    },

    updateHealth(input, now) {
      const lease = leases.get(input.lease_id);
      if (!lease) return { status: 'refused', code: 'workspace_route_lease_not_found' };
      const updated = { ...lease, health_status: input.health_status, last_health_at: now };
      leases.set(input.lease_id, updated);
      return { status: 'updated', lease: effectiveLease(updated, now) };
    },

    revoke(leaseId) {
      const lease = leases.get(leaseId);
      if (!lease) return { status: 'refused', code: 'workspace_route_lease_not_found' };
      leases.delete(leaseId);
      return { status: 'revoked', lease };
    },

    projectDirectory(args) {
      const selected = visibleLeases(args.projection_id, args.now);
      const availability: Partial<Record<OperatorSurfaceId, OperatorSurfaceAvailability>> = {};
      const routeAvailability: Partial<Record<OperatorSurfaceId, Partial<Record<string, OperatorSurfaceAvailability>>>> = {};
      const additionalRoutes: Partial<Record<OperatorSurfaceId, readonly OperatorSurfaceRouteDescriptor[]>> = {};
      const authorityHost: Partial<Record<OperatorSurfaceId, OperatorSurfaceHostRef>> = {};

      for (const descriptor of operatorSurfaceDescriptors) {
        availability[descriptor.id] = 'unavailable';
        routeAvailability[descriptor.id] = Object.fromEntries(descriptor.routes.map((route) => [route.id, 'unavailable'])) as Partial<Record<string, OperatorSurfaceAvailability>>;
      }
      for (const lease of selected) {
        availability[lease.surface_id] = 'available';
        routeAvailability[lease.surface_id] = {
          ...(routeAvailability[lease.surface_id] ?? {}),
          [lease.route.id]: lease.status === 'active' && lease.health_status !== 'unhealthy' ? 'available' : 'unavailable',
        };
        additionalRoutes[lease.surface_id] = [...(additionalRoutes[lease.surface_id] ?? []), lease.route];
        authorityHost[lease.surface_id] = lease.authority_host;
      }
      return projectOperatorWorkspaceRouteDirectory({
        workspaceHost: args.workspace_host,
        authorityHost,
        availability,
        routeAvailability,
        additionalRoutes,
      });
    },

    health(now) {
      const selected = visibleLeases(null, now);
      const unavailable = selected.filter((lease) => lease.status !== 'active' || lease.health_status === 'unhealthy').length;
      return {
        schema: CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_HEALTH_SCHEMA,
        status: unavailable > 0 ? 'degraded' : 'healthy',
        lease_count: selected.length,
        active_lease_count: selected.length - unavailable,
        unavailable_lease_count: unavailable,
        generated_at: now,
      };
    },

    snapshot() {
      return {
        schema: CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_STATE_SCHEMA,
        leases: [...leases.values()].map((lease) => structuredClone(lease)),
      };
    },
  };
}

export async function handleCloudflareNarsWorkspaceDirectoryRequest(
  request: Request,
  service: CloudflareNarsWorkspaceDirectoryService,
  now: () => string,
): Promise<Response> {
  const url = new URL(request.url);
  const path = trimPath(url.pathname);
  if (request.method === 'GET' && path === 'internal/workspace/route') {
    const lease = service.findByPath(url.searchParams.get('path') ?? '', now());
    return json({ status: 'ok', lease });
  }
  if (request.method === 'GET' && path === 'api/nars/workspace/routes') {
    return json(service.projectDirectory({
      workspace_host: { kind: 'cloudflare', id: 'worker', origin: url.origin },
      projection_id: url.searchParams.get('projection_id'),
      now: now(),
    }));
  }
  if (request.method === 'GET' && path === 'api/nars/workspace/health') return json(service.health(now()));
  if (request.method === 'POST' && path === 'api/nars/workspace/routes/register') {
    const body = objectRecord(await request.json().catch(() => ({})));
    const result = service.register(body as unknown as CloudflareNarsWorkspaceRouteRegistration, now());
    return json(result, result.status === 'registered' ? 200 : 409);
  }
  if (request.method === 'POST' && path === 'api/nars/workspace/routes/health') {
    const body = objectRecord(await request.json().catch(() => ({}))) ?? {};
    const result = service.updateHealth({ lease_id: String(body.lease_id ?? ''), health_status: body.health_status === 'unhealthy' ? 'unhealthy' : body.health_status === 'unknown' ? 'unknown' : 'healthy' }, now());
    return json(result, result.status === 'updated' ? 200 : 404);
  }
  if (request.method === 'POST' && path === 'api/nars/workspace/routes/revoke') {
    const body = objectRecord(await request.json().catch(() => ({}))) ?? {};
    const result = service.revoke(String(body.lease_id ?? ''));
    return json(result, result.status === 'revoked' ? 200 : 404);
  }
  return json({ status: 'refused', code: 'workspace_route_not_found' }, 404);
}

export interface DurableObjectStateLike {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined> | T | undefined;
    put(key: string, value: unknown): Promise<void> | void;
  };
}

export class NarsWorkspaceDirectory {
  static readonly storageKey = CLOUDFLARE_NARS_WORKSPACE_DIRECTORY_STATE_SCHEMA;

  constructor(private readonly state?: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const stored = await this.state?.storage.get<CloudflareNarsWorkspaceDirectoryState>(NarsWorkspaceDirectory.storageKey);
    const service = createCloudflareNarsWorkspaceDirectoryService({ initial_state: stored ?? null });
    const response = await handleCloudflareNarsWorkspaceDirectoryRequest(request, service, () => new Date().toISOString());
    if (this.state?.storage && request.method === 'POST' && response.status < 500) {
      await this.state.storage.put(NarsWorkspaceDirectory.storageKey, service.snapshot());
    }
    return response;
  }
}

function effectiveLease(lease: CloudflareNarsWorkspaceRouteLease, now: string): CloudflareNarsWorkspaceRouteLease {
  if (lease.status === 'active' && lease.expires_at && lease.expires_at <= now) return { ...lease, status: 'expired' };
  if (lease.status === 'active' && lease.health_status === 'unhealthy') return { ...lease, status: 'unavailable' };
  return lease;
}

function validateRegistration(input: CloudflareNarsWorkspaceRouteRegistration): string | null {
  if (!input || typeof input !== 'object') return 'workspace_route_registration_required';
  if (!nonEmpty(input.lease_id) || !nonEmpty(input.projection_id)) return 'workspace_route_lease_identity_required';
  if (!operatorSurfaceDescriptors.some((descriptor) => descriptor.id === input.surface_id)) return 'workspace_route_surface_unknown';
  if (!input.route || !nonEmpty(input.route.id) || !input.route.path.startsWith('/')) return 'workspace_route_descriptor_invalid';
  if (input.expires_at && !Number.isFinite(Date.parse(input.expires_at))) return 'workspace_route_expiry_invalid';
  if (input.authority_host && (!nonEmpty(input.authority_host.id) || !['local', 'cloudflare'].includes(input.authority_host.kind))) return 'workspace_route_authority_host_invalid';
  return null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimPath(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '');
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-narada-browser-token-fingerprint,x-narada-bridge-token-fingerprint',
    },
  });
}
