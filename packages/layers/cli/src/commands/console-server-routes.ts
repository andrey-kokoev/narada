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
import type { WorkspaceLaunchUiSession } from '@narada2/workspace-launch-contract';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import type { RegistryMutationGateway, RegistryMutationInput, RegistryMutationOperation } from './site-registry-management-gateway.js';
import type { AgentSessionReadModel } from './agent-session-read-model.js';
import {
  OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS,
  operatorSurfaceRoutePath,
} from '@narada2/operator-console-contract';
import {
  isWorkspaceLaunchUiSessionProxyable,
  readWorkspaceLaunchUiSessions,
  workspaceLaunchUiSessionRoute,
  type WorkspaceLaunchUiSessionRecord,
} from './workspace-launch-session-store.js';
import { readOperatorConsoleUiAsset, readOperatorConsoleUiDocument } from './console-ui-assets.js';

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

const OPERATOR_CONSOLE_REGISTRY_PATH = operatorSurfaceRoutePath('site-registry', 'sites');
const OPERATOR_CONSOLE_REGISTRY_ADD_PATH = operatorSurfaceRoutePath('site-registry', 'add');
const OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH = operatorSurfaceRoutePath('site-registry', 'manage');
const OPERATOR_CONSOLE_LAUNCH_PATH = operatorSurfaceRoutePath('launcher', 'launcher');
const OPERATOR_CONSOLE_SESSIONS_PATH = operatorSurfaceRoutePath('agent-sessions', 'sessions');

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function exactPathPattern(path: string): RegExp {
  return new RegExp(`^${regexEscape(path)}$`);
}

function suffixPathPattern(path: string, suffix: string): RegExp {
  return new RegExp(`^${regexEscape(path)}${suffix}`);
}

export interface ConsoleServerRouteContext {
  registry: SiteRegistry;
  observationFactory: (site: RegisteredSite) => SiteObservationApi;
  controlClientFactory: SiteControlClientFactory;
  registryReadModel: SiteRegistryReadModel;
  registryMutationGateway: RegistryMutationGateway;
  workspaceLaunchSessions?: () => Promise<WorkspaceLaunchUiSessionRecord[]>;
  agentSessions?: AgentSessionReadModel;
  operatorConsoleUiRoot?: string;
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

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function decodeSessionId(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function launcherProxyPathAllowed(method: string, path: string): boolean {
  if (method === 'GET') return path === '/' || path === '/launches' || path.startsWith('/assets/');
  if (method === 'POST') {
    return path === '/selector-model'
      || path === '/submit'
      || path === '/cancel'
      || /^\/launches\/[^/]+\/(recheck|retry|forget|open-web-ui|attach-cli|stop-runtime|stop-projection)$/.test(path);
  }
  return false;
}

function launcherTargetUrl(session: WorkspaceLaunchUiSessionRecord, path: string, searchParams: URLSearchParams): URL | null {
  if (!isWorkspaceLaunchUiSessionProxyable(session)) return null;
  try {
    const target = new URL(session.url!);
    target.pathname = path;
    target.search = searchParams.toString();
    return target;
  } catch {
    return null;
  }
}

function rewriteLauncherDocument(body: Buffer, basePath: string): Buffer {
  let html = body.toString('utf8');
  const bootstrapOpen = '<script type="application/json" id="narada-workspace-launch-bootstrap">';
  const bootstrapClose = '</script>';
  const bootstrapStart = html.indexOf(bootstrapOpen);
  if (bootstrapStart >= 0) {
    const contentStart = bootstrapStart + bootstrapOpen.length;
    const contentEnd = html.indexOf(bootstrapClose, contentStart);
    if (contentEnd >= 0) {
      try {
        const parsed: unknown = JSON.parse(html.slice(contentStart, contentEnd));
        if (isRecord(parsed)) {
          parsed.basePath = basePath;
          const serialized = JSON.stringify(parsed).replace(/</g, '\\u003c');
          html = html.slice(0, contentStart) + serialized + html.slice(contentEnd);
        }
      } catch {
        // The upstream launcher document remains authoritative if its bootstrap is malformed.
      }
    }
  }
  return Buffer.from(
    html
      .replaceAll('src="/assets/', `src="${basePath}/assets/`)
      .replaceAll('href="/assets/', `href="${basePath}/assets/`),
    'utf8',
  );
}

async function readProxyBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1024 * 1024) {
      oversized = true;
      continue;
    }
    chunks.push(buffer);
  }
  return oversized ? null : Buffer.concat(chunks);
}

