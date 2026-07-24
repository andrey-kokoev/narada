/**
 * Operator Console HTTP Server
 *
 * HTTP server for browser UI consumption of cross-Site observation
 * and audited control routing.
 *
 * Uses the same Site Registry, adapter selection, and ControlRequestRouter
 * boundaries as the CLI `narada console` commands.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { openRegistry, createObservationFactory, createControlClientFactory } from '../lib/console-core.js';
import { createConsoleServerRoutes } from './console-server-routes.js';
import { createSiteRegistryReadModel, type SiteRegistryReadModel } from './site-registry-read-model.js';
import { createRegistryMutationGateway, type RegistryMutationGateway } from './site-registry-management-gateway.js';
import { renderOperatorWorkspacePage } from './operator-workspace-page.js';
import { createAgentSessionReadModel, type AgentSessionReadModel } from './agent-session-read-model.js';
import { createSiteAgentOverviewReadModel, type SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';
import { createSiteAgentLaunchGateway, type SiteAgentLaunchGateway } from './site-agent-launch-gateway.js';
import { createSiteAgentPendingTracker, type SiteAgentPendingTracker } from './site-agent-pending-tracker.js';
import { ensureLaunchArtifact, naradaProperRoot } from '../lib/launch-artifact.js';
import {
  DEFAULT_OPERATOR_ROUTER_PORT,
  readOperatorRouterRoutes,
  type OperatorRouterRouteProjection,
} from '@narada2/operator-router';
import {
  OPERATOR_CONSOLE_AGENTS_PATH,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH,
  operatorSurfaceDescriptors,
  projectOperatorWorkspaceRouteDirectory,
  type OperatorSurfaceAdditionalRouteOverrides,
  type OperatorSurfaceAvailability,
  type OperatorSurfaceAvailabilityOverrides,
  type OperatorWorkspaceRouteDirectory,
  type OperatorSurfaceId,
  type OperatorSurfaceRouteDescriptor,
  type OperatorSurfaceRouteAvailabilityOverrides,
} from '@narada2/operator-console-contract';

export const DEFAULT_OPERATOR_CONSOLE_PORT = DEFAULT_OPERATOR_ROUTER_PORT;
export const OPERATOR_CONSOLE_IDENTITY = 'narada.operator-console';
const OPERATOR_CONSOLE_HEALTH_SCHEMA = 'narada.operator_console.health.v1';
const OPERATOR_CONSOLE_ROUTES_SCHEMA = 'narada.operator_console.routes.v1';
const OPERATOR_CONSOLE_PROBE_TIMEOUT_MS = 800;
const moduleRequire = createRequire(import.meta.url);

function resolveOperatorConsoleArtifactOptions(): { packageRoot: string; published: boolean } | undefined {
  try {
    const packageRoot = dirname(moduleRequire.resolve('@narada2/operator-console-ui/package.json'));
    const sourcePackagesRoot = `${resolve(naradaProperRoot(), 'packages')}${sep}`.toLowerCase();
    return {
      packageRoot,
      published: !packageRoot.toLowerCase().startsWith(sourcePackagesRoot),
    };
  } catch {
    return undefined;
  }
}

function concreteWorkspaceRoutePath(path: string): boolean {
  return !path.includes('<') && !path.includes('>');
}

function projectLocalRouteAvailability(routes: ReturnType<typeof createConsoleServerRoutes>): OperatorSurfaceRouteAvailabilityOverrides {
  return Object.fromEntries(operatorSurfaceDescriptors.map((surface) => [
    surface.id,
    Object.fromEntries(surface.routes.map((route) => {
      const available = concreteWorkspaceRoutePath(route.path)
        && routes.some((candidate) => candidate.method === 'GET' && candidate.pattern.test(route.path));
      const fallback: OperatorSurfaceAvailability = surface.defaultAvailability === 'available' ? 'unavailable' : 'planned';
      return [route.id, available ? 'available' : fallback];
    })),
  ])) as OperatorSurfaceRouteAvailabilityOverrides;
}

function projectLocalSurfaceAvailability(
  routeAvailability: OperatorSurfaceRouteAvailabilityOverrides,
): OperatorSurfaceAvailabilityOverrides {
  return Object.fromEntries(operatorSurfaceDescriptors.map((surface) => {
    const routeStates = Object.values(routeAvailability[surface.id] ?? {});
    const availability: OperatorSurfaceAvailability = routeStates.includes('available')
      ? 'available'
      : routeStates.includes('unavailable')
        ? 'unavailable'
        : surface.defaultAvailability;
    return [surface.id, availability];
  })) as OperatorSurfaceAvailabilityOverrides;
}

interface WorkspaceRouteProjection {
  additionalRoutes: OperatorSurfaceAdditionalRouteOverrides;
  routeAvailability: OperatorSurfaceRouteAvailabilityOverrides;
  surfaceAvailability: OperatorSurfaceAvailabilityOverrides;
}

function emptyWorkspaceRouteProjection(): WorkspaceRouteProjection {
  return { additionalRoutes: {}, routeAvailability: {}, surfaceAvailability: {} };
}

function dynamicWorkspaceRouteLabel(surfaceId: OperatorSurfaceId, route: OperatorRouterRouteProjection): string {
  if (surfaceId === 'site-operations') return `Site ${route.site_id ?? 'unknown'} Operations`;
  if (surfaceId === 'agent-sessions') return `Session ${route.session_id ?? 'unknown'}`;
  return `Session ${route.session_id ?? 'unknown'} Artifacts`;
}

function projectLiveRouterRoutes(routes: readonly OperatorRouterRouteProjection[]): WorkspaceRouteProjection {
  const projection = emptyWorkspaceRouteProjection();
  const surfaceRoutes = new Map<OperatorSurfaceId, OperatorSurfaceRouteDescriptor[]>();
  const routeAvailability = new Map<OperatorSurfaceId, Record<string, OperatorSurfaceAvailability>>();

  for (const route of routes) {
    if (!route.protocols.includes('http') || !concreteWorkspaceRoutePath(route.public_path)) continue;
    const surfaceId = route.route_class === 'site-operations'
      ? 'site-operations'
      : route.route_class === 'agent-web-ui'
        ? 'agent-sessions'
        : route.route_class === 'nars-artifact'
          ? 'artifacts'
          : null;
    if (!surfaceId) continue;
    const routeId = `router-${route.route_id}`;
    const surfaceRouteList = surfaceRoutes.get(surfaceId) ?? [];
    surfaceRouteList.push({
      id: routeId,
      path: route.public_path,
      kind: 'page',
      label: dynamicWorkspaceRouteLabel(surfaceId, route),
      ...(surfaceId === 'site-operations' && route.site_id
        ? { target: { kind: 'site' as const, id: route.site_id } }
        : surfaceId === 'agent-sessions' && route.session_id
          ? { target: { kind: 'session' as const, id: route.session_id } }
          : {}),
    });
    surfaceRoutes.set(surfaceId, surfaceRouteList);
    const surfaceRouteAvailability = routeAvailability.get(surfaceId) ?? {};
    surfaceRouteAvailability[routeId] = route.state === 'healthy' ? 'available' : 'unavailable';
    routeAvailability.set(surfaceId, surfaceRouteAvailability);
  }

  for (const [surfaceId, routesForSurface] of surfaceRoutes) {
    projection.additionalRoutes[surfaceId] = routesForSurface;
    const states = routeAvailability.get(surfaceId) ?? {};
    projection.routeAvailability[surfaceId] = states;
    if (surfaceId === 'site-operations' || surfaceId === 'artifacts') {
      const hasHealthyRoute = Object.values(states).includes('available');
      projection.surfaceAvailability[surfaceId] = hasHealthyRoute ? 'available' : 'unavailable';
      const templateRouteId = surfaceId === 'site-operations' ? 'operations' : 'artifact';
      projection.routeAvailability[surfaceId] = {
        [templateRouteId]: 'unavailable',
        ...states,
      };
    }
  }
  return projection;
}

function mergeWorkspaceRouteAvailability(
  base: OperatorSurfaceRouteAvailabilityOverrides,
  live: OperatorSurfaceRouteAvailabilityOverrides,
): OperatorSurfaceRouteAvailabilityOverrides {
  return Object.fromEntries(operatorSurfaceDescriptors.map((surface) => [
    surface.id,
    { ...(base[surface.id] ?? {}), ...(live[surface.id] ?? {}) },
  ])) as OperatorSurfaceRouteAvailabilityOverrides;
}

function mergeWorkspaceSurfaceAvailability(
  base: OperatorSurfaceAvailabilityOverrides,
  live: OperatorSurfaceAvailabilityOverrides,
): OperatorSurfaceAvailabilityOverrides {
  return { ...base, ...live };
}

export interface ConsoleServerConfig {
  port: number;
  host?: string;
  ingressMode?: 'diagnostic' | 'router';
  operatorRouterUrl?: string;
  readOperatorRouterRoutes?: typeof readOperatorRouterRoutes;
  registryReadModel?: SiteRegistryReadModel;
  registryMutationGateway?: RegistryMutationGateway;
  agentSessions?: AgentSessionReadModel;
  siteAgentOverview?: SiteAgentOverviewReadModel;
  siteAgentLaunch?: SiteAgentLaunchGateway;
  siteAgentPending?: SiteAgentPendingTracker;
  workspaceRouteDirectory?: () => Promise<OperatorWorkspaceRouteDirectory>;
  operatorConsoleUiRoot?: string;
}

export interface ConsoleServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
  getOwnership(): 'started' | 'attached' | 'diagnostic';
}

export interface EnsureConsoleServerResult {
  server: ConsoleServer;
  url: string;
  ownership: 'started' | 'attached' | 'diagnostic';
}

interface ConsoleProbeResult {
  status: 'absent' | 'matching' | 'unhealthy' | 'foreign';
  url: string;
  detail?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function probeHost(host: string): string {
  if (host === '0.0.0.0') return '127.0.0.1';
  if (host === '::') return '[::1]';
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

async function probeConsoleServer(host: string, port: number): Promise<ConsoleProbeResult> {
  const url = `http://${probeHost(host)}:${port}`;
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(OPERATOR_CONSOLE_PROBE_TIMEOUT_MS),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const matching = isRecord(payload) && payload.identity === OPERATOR_CONSOLE_IDENTITY;
    if (!matching) {
      return { status: 'foreign', url, detail: `unexpected_health_identity:${response.status}` };
    }
    if (!response.ok || !isRecord(payload) || payload.status !== 'healthy') {
      return { status: 'unhealthy', url, detail: `operator_console_not_healthy:${response.status}` };
    }
    return { status: 'matching', url };
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || error instanceof TypeError) {
      return { status: 'absent', url };
    }
    return { status: 'absent', url, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function createConsoleServer(config: ConsoleServerConfig): Promise<ConsoleServer> {
  const host = config.host ?? '127.0.0.1';
  const port = config.port;
  const operatorConsoleUiRoot = config.operatorConsoleUiRoot
    ?? ensureLaunchArtifact(
      naradaProperRoot(),
      'operator-console',
      resolveOperatorConsoleArtifactOptions(),
    ).artifact_root;
  const registry = await openRegistry();

  const observationFactory = createObservationFactory();
  const controlClientFactory = createControlClientFactory(registry);
  const registryReadModel = config.registryReadModel ?? createSiteRegistryReadModel();
  const agentSessions = config.agentSessions ?? createAgentSessionReadModel(registryReadModel);
  const siteAgentOverview = config.siteAgentOverview ?? createSiteAgentOverviewReadModel({
    registryReadModel,
    agentSessions,
  });
  const siteAgentLaunch = config.siteAgentLaunch ?? createSiteAgentLaunchGateway({ overview: siteAgentOverview });

  const routeContext = {
    registry,
    observationFactory,
    controlClientFactory,
    registryReadModel,
    registryMutationGateway: config.registryMutationGateway ?? createRegistryMutationGateway(),
    agentSessions,
    siteAgentOverview,
    siteAgentLaunch,
    siteAgentPending: config.siteAgentPending ?? createSiteAgentPendingTracker(),
    workspaceRouteDirectory: config.workspaceRouteDirectory ?? currentWorkspaceRouteDirectory,
    operatorConsoleUiRoot,
  };

  const routes = createConsoleServerRoutes(routeContext);
  const routeAvailability = projectLocalRouteAvailability(routes);
  const surfaceAvailability = projectLocalSurfaceAvailability(routeAvailability);

  async function currentWorkspaceRouteProjection(): Promise<WorkspaceRouteProjection> {
    if (!config.operatorRouterUrl) return emptyWorkspaceRouteProjection();
    try {
      const readRoutes = config.readOperatorRouterRoutes ?? readOperatorRouterRoutes;
      const liveRoutes = await readRoutes({ url: config.operatorRouterUrl });
      return projectLiveRouterRoutes(liveRoutes.routes);
    } catch {
      // The static Console projection remains truthful when the Router inventory
      // is temporarily unavailable; no dynamic route is advertised in that case.
      return emptyWorkspaceRouteProjection();
    }
  }

  async function currentWorkspaceProjection(): Promise<{
    additionalRoutes: OperatorSurfaceAdditionalRouteOverrides;
    routeAvailability: OperatorSurfaceRouteAvailabilityOverrides;
    surfaceAvailability: OperatorSurfaceAvailabilityOverrides;
  }> {
    const live = await currentWorkspaceRouteProjection();
    return {
      additionalRoutes: live.additionalRoutes,
      routeAvailability: mergeWorkspaceRouteAvailability(routeAvailability, live.routeAvailability),
      surfaceAvailability: mergeWorkspaceSurfaceAvailability(surfaceAvailability, live.surfaceAvailability),
    };
  }

  async function currentWorkspaceRouteDirectory(): Promise<OperatorWorkspaceRouteDirectory> {
    const workspaceProjection = await currentWorkspaceProjection();
    return projectOperatorWorkspaceRouteDirectory({
      availability: workspaceProjection.surfaceAvailability,
      routeAvailability: workspaceProjection.routeAvailability,
      additionalRoutes: workspaceProjection.additionalRoutes,
    });
  }

  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function htmlResponse(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === '/health' && req.method === 'GET') {
        const workspaceProjection = await currentWorkspaceProjection();
        const routeDirectory = projectOperatorWorkspaceRouteDirectory({
          availability: workspaceProjection.surfaceAvailability,
          routeAvailability: workspaceProjection.routeAvailability,
          additionalRoutes: workspaceProjection.additionalRoutes,
        });
        const surfaceCatalog = routeDirectory.surfaces;
        const routeCount = surfaceCatalog.reduce((count, surface) => count + surface.projectedRoutes.length, 0);
        const degradedSurfaceCount = surfaceCatalog.filter((surface) => surface.availability !== 'available').length;
        jsonResponse(res, 200, {
          schema: OPERATOR_CONSOLE_HEALTH_SCHEMA,
          identity: OPERATOR_CONSOLE_IDENTITY,
          status: 'healthy',
          ingress_mode: config.ingressMode ?? 'diagnostic',
          listener_host: host,
          listener_port: port,
          route_count: routes.length + 2,
          workspace_route_directory_schema: routeDirectory.schema,
          workspace_route_count: routeCount,
          surface_count: surfaceCatalog.length,
          degraded_surface_count: degradedSurfaceCount,
        });
        return;
      }

      if (pathname === '/routes' && req.method === 'GET') {
        const workspaceProjection = await currentWorkspaceProjection();
        const routeDirectory = projectOperatorWorkspaceRouteDirectory({
          availability: workspaceProjection.surfaceAvailability,
          routeAvailability: workspaceProjection.routeAvailability,
          additionalRoutes: workspaceProjection.additionalRoutes,
        });
        jsonResponse(res, 200, {
          schema: OPERATOR_CONSOLE_ROUTES_SCHEMA,
          identity: OPERATOR_CONSOLE_IDENTITY,
          directory_schema: routeDirectory.schema,
          routes: routeDirectory.surfaces.flatMap((surface) => surface.projectedRoutes.map((route) => ({
            surface_id: surface.id,
            path: route.path,
            kind: route.kind,
            availability: route.availability,
            detail: route.projectedDetail,
          }))),
        });
        return;
      }

      if (pathname === OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH && req.method === 'GET') {
        const workspaceProjection = await currentWorkspaceProjection();
        const routeDirectory = projectOperatorWorkspaceRouteDirectory({
          availability: workspaceProjection.surfaceAvailability,
          routeAvailability: workspaceProjection.routeAvailability,
          additionalRoutes: workspaceProjection.additionalRoutes,
        });
        jsonResponse(res, 200, routeDirectory);
        return;
      }

      if (pathname === '/' && (config.ingressMode ?? 'diagnostic') === 'router') {
        res.writeHead(302, { Location: OPERATOR_CONSOLE_AGENTS_PATH, 'Content-Length': '0' });
        res.end();
        return;
      }

      if (pathname === '/' || pathname === '/console/surfaces') {
        const workspaceProjection = await currentWorkspaceProjection();
        htmlResponse(res, 200, renderOperatorWorkspacePage({
          ingressMode: config.ingressMode ?? 'diagnostic',
          surfaceAvailability: workspaceProjection.surfaceAvailability,
          routeAvailability: workspaceProjection.routeAvailability,
          additionalRoutes: workspaceProjection.additionalRoutes,
        }));
        return;
      }

      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match && req.method === route.method) {
          await route.handler(req, res, match, url.searchParams);
          return;
        }
      }

      // Namespace separation: observation paths are GET-only, control is POST-only
      const isControlPath = pathname.startsWith('/console/sites/') && pathname.endsWith('/control');
      const isObservationPath = pathname.startsWith('/console/') && !isControlPath;

      if (isObservationPath && req.method !== 'GET' && req.method !== 'OPTIONS') {
        jsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }

      if (isControlPath && req.method !== 'POST' && req.method !== 'OPTIONS') {
        jsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: 'Internal server error', detail: err });
      }
    }
  }

  return {
    async start(): Promise<string> {
      if (server) {
        throw new Error('Console server already started');
      }
      try {
        return await new Promise((resolve, reject) => {
          server = createServer((req, res) => {
            handleRequest(req, res).catch(() => {
              if (!res.headersSent) {
                jsonResponse(res, 500, { error: 'Internal server error' });
              }
            });
          });

          server.on('error', (error) => {
            reject(error);
          });

          server.listen(port, host, () => {
            isRunning = true;
            const address = server!.address();
            const actualPort = typeof address === 'object' && address !== null ? address.port : port;
            serverUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`;
            resolve(serverUrl);
          });
        });
      } catch (error) {
        const failedServer = server as unknown as Server | null;
        server = null;
        if (failedServer?.listening) {
          await new Promise<void>((resolve) => failedServer.close(() => resolve()));
        }
        throw error;
      }
    },

    async stop(): Promise<void> {
      try {
        await siteAgentLaunch.close?.();
      } finally {
        registry.close();
        if (server) {
          await new Promise<void>((resolve) => {
            server!.close(() => {
              isRunning = false;
              serverUrl = null;
              server = null;
              resolve();
            });
          });
        }
      }
    },

    isRunning(): boolean {
      return isRunning;
    },

    getUrl(): string | null {
      return serverUrl;
    },

    getOwnership(): 'started' | 'attached' | 'diagnostic' {
      return port === 0 ? 'diagnostic' : 'started';
    },
  };
}

export async function ensureConsoleServer(config: ConsoleServerConfig): Promise<EnsureConsoleServerResult> {
  const host = config.host ?? '127.0.0.1';
  if (config.port === 0) {
    const server = await createConsoleServer(config);
    const url = await server.start();
    return { server, url, ownership: 'diagnostic' };
  }

  const existing = await probeConsoleServer(host, config.port);
  if (existing.status === 'matching') {
    const server: ConsoleServer = {
      async start(): Promise<string> {
        return existing.url;
      },
      async stop(): Promise<void> {
        // An attached handle must not stop the process it did not create.
      },
      isRunning(): boolean {
        return true;
      },
      getUrl(): string {
        return existing.url;
      },
      getOwnership(): 'attached' {
        return 'attached';
      },
    };
    return { server, url: existing.url, ownership: 'attached' };
  }
  if (existing.status === 'unhealthy' || existing.status === 'foreign') {
    throw new Error(`operator_console_port_occupied:${config.port}:${existing.detail ?? existing.status}`);
  }

  const server = await createConsoleServer({ ...config, ingressMode: config.ingressMode ?? 'router' });
  try {
    const url = await server.start();
    return { server, url, ownership: 'started' };
  } catch (error) {
    await server.stop();
    if (errorCode(error) !== 'EADDRINUSE') throw error;
    const raced = await probeConsoleServer(host, config.port);
    if (raced.status === 'matching') {
      return ensureConsoleServer({ ...config, ingressMode: config.ingressMode ?? 'router' });
    }
    throw new Error(`operator_console_port_occupied:${config.port}:${raced.detail ?? raced.status}`);
  }
}
