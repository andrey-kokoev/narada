/**
 * Operator Console HTTP API routes.
 *
 * Read-only GET endpoints for cross-Site observation plus a single POST
 * control endpoint that routes through ControlRequestRouter.
 *
 * Authority boundary:
 * - GET routes are strictly read-only; they never mutate registry or Site state.
 * - POST /console/sites/:site_id/control delegates through ControlRequestRouter.
 * - No direct Site mutation from route handlers.
 */

import type { ServerResponse, IncomingMessage } from 'http';
import type {
  SiteRegistry,
  RegisteredSite,
  SiteObservationApi,
  SiteControlClientFactory,
} from '@narada2/windows-site';
import type { ConsoleControlRequest } from '@narada2/windows-site';
import { renderSiteRegistryPage } from './console-site-registry-page.js';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import type { RegistryMutationGateway, RegistryMutationInput, RegistryMutationOperation } from './site-registry-management-gateway.js';

export interface RouteHandler {
  method: string;
  pattern: RegExp;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: RegExpExecArray,
    searchParams: URLSearchParams,
  ) => Promise<void>;
}

export interface ConsoleServerRouteContext {
  registry: SiteRegistry;
  observationFactory: (site: RegisteredSite) => SiteObservationApi;
  controlClientFactory: SiteControlClientFactory;
  registryReadModel: SiteRegistryReadModel;
  registryMutationGateway: RegistryMutationGateway;
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}


function htmlResponse(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function commandResponse(res: ServerResponse, command: { exitCode: number; result: unknown }): void {
  const body = command.result as Record<string, unknown> | null;
  const status = body?.status === 'refused' && (body.refusals as unknown[] | undefined)?.includes('site_not_found')
    ? 404
    : body?.status === 'conflict'
      ? 409
      : command.exitCode === 0
        ? 200
        : 400;
  jsonResponse(res, status, command.result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

async function requestJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function registryMutationInput(payload: Record<string, unknown>): RegistryMutationInput | null {
  const operation = optionalString(payload.operation);
  if (operation !== 'add' && operation !== 'edit' && operation !== 'retire' && operation !== 'restore' && operation !== 'purge') return null;
  const expectedRevision = payload.expected_revision;
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0)) return null;
  return {
    operation: operation as RegistryMutationOperation,
    siteId: optionalString(payload.site_id),
    reference: optionalString(payload.reference),
    root: optionalString(payload.root),
    variant: optionalString(payload.variant),
    substrate: optionalString(payload.substrate),
    aimJson: optionalString(payload.aim_json),
    controlEndpoint: optionalString(payload.control_endpoint),
    clearAimJson: payload.clear_aim_json === true ? true : undefined,
    clearControlEndpoint: payload.clear_control_endpoint === true ? true : undefined,
    clearAliases: payload.clear_aliases === true ? true : undefined,
    aliases: optionalStringArray(payload.aliases),
    source: optionalString(payload.source),
    sourceRef: optionalString(payload.source_ref),
    reason: optionalString(payload.reason),
    reAdmit: payload.re_admit === true,
    actor: optionalString(payload.actor),
    expectedRevision: expectedRevision as number | undefined,
    confirmSiteId: optionalString(payload.confirm_site_id),
  };
}
function registryQuery(searchParams: URLSearchParams): { source?: 'filesystem' | 'launch_registry' | 'all'; root?: string; actor?: string } | null {
  const source = searchParams.get('source');
  if (source !== null && source !== 'filesystem' && source !== 'launch_registry' && source !== 'all') return null;
  return {
    source: source ?? undefined,
    root: searchParams.get('root') ?? undefined,
    actor: searchParams.get('actor') ?? undefined,
  };
}
function parseLimit(searchParams: URLSearchParams, defaultValue = 50, max = 1000): number {
  const raw = searchParams.get('limit');
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return Math.min(n, max);
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('https://127.0.0.1:')
  );
}