async function proxyLauncherSessionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  session: WorkspaceLaunchUiSessionRecord,
  sessionPath: string,
  proxyPath: string,
  searchParams: URLSearchParams,
): Promise<void> {
  if (!launcherProxyPathAllowed(req.method ?? '', proxyPath)) {
    jsonResponse(res, 404, { error: 'Launcher session path not found' });
    return;
  }
  const target = launcherTargetUrl(session, proxyPath, searchParams);
  if (!target) {
    jsonResponse(res, 409, { error: 'Launcher session is no longer active' });
    return;
  }
  let body: Buffer | undefined;
  if (req.method !== 'GET') {
    const received = await readProxyBody(req);
    if (!received) {
      jsonResponse(res, 413, { error: 'Launcher session request is too large' });
      return;
    }
    body = received;
  }
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        ...(headerValue(req.headers.accept) ? { Accept: headerValue(req.headers.accept)! } : {}),
        ...(headerValue(req.headers['content-type']) ? { 'Content-Type': headerValue(req.headers['content-type'])! } : {}),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS),
    });
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    const responseBody = contentType.includes('text/html')
      ? rewriteLauncherDocument(upstreamBody, sessionPath)
      : upstreamBody;
    res.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Content-Length': responseBody.byteLength,
      'Cache-Control': upstream.headers.get('cache-control') ?? 'no-cache',
    });
    res.end(responseBody);
  } catch (error) {
    jsonResponse(res, 502, {
      error: 'Launcher session is unreachable',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function consoleLauncherSessionProjection(session: WorkspaceLaunchUiSessionRecord): WorkspaceLaunchUiSession {
  return {
    ...session,
    url: isWorkspaceLaunchUiSessionProxyable(session) ? workspaceLaunchUiSessionRoute(session.ui_session_id) : null,
  };
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

    // ── CLI-owned launcher routing surface ──
    {
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_LAUNCH_PATH),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_LAUNCH_PATH, '/api/sessions$'),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        jsonResponse(res, 200, {
          schema: 'narada.workspace_launch.ui_session_list.v1',
          sessions: (await (ctx.workspaceLaunchSessions ?? readWorkspaceLaunchUiSessions)()).map(consoleLauncherSessionProjection),
        });
      },
    },
    {
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_SESSIONS_PATH),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_SESSIONS_PATH, '/api/sessions$'),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        if (!ctx.agentSessions) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.agent_sessions.v1',
            status: 'refused',
            generated_at: new Date().toISOString(),
            count: 0,
            sessions: [],
            refusals: ['agent_session_read_model_unavailable'],
          });
          return;
        }
        jsonResponse(res, 200, await ctx.agentSessions.list());
      },
    },
    {
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_LAUNCH_PATH, '/sessions/([^/]+)(/.*)?$'),
      handler: async (req, res, params, searchParams) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const sessionId = decodeSessionId(params[1]!);
        if (!sessionId) {
          jsonResponse(res, 400, { error: 'Invalid launcher session id' });
          return;
        }
        const sessions = await (ctx.workspaceLaunchSessions ?? readWorkspaceLaunchUiSessions)();
        const session = sessions.find((candidate) => candidate.ui_session_id === sessionId);
        if (!session) {
          jsonResponse(res, 404, { error: 'Launcher session not found' });
          return;
        }
        await proxyLauncherSessionRequest(req, res, session, workspaceLaunchUiSessionRoute(sessionId), params[2] ?? '/', searchParams);
      },
    },
    {
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_LAUNCH_PATH, '/sessions/([^/]+)(/.*)?$'),
      handler: async (req, res, params, searchParams) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const sessionId = decodeSessionId(params[1]!);
        if (!sessionId) {
          jsonResponse(res, 400, { error: 'Invalid launcher session id' });
          return;
        }
        const sessions = await (ctx.workspaceLaunchSessions ?? readWorkspaceLaunchUiSessions)();
        const session = sessions.find((candidate) => candidate.ui_session_id === sessionId);
        if (!session) {
          jsonResponse(res, 404, { error: 'Launcher session not found' });
          return;
        }
        await proxyLauncherSessionRequest(req, res, session, workspaceLaunchUiSessionRoute(sessionId), params[2] ?? '/', searchParams);
      },
    },

    // ── Canonical Site Registry management plan/apply boundary ──
    {
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/operations/plan$'),
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
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/operations/apply$'),
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
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/assets/(.+)$'),
      handler: async (_req, res, params) => {
        const asset = readOperatorConsoleUiAsset(`${OPERATOR_CONSOLE_REGISTRY_PATH}/assets/${params[1]!}`, ctx.operatorConsoleUiRoot);
        if (!asset) {
          jsonResponse(res, 404, { error: 'Operator Console asset not found' });
          return;
        }
        res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.body.byteLength, 'Cache-Control': 'no-cache' });
        res.end(asset.body);
      },
    },
    {
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_ADD_PATH),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH),
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/sites$'),
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
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/sites/([^/]+)$'),
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
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/discover-plan$'),
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