function setCorsHeaders(res: ServerResponse, origin: string | undefined): boolean {
  if (!isLocalOrigin(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

export function createConsoleServerRoutes(ctx: ConsoleServerRouteContext): RouteHandler[] {
  return [
    // ── CORS preflight ──
    {
      method: 'OPTIONS',
      pattern: /^\/console\/.*$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
      },
    },

    // ── Canonical Site Registry management plan/apply boundary ──
    {
      method: 'POST',
      pattern: /^\/console\/registry\/api\/operations\/plan$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const input = payload ? registryMutationInput(payload) : null;
        if (!input) {
          jsonResponse(res, 400, { error: 'Invalid registry management request' });
          return;
        }
        commandResponse(res, await ctx.registryMutationGateway.plan(input));
      },
    },
    {
      method: 'POST',
      pattern: /^\/console\/registry\/api\/operations\/apply$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const input = payload ? registryMutationInput(payload) : null;
        if (!payload || !input || payload.confirm_apply !== true) {
          jsonResponse(res, 400, { error: 'Confirmed registry management request required' });
          return;
        }
        commandResponse(res, await ctx.registryMutationGateway.apply(input));
      },
    },
    // ── Canonical Site Registry browser projection ──
    {
      method: 'GET',
      pattern: /^\/console\/registry$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, renderSiteRegistryPage());
      },
    },
    {
      method: 'GET',
      pattern: /^\/console\/registry\/api\/sites$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.list());
      },
    },
    {
      method: 'GET',
      pattern: /^\/console\/registry\/api\/sites\/([^/]+)$/,
      handler: async (_req, res, params) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.show(decodeURIComponent(params[1]!)));
      },
    },
    {
      method: 'GET',
      pattern: /^\/console\/registry\/api\/discover-plan$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const query = registryQuery(searchParams);
        if (!query) {
          jsonResponse(res, 400, { error: 'Invalid registry discovery source' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.discoverPlan(query));
      },
    },
    // ── Sites ──
    {
      method: 'GET',
      pattern: /^\/console\/sites$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const sites = ctx.registry.listSites();
        const limit = parseLimit(searchParams, 1000);
        jsonResponse(res, 200, { sites: sites.slice(0, limit) });
      },
    },

    {
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)$/,
      handler: async (_req, res, params) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const api = ctx.observationFactory(site);
        const health = await api.getHealth();
        jsonResponse(res, 200, { site, health });
      },
    },

    // ── Health ──
    {
      method: 'GET',
      pattern: /^\/console\/health$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const { aggregateHealth } = await import('@narada2/windows-site');
        const summary = await aggregateHealth(ctx.registry, ctx.observationFactory);
        jsonResponse(res, 200, { summary });
      },
    },

    // ── Attention ──
    {
      method: 'GET',
      pattern: /^\/console\/attention$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const { deriveAttentionQueue } = await import('@narada2/windows-site');
        const items = await deriveAttentionQueue(ctx.registry, ctx.observationFactory);
        jsonResponse(res, 200, { items });
      },
    },

    // ── Logs (registry audit) ──
    {
      method: 'GET',
      pattern: /^\/console\/logs$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Cross-site audit: aggregate newest records across all sites
        const sites = ctx.registry.listSites();
        const allRecords = sites.flatMap((site) =>
          ctx.registry.getAuditRecordsForSite(site.siteId, limit),
        );
        allRecords.sort((a, b) => b.routedAt.localeCompare(a.routedAt));
        jsonResponse(res, 200, { logs: allRecords.slice(0, limit) });
      },
    },

    {
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/logs$/,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const logs = ctx.registry.getAuditRecordsForSite(siteId, limit);
        jsonResponse(res, 200, { site_id: siteId, logs });
      },
    },

    // ── Traces ──
    {
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/traces$/,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Traces are derived from site observation where available.
        // For v0, return an empty array with a note if the adapter cannot provide traces.
        const api = ctx.observationFactory(site);
        // Attempt to get health as a proxy for trace availability
        const health = await api.getHealth();
        jsonResponse(res, 200, {
          site_id: siteId,
          traces: [],
          note: 'Trace observability is adapter-dependent. v0 returns empty array; adapters may enrich in future versions.',
          health_status: health.status,
        });
      },
    },

    // ── Cycles ──
    {
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/cycles$/,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Cycle records are adapter-dependent. v0 returns empty array.
        jsonResponse(res, 200, {
          site_id: siteId,
          cycles: [],
          note: 'Cycle observability is adapter-dependent. v0 returns empty array; adapters may enrich in future versions.',
        });
      },
    },

    // ── Audit ──
    {
      method: 'GET',
      pattern: /^\/console\/audit$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const sites = ctx.registry.listSites();
        const allRecords = sites.flatMap((site) =>
          ctx.registry.getAuditRecordsForSite(site.siteId, limit),
        );
        allRecords.sort((a, b) => b.routedAt.localeCompare(a.routedAt));
        jsonResponse(res, 200, { audit: allRecords.slice(0, limit) });
      },
    },

    // ── Control ──
    {
      method: 'POST',
      pattern: /^\/console\/sites\/([^/]+)\/control$/,
      handler: async (req, res, params) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }

        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            jsonResponse(res, 413, { error: 'Payload too large' });
            return;
          }
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        if (!payload.action_type || typeof payload.action_type !== 'string') {
          jsonResponse(res, 400, { error: 'Missing or invalid action_type' });
          return;
        }

        const { ControlRequestRouter } = await import('@narada2/windows-site');
        const router = new ControlRequestRouter({
          registry: ctx.registry,
          clientFactory: ctx.controlClientFactory,
        });

        const request: ConsoleControlRequest = {
          requestId: `http-${Date.now()}`,
          siteId,
          actionType: payload.action_type as ConsoleControlRequest['actionType'],
          targetId: (payload.target_id as string) ?? '',
          targetKind: (payload.target_kind as ConsoleControlRequest['targetKind']) ?? 'outbound_command',
          scopeId: (payload.scope_id as string) ?? undefined,
          payload: (payload.payload as Record<string, unknown>) ?? undefined,
          requestedAt: new Date().toISOString(),
          requestedBy: (payload.requested_by as string) ?? 'browser',
        };

        const routeResult = await router.route(request);

        const statusCode = routeResult.success
          ? 200
          : routeResult.status === 'rejected'
            ? 422
            : 502;
        jsonResponse(res, statusCode, routeResult);
      },
    },
  ];
}
