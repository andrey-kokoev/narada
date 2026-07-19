import {
  createCloudflareNarsAuthorityService,
  createCloudflareNarsRemoteAccessRecord,
  createCloudflareNarsProjectionWorkerService,
  projectedEventMatchesView,
  validateProjectionCredential,
  type CloudflareNarsAuthorityRuntimeExecutor,
  type CloudflareNarsAuthorityWorkerState,
  type CloudflareNarsProjectionIntent,
  type CloudflareNarsRemoteAccessRecord,
  type CloudflareNarsProjectionWorkerState,
  type CloudflareNarsAuthorityEvent,
  type ProjectedEvent,
} from './index.js';
import { createCloudflareNarsProviderRuntimeExecutor, CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND } from './provider-executor.js';
import providerRegistry from '@narada2/carrier-provider-contract/provider-registry';
import { resolveProviderRuntimeBinding } from '@narada2/carrier-provider-contract/provider-runtime-binding-core';
import {
  createCloudflareNarsWorkspaceDirectoryService,
  handleCloudflareNarsWorkspaceDirectoryRequest,
  NarsWorkspaceDirectory,
  type CloudflareNarsWorkspaceDirectoryService,
} from './workspace-directory.js';
import {
  OPERATOR_CONSOLE_PATH,
} from '@narada2/operator-console-contract';
import type { OperatorWorkspaceRouteDirectory } from '@narada2/operator-console-contract';
import { renderCloudflareWorkspacePage } from './cloudflare-workspace-page.js';

export interface CloudflareNarsProjectionWorkerEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> | Response };
  NARS_PROJECTION_STATE?: DurableObjectNamespaceLike;
  NARS_WORKSPACE_DIRECTORY?: DurableObjectNamespaceLike;
  // Provider binding reuses the canonical Narada provider vocabulary
  // (@narada2/carrier-provider-contract / local NARS / pwsh SecretStore).
  // The API key value mirrors the pwsh SecretStore entry
  // `narada/provider/<provider>/api-key`, carried here as a Worker secret.
  NARADA_AI_BASE_URL?: string;
  NARADA_INTELLIGENCE_PROVIDER?: string;
  NARADA_AI_MODEL?: string;
  NARADA_AI_THINKING?: string;
  NARADA_AI_API_KEY?: string;
}

function isWorkspaceRouteDirectory(value: unknown): value is OperatorWorkspaceRouteDirectory {
  const record = objectRecord(value);
  return record !== null
    && record.schema === 'narada.operator_workspace.route_directory.v3'
    && objectRecord(record.workspaceHost) !== null
    && Array.isArray(record.surfaces);
}

async function readWorkspaceDirectoryForPage(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  workspaceDirectory: CloudflareNarsWorkspaceDirectoryService,
  now: () => string,
): Promise<OperatorWorkspaceRouteDirectory> {
  const requestUrl = new URL(request.url);
  const projectionId = requestUrl.searchParams.get('projection_id');
  if (env.NARS_WORKSPACE_DIRECTORY) {
    const directoryUrl = new URL(request.url);
    directoryUrl.pathname = '/api/nars/workspace/routes';
    directoryUrl.search = projectionId ? `?projection_id=${encodeURIComponent(projectionId)}` : '';
    const response = await env.NARS_WORKSPACE_DIRECTORY
      .get(env.NARS_WORKSPACE_DIRECTORY.idFromName('workspace'))
      .fetch(new Request(directoryUrl));
    const payload = await response.json().catch(() => null);
    if (isWorkspaceRouteDirectory(payload)) return payload;
  }
  return workspaceDirectory.projectDirectory({
    workspace_host: { kind: 'cloudflare', id: 'worker', origin: requestUrl.origin },
    projection_id: projectionId,
    now: now(),
  });
}

async function lookupWorkspaceRouteInDurableObject(path: string, env: CloudflareNarsProjectionWorkerEnv): Promise<Record<string, unknown> | null> {
  const namespace = env.NARS_WORKSPACE_DIRECTORY;
  if (!namespace) return null;
  const url = new URL('https://workspace.internal/internal/workspace/route');
  url.searchParams.set('path', path);
  const response = await namespace.get(namespace.idFromName('workspace')).fetch(new Request(url));
  const body = await response.json().catch(() => null) as { status?: string; lease?: Record<string, unknown> | null } | null;
  return body?.status === 'ok' ? body.lease ?? null : null;
}

export { NarsWorkspaceDirectory };

async function routeWorkspaceDirectoryRequestToDurableObject(request: Request, env: CloudflareNarsProjectionWorkerEnv): Promise<Response | null> {
  const namespace = env.NARS_WORKSPACE_DIRECTORY;
  if (!namespace) return null;
  return namespace.get(namespace.idFromName('workspace')).fetch(request);
}

async function authorizeWorkspaceRequest(args: {
  request: Request;
  env: CloudflareNarsProjectionWorkerEnv;
  path: string;
  service: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  options: CloudflareNarsProjectionWorkerOptions;
  now: () => string;
}): Promise<Response | null> {
  if (args.path === 'api/nars/workspace/routes' && args.request.method === 'GET') {
    const projectionId = new URL(args.request.url).searchParams.get('projection_id');
    return validateWorkspaceCapability({ ...args, projectionId: projectionId ?? undefined, credentialKind: 'browser', action: 'read_workspace_routes', token: requireBrowserToken(args.request) });
  }
  if ((args.path === 'api/nars/workspace/routes/register' || args.path === 'api/nars/workspace/routes/health' || args.path === 'api/nars/workspace/routes/revoke') && args.request.method === 'POST') {
    const body = await readJson(args.request.clone());
    return validateWorkspaceCapability({ ...args, projectionId: stringOrUndefined(body.projection_id), credentialKind: 'bridge', action: 'publish_workspace_route', token: requireBridgeToken(args.request) });
  }
  return json(refusal('workspace_route_method_not_allowed'), 405);
}

async function validateWorkspaceCapability(args: {
  request: Request;
  env: CloudflareNarsProjectionWorkerEnv;
  service: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  options: CloudflareNarsProjectionWorkerOptions;
  now: () => string;
  projectionId?: string;
  credentialKind: 'browser' | 'bridge';
  action: 'read_workspace_routes' | 'publish_workspace_route';
  token: string;
}): Promise<Response | null> {
  if (!args.projectionId) return json(refusal('projection_id_required'), 400);
  if (!args.token) return json(refusal('workspace_capability_required'), 401);
  let validation: { ok: boolean; code?: string };
  if (!args.options.service && !args.options.authority_service && args.env.NARS_PROJECTION_STATE) {
    const url = new URL(args.request.url);
    url.pathname = `/api/nars/projections/${encodeURIComponent(args.projectionId)}/workspace-capability`;
    const capabilityRequest = new Request(url, {
      method: 'POST',
      headers: args.request.headers,
      body: JSON.stringify({ credential_kind: args.credentialKind, token_fingerprint: args.token, action: args.action }),
    });
    const response = await routeProjectionRequestToDurableObject(capabilityRequest, args.env, trimPath(url.pathname));
    const payload = await response?.json().catch(() => null) as { ok?: boolean; code?: string; [key: string]: unknown } | null;
    validation = payload ? { ok: payload.ok === true, code: payload.code } : { ok: false, code: 'workspace_capability_validation_unavailable' };
  } else {
    const record = args.service.snapshot().access_records.find((candidate) => candidate.projection_id === args.projectionId);
    validation = record
      ? validateProjectionCredential(record, { credential_kind: args.credentialKind, token_fingerprint: args.token, action: args.action, now: args.now() })
      : { ok: false, code: 'projection_not_found' };
  }
  return validation.ok ? null : json(validation, 403);
}

interface SseSubscriber {
  projectionId: string;
  view: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
}

interface WorkerWebSocket extends WebSocket {
  accept(): void;
}

interface WorkerWebSocketPair {
  0: WorkerWebSocket;
  1: WorkerWebSocket;
}

declare const WebSocketPair: { new(): WorkerWebSocketPair };

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> | Response };
}

interface DurableObjectStateLike {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined> | T | undefined;
    put(key: string, value: unknown): Promise<void> | void;
  };
  waitUntil?(promise: Promise<unknown>): void;
}

export interface CloudflareNarsProjectionWorkerOptions {
  service?: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  authority_service?: ReturnType<typeof createCloudflareNarsAuthorityService>;
  workspace_directory_service?: CloudflareNarsWorkspaceDirectoryService;
  now?: () => string;
}

export function authorityExecutorFromEnv(env: CloudflareNarsProjectionWorkerEnv | undefined): CloudflareNarsAuthorityRuntimeExecutor | undefined {
  const provider = env?.NARADA_INTELLIGENCE_PROVIDER?.trim();
  if (!provider) return undefined;
  const metadata = (providerRegistry as { providers?: Record<string, Record<string, unknown>> }).providers ?? {};
  let resolved;
  try {
    resolved = resolveProviderRuntimeBinding(provider, {
      metadata,
      env: env as Record<string, string | undefined>,
    });
  } catch (error) {
    // Unresolvable binding (unknown provider, missing key/base/model) stays on
    // the synthetic default adapter; the reason is logged, never secret-bearing.
    console.warn(`cloudflare provider binding unresolved: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  const adapterKind = typeof metadata[provider]?.adapter_kind === 'string' && String(metadata[provider].adapter_kind).trim()
    ? String(metadata[provider].adapter_kind).trim()
    : CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND;
  return createCloudflareNarsProviderRuntimeExecutor({
    binding: {
      provider: resolved.provider_id,
      adapter_kind: adapterKind,
      model: resolved.model,
      thinking: resolved.reasoning_effort,
      api_base_url: resolved.base_url,
      api_key: resolved.api_key,
      credential_secret_ref: resolved.credential_secret_ref,
    },
  });
}

export function createCloudflareNarsProjectionWorker(options: CloudflareNarsProjectionWorkerOptions = {}) {
  const service = options.service ?? createCloudflareNarsProjectionWorkerService();
  let authorityService = options.authority_service ?? null;
  const resolveAuthorityService = (env: CloudflareNarsProjectionWorkerEnv) => {
    if (!authorityService) authorityService = createCloudflareNarsAuthorityService({ runtime_executor: authorityExecutorFromEnv(env) });
    return authorityService;
  };
  const workspaceDirectory = options.workspace_directory_service ?? createCloudflareNarsWorkspaceDirectoryService();
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async fetch(request: Request, env: CloudflareNarsProjectionWorkerEnv = {}): Promise<Response> {
      const url = new URL(request.url);
      const path = trimPath(url.pathname);
      if (!path.startsWith('api/nars/')) return serveStaticAsset(request, env, workspaceDirectory, now);
      if (request.method === 'OPTIONS') return corsResponse();
      if (request.method === 'GET' && path === 'api/nars/assets/manifest') {
        return serveAssetManifest(request, env);
      }
      if (request.method === 'GET' && path === 'api/nars/authority/health') {
        return json({ schema: 'narada.cloudflare_nars_authority.service_health.v1', status: 'healthy', execution: resolveAuthorityService(env).execution_mode });
      }
      const capabilityRoute = projectionRoute(request);
      if (request.method === 'POST' && capabilityRoute?.suffix === 'workspace-capability') {
        const body = await readJson(request);
        const record = service.snapshot().access_records.find((candidate) => candidate.projection_id === capabilityRoute.projectionId);
        const validation = record
          ? validateProjectionCredential(record, {
            credential_kind: body.credential_kind === 'browser' ? 'browser' : 'bridge',
            token_fingerprint: String(body.token_fingerprint ?? ''),
            action: body.action === 'read_workspace_routes' ? 'read_workspace_routes' : 'publish_workspace_route',
            now: now(),
          })
          : { ok: false, code: 'projection_not_found', projection_id: capabilityRoute.projectionId };
        return json(validation, validation.ok ? 200 : 403);
      }
      if (request.method === 'GET' && path === 'api/nars/projections/health') {
        return json({ schema: 'narada.cloudflare_nars_projection.service_health.v1', status: 'healthy' });
      }
      if (path === 'api/nars/workspace/health' && request.method === 'GET') {
        return json(workspaceDirectory.health(now()));
      }
      if (path === 'api/nars/workspace/routes' || path === 'api/nars/workspace/routes/register' || path === 'api/nars/workspace/routes/health' || path === 'api/nars/workspace/routes/revoke') {
        const capabilityFailure = await authorizeWorkspaceRequest({ request, env, path, service, options, now });
        if (capabilityFailure) return capabilityFailure;
        if (!options.service && !options.authority_service && env.NARS_WORKSPACE_DIRECTORY) {
          const durableResponse = await routeWorkspaceDirectoryRequestToDurableObject(request, env);
          if (durableResponse) return durableResponse;
        }
        return handleCloudflareNarsWorkspaceDirectoryRequest(request, workspaceDirectory, now);
      }
      if (!options.service && !options.authority_service && env.NARS_PROJECTION_STATE) {
        const authorityResponse = await routeAuthorityRequestToDurableObject(request, env, path);
        if (authorityResponse) return authorityResponse;
        const durableResponse = await routeProjectionRequestToDurableObject(request, env, path);
        if (durableResponse) return durableResponse;
      }
      if (request.method === 'POST' && path === 'api/nars/authority/sessions') {
        const body = await readJson(request);
        return json(resolveAuthorityService(env).createSession({
          session_id: stringOrUndefined(body.session_id),
          site_id: stringOrUndefined(body.site_id) ?? '',
          agent_id: stringOrUndefined(body.agent_id) ?? '',
          mcp_fabric: objectRecord(body.mcp_fabric),
        }, now()));
      }
      const authority = authorityRoute(request);
      if (authority) {
        if (request.method === 'GET' && authority.suffix === 'health') {
          const surfaceOrigin = url.searchParams.get('surface_origin') === 'local' ? 'local' : 'cloudflare';
          return json(resolveAuthorityService(env).readHealth(authority.sessionId, surfaceOrigin));
        }
        if (request.method === 'GET' && authority.suffix === 'events') {
          return json(resolveAuthorityService(env).readEvents({
            session_id: authority.sessionId,
            since_sequence: numberParam(url, 'since_sequence'),
            max_events: numberParam(url, 'max_events') ?? undefined,
          }));
        }
        const authorityArtifact = authority.suffix.match(/^artifacts(?:\/([^/]+))?(?:\/(content))?$/);
        if (authorityArtifact) {
          const artifactId = authorityArtifact[1] ? decodeURIComponent(authorityArtifact[1]) : null;
          if (request.method === 'GET' && authorityArtifact[2] === 'content' && artifactId) {
            const read = resolveAuthorityService(env).readArtifactContent({ session_id: authority.sessionId, artifact_id: artifactId });
            if (read.status !== 'ok' || !read.content) return json(read, 404);
            return new Response(read.content.body, { status: 200, headers: withCorsHeaders(read.content.headers) });
          }
          if (request.method === 'GET') {
            const read = resolveAuthorityService(env).readArtifactMetadata({ session_id: authority.sessionId, artifact_id: artifactId });
            return json(artifactId && read.status === 'ok' ? { ...read, artifact: read.artifacts[0] ?? null } : read);
          }
        }
        if (request.method === 'POST' && authority.suffix === 'input') {
          const body = await readJson(request);
          return json(await resolveAuthorityService(env).submitInput({
            session_id: authority.sessionId,
            method: String(body.method ?? ''),
            payload: objectRecord(body.payload) ?? {},
            now: now(),
          }));
        }
        if (request.method === 'DELETE' && authority.suffix === '') return json(resolveAuthorityService(env).revokeSession(authority.sessionId, now()));
      }
      if (request.method === 'POST' && path === 'api/nars/projections/register') {
        const body = await readJson(request);
        const intent = objectRecord(body.intent) as CloudflareNarsProjectionIntent | null;
        const record = intent
          ? createCloudflareNarsRemoteAccessRecord({ intent, created_at: now() })
          : (body.remote_access ?? body) as CloudflareNarsRemoteAccessRecord;
        return json(service.register(record));
      }
      const match = path.match(/^api\/nars\/projections\/([^/]+)(?:\/(.*))?$/);
      if (!match) return json(refusal('route_not_found'), 404);
      const projectionId = decodeURIComponent(match[1] ?? '');
      const suffix = match[2] ?? '';
      if (request.method === 'DELETE' && suffix === '') return json(service.revokeProjection(projectionId, now()));
      if (request.method === 'GET' && (suffix === 'events' || suffix === 'events/cache')) {
        return json(service.readEvents({
          projection_id: projectionId,
          browser_token_fingerprint: requireBrowserToken(request),
          since_sequence: numberParam(url, 'since_sequence'),
          before_sequence: numberParam(url, 'before_sequence'),
          direction: url.searchParams.get('direction') === 'backward' ? 'backward' : 'forward',
          max_events: numberParam(url, 'max_events') ?? undefined,
          view: url.searchParams.get('view') ?? undefined,
          now: now(),
        }));
      }
      if (request.method === 'GET' && suffix === 'health') {
        return json(service.readHealth({
          projection_id: projectionId,
          browser_token_fingerprint: requireBrowserToken(request),
          now: now(),
        }));
      }
      if (request.method === 'POST' && suffix === 'input') {
        const body = await readJson(request);
        return json(await service.submitInput({
          projection_id: projectionId,
          browser_token_fingerprint: requireBrowserToken(request),
          method: String(body.method ?? ''),
          payload: objectRecord(body.payload) ?? {},
          now: now(),
        }));
      }
      if (request.method === 'GET' && suffix === 'input/pending') {
        return json(service.claimPendingInputs({
          projection_id: projectionId,
          bridge_token_fingerprint: requireBridgeToken(request),
          max_inputs: numberParam(url, 'max_inputs') ?? undefined,
          now: now(),
        }));
      }
      const inputAckMatch = suffix.match(/^input\/([^/]+)\/ack$/);
      if (request.method === 'POST' && inputAckMatch) {
        const body = await readJson(request);
        return json(service.acknowledgeInput({
          projection_id: projectionId,
          bridge_token_fingerprint: requireBridgeToken(request),
          input_id: decodeURIComponent(inputAckMatch[1] ?? ''),
          nars_admission: body.nars_admission ?? body,
          ok: body.ok !== false,
          now: now(),
        }));
      }
      if (request.method === 'POST' && suffix === 'events') {
        const body = await readJson(request);
        return json(service.publishEvent({
          projection_id: projectionId,
          bridge_token_fingerprint: requireBridgeToken(request),
          site_id: stringOrUndefined(body.site_id),
          nars_session_id: stringOrUndefined(body.nars_session_id),
          event: objectRecord(body.event) ?? {},
          now: now(),
        }));
      }
      const artifactMatch = suffix.match(/^artifacts(?:\/([^/]+))?(?:\/(content))?$/);
      if (artifactMatch) return handleArtifactRoute({ request, projectionId, artifactId: artifactMatch[1] ? decodeURIComponent(artifactMatch[1]) : null, content: artifactMatch[2] === 'content', service, now });
      return json(refusal('route_not_found'), 404);
    },
  };
}

const defaultWorker = createCloudflareNarsProjectionWorker();
export default {
  fetch(request: Request, env: CloudflareNarsProjectionWorkerEnv) {
    return defaultWorker.fetch(request, env);
  },
};

export class NarsProjectionState {
  private static readonly storageKey = 'narada.cloudflare_nars_projection.worker_state.v1';
  private static readonly authorityStorageKey = 'narada.cloudflare_nars_authority.worker_state.v1';
  private readonly fallbackWorker = createCloudflareNarsProjectionWorker({ service: createCloudflareNarsProjectionWorkerService() });
  private readonly subscribers = new Set<SseSubscriber>();
  private readonly sockets = new Set<{ projectionId: string; view: string; socket: WorkerWebSocket }>();
  private readonly authoritySockets = new Set<{ sessionId: string; socket: WorkerWebSocket }>();

  constructor(private readonly state?: DurableObjectStateLike, private readonly env?: CloudflareNarsProjectionWorkerEnv) {}

  async fetch(request: Request): Promise<Response> {
    if (!this.state?.storage) {
      return this.fallbackWorker.fetch(request, {});
    }
    const stored = await this.state.storage.get<CloudflareNarsProjectionWorkerState>(NarsProjectionState.storageKey);
    const storedAuthority = await this.state.storage.get<CloudflareNarsAuthorityWorkerState>(NarsProjectionState.authorityStorageKey);
    const service = createCloudflareNarsProjectionWorkerService({ initial_state: stored ?? null });
    const authorityService = createCloudflareNarsAuthorityService({ initial_state: storedAuthority ?? null, runtime_executor: authorityExecutorFromEnv(this.env) });
    const authority = authorityRoute(request);
    if (authority && request.method === 'GET' && authority.suffix === 'events/websocket') {
      return this.openAuthorityEventWebSocket({ request, sessionId: authority.sessionId, service: authorityService });
    }
    const route = projectionRoute(request);
    if (route && request.method === 'GET' && route.suffix === 'events/stream') {
      return this.openEventStream({ request, projectionId: route.projectionId, service });
    }
    if (route && request.method === 'GET' && route.suffix === 'events/websocket') {
      return this.openEventWebSocket({ request, projectionId: route.projectionId, service });
    }
    const response = await createCloudflareNarsProjectionWorker({ service, authority_service: authorityService }).fetch(request, {});
    await this.state.storage.put(NarsProjectionState.storageKey, service.snapshot());
    await this.state.storage.put(NarsProjectionState.authorityStorageKey, authorityService.snapshot());
    if (authority && request.method === 'POST' && authority.suffix === 'input') {
      await this.broadcastAuthorityEvents(response.clone());
    }
    if (authority && request.method === 'DELETE' && authority.suffix === '') {
      await this.broadcastAuthorityRevoked(response.clone(), authority.sessionId);
    }
    if (route && request.method === 'POST' && route.suffix === 'events') {
      await this.broadcastPublishedEvent(response.clone());
    }
    if (route && request.method === 'DELETE' && route.suffix === '') {
      await this.broadcastProjectionRevoked(response.clone(), route.projectionId);
    }
    return response;
  }

  private openEventStream(args: {
    request: Request;
    projectionId: string;
    service: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  }): Response {
    const url = new URL(args.request.url);
    const view = url.searchParams.get('view') ?? 'raw';
    const read = args.service.readEvents({
      projection_id: args.projectionId,
      browser_token_fingerprint: requireBrowserToken(args.request),
      since_sequence: numberParam(url, 'since_sequence'),
      view,
      max_events: numberParam(url, 'max_events') ?? undefined,
      now: new Date().toISOString(),
    });
    if (read.status !== 'ok') return json(read, 403);
    const encoder = new TextEncoder();
    const subscribers = this.subscribers;
    const storage = this.state?.storage;
    if (!storage) throw new Error('nars_projection_stream_storage_unavailable');
    const browserToken = requireBrowserToken(args.request);
    let lastSequence = read.cursor?.last_sequence ?? numberParam(url, 'since_sequence') ?? null;
    let subscriber: SseSubscriber | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        subscriber = { projectionId: args.projectionId, view, controller };
        subscribers.add(subscriber);
        controller.enqueue(encoder.encode(`event: nars-stream-connected\ndata: ${JSON.stringify({ projection_id: args.projectionId, view, cursor: read.cursor ?? null })}\n\n`));
        for (const entry of read.events ?? []) {
          const payload = objectRecord((entry as { payload?: unknown }).payload) ?? objectRecord(entry) ?? {};
          controller.enqueue(encoder.encode(`event: nars-event\ndata: ${JSON.stringify(payload)}\n\n`));
        }
        const pump = (async () => {
          while (subscriber && subscribers.has(subscriber)) {
            await sleep(1000);
            if (!subscriber || !subscribers.has(subscriber)) break;
            const stored = await storage.get<CloudflareNarsProjectionWorkerState>(NarsProjectionState.storageKey);
            const service = createCloudflareNarsProjectionWorkerService({ initial_state: stored ?? null });
            const next = service.readEvents({
              projection_id: args.projectionId,
              browser_token_fingerprint: browserToken,
              since_sequence: lastSequence ?? undefined,
              view,
              max_events: numberParam(url, 'max_events') ?? undefined,
              now: new Date().toISOString(),
            });
            if (next.status !== 'ok') continue;
            for (const entry of next.events ?? []) {
              const eventSequence = typeof (entry as { event_sequence?: unknown }).event_sequence === 'number' ? (entry as { event_sequence: number }).event_sequence : null;
              if (eventSequence !== null) lastSequence = eventSequence;
              const payload = objectRecord((entry as { payload?: unknown }).payload) ?? objectRecord(entry) ?? {};
              try {
                controller.enqueue(encoder.encode(`event: nars-event\ndata: ${JSON.stringify(payload)}\n\n`));
              } catch {
                if (subscriber) subscribers.delete(subscriber);
                break;
              }
            }
          }
        })();
        this.state?.waitUntil?.(pump);
        void pump;
      },
      cancel: () => {
        if (subscriber) subscribers.delete(subscriber);
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      },
    });
  }

  private async broadcastPublishedEvent(response: Response): Promise<void> {
    const body = await response.json().catch(() => null);
    const event = objectRecord(body)?.event as ProjectedEvent | undefined;
    if (!event || body?.status !== 'published') return;
    const encoder = new TextEncoder();
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.projectionId !== event.projection_id || !projectedEventMatchesView(event, subscriber.view)) continue;
      try {
        subscriber.controller.enqueue(encoder.encode(`event: nars-event\ndata: ${JSON.stringify(event.payload)}\n\n`));
      } catch {
        this.subscribers.delete(subscriber);
      }
    }
    for (const subscriber of [...this.sockets]) {
      if (subscriber.projectionId !== event.projection_id || !projectedEventMatchesView(event, subscriber.view)) continue;
      try {
        subscriber.socket.send(JSON.stringify(event.payload));
      } catch {
        this.sockets.delete(subscriber);
      }
    }
  }

  private async broadcastProjectionRevoked(response: Response, projectionId: string): Promise<void> {
    const body = await response.json().catch(() => null);
    if (body?.status !== 'revoked') return;
    const payload = {
      event: 'projection_revoked',
      type: 'projection.revoked',
      projection_id: projectionId,
      code: 'projection_revoked',
    };
    const encoder = new TextEncoder();
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.projectionId !== projectionId) continue;
      try {
        subscriber.controller.enqueue(encoder.encode(`event: nars-event\ndata: ${JSON.stringify(payload)}\n\n`));
      } catch {
        // Ignore broken subscribers; the set is best-effort fanout state.
      } finally {
        this.subscribers.delete(subscriber);
      }
    }
    for (const subscriber of [...this.sockets]) {
      if (subscriber.projectionId !== projectionId) continue;
      try {
        subscriber.socket.send(JSON.stringify(payload));
        subscriber.socket.close(4000, 'projection_revoked');
      } catch {
        // Ignore broken subscribers; the set is best-effort fanout state.
      } finally {
        this.sockets.delete(subscriber);
      }
    }
  }

  private openEventWebSocket(args: {
    request: Request;
    projectionId: string;
    service: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  }): Response {
    if (args.request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json(refusal('websocket_upgrade_required'), 426);
    }
    const url = new URL(args.request.url);
    const browserToken = url.searchParams.get('browser_token') ?? requireBrowserToken(args.request);
    const view = url.searchParams.get('view') ?? 'raw';
    const read = args.service.readEvents({
      projection_id: args.projectionId,
      browser_token_fingerprint: browserToken,
      since_sequence: numberParam(url, 'since_sequence'),
      view,
      max_events: numberParam(url, 'max_events') ?? undefined,
      now: new Date().toISOString(),
    });
    if (read.status !== 'ok') return json(read, 403);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const subscriber = { projectionId: args.projectionId, view, socket: server };
    server.accept();
    this.sockets.add(subscriber);
    server.addEventListener('close', () => this.sockets.delete(subscriber));
    server.addEventListener('error', () => this.sockets.delete(subscriber));
    server.send(JSON.stringify({
      event: 'websocket_connected',
      transport: 'cloudflare_projection_websocket',
      projection_id: args.projectionId,
      view,
      cursor: read.cursor ?? null,
    }));
    for (const entry of read.events ?? []) {
      const payload = objectRecord((entry as { payload?: unknown }).payload) ?? objectRecord(entry) ?? {};
      server.send(JSON.stringify(payload));
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WorkerWebSocket });
  }

  private openAuthorityEventWebSocket(args: {
    request: Request;
    sessionId: string;
    service: ReturnType<typeof createCloudflareNarsAuthorityService>;
  }): Response {
    if (args.request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json(refusal('websocket_upgrade_required'), 426);
    }
    const url = new URL(args.request.url);
    const read = args.service.readEvents({
      session_id: args.sessionId,
      since_sequence: numberParam(url, 'since_sequence'),
      max_events: numberParam(url, 'max_events') ?? undefined,
    });
    if (read.status !== 'ok') return json(read, 403);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const subscriber = { sessionId: args.sessionId, socket: server };
    server.accept();
    this.authoritySockets.add(subscriber);
    server.addEventListener('close', () => this.authoritySockets.delete(subscriber));
    server.addEventListener('error', () => this.authoritySockets.delete(subscriber));
    server.send(JSON.stringify({
      event: 'websocket_connected',
      transport: 'cloudflare_authority_websocket',
      session_id: args.sessionId,
      cursor: read.cursor ?? null,
    }));
    for (const entry of read.events ?? []) server.send(JSON.stringify(entry.payload));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WorkerWebSocket });
  }

  private async broadcastAuthorityEvents(response: Response): Promise<void> {
    const body = await response.json().catch(() => null);
    if (body?.status !== 'admitted' || !Array.isArray(body.events)) return;
    for (const event of body.events as CloudflareNarsAuthorityEvent[]) {
      for (const subscriber of [...this.authoritySockets]) {
        if (subscriber.sessionId !== event.session_id) continue;
        try {
          subscriber.socket.send(JSON.stringify(event.payload));
        } catch {
          this.authoritySockets.delete(subscriber);
        }
      }
    }
  }

  private async broadcastAuthorityRevoked(response: Response, sessionId: string): Promise<void> {
    const body = await response.json().catch(() => null);
    if (body?.status !== 'revoked') return;
    for (const subscriber of [...this.authoritySockets]) {
      if (subscriber.sessionId !== sessionId) continue;
      try {
        subscriber.socket.send(JSON.stringify({
          event: 'authority_session_revoked',
          type: 'session.revoked',
          session_id: sessionId,
          code: 'session_revoked',
        }));
        subscriber.socket.close(4000, 'session_revoked');
      } catch {
        // Ignore broken subscribers; the set is best-effort fanout state.
      } finally {
        this.authoritySockets.delete(subscriber);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function projectionRoute(request: Request): { projectionId: string; suffix: string } | null {
  const path = trimPath(new URL(request.url).pathname);
  const match = path.match(/^api\/nars\/projections\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { projectionId: decodeURIComponent(match[1] ?? ''), suffix: match[2] ?? '' };
}

function authorityRoute(request: Request): { sessionId: string; suffix: string } | null {
  const path = trimPath(new URL(request.url).pathname);
  const match = path.match(/^api\/nars\/authority\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { sessionId: decodeURIComponent(match[1] ?? ''), suffix: match[2] ?? '' };
}

async function routeAuthorityRequestToDurableObject(request: Request, env: CloudflareNarsProjectionWorkerEnv, path: string): Promise<Response | null> {
  const namespace = env.NARS_PROJECTION_STATE;
  if (!namespace) return null;
  if (request.method === 'POST' && path === 'api/nars/authority/sessions') {
    const body = await readJson(request);
    const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : `cf_authority_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return namespace.get(namespace.idFromName(sessionId)).fetch(cloneJsonRequest(request, { ...body, session_id: sessionId }));
  }
  const match = path.match(/^api\/nars\/authority\/sessions\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? '');
  return namespace.get(namespace.idFromName(sessionId)).fetch(request);
}

async function routeProjectionRequestToDurableObject(request: Request, env: CloudflareNarsProjectionWorkerEnv, path: string): Promise<Response | null> {
  const namespace = env.NARS_PROJECTION_STATE;
  if (!namespace) return null;
  if (request.method === 'POST' && path === 'api/nars/projections/register') {
    const body = await readJson(request);
    const intent = objectRecord(body.intent) as CloudflareNarsProjectionIntent | null;
    const remoteAccess = objectRecord(body.remote_access ?? body) as CloudflareNarsRemoteAccessRecord | null;
    const projectionId = typeof intent?.projection_id === 'string' ? intent.projection_id : typeof remoteAccess?.projection_id === 'string' ? remoteAccess.projection_id : null;
    if (!projectionId) return json(refusal('projection_id_required'), 400);
    return namespace.get(namespace.idFromName(projectionId)).fetch(cloneJsonRequest(request, body));
  }
  const match = path.match(/^api\/nars\/projections\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;
  const projectionId = decodeURIComponent(match[1] ?? '');
  return namespace.get(namespace.idFromName(projectionId)).fetch(request);
}

function cloneJsonRequest(request: Request, body: unknown): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(body),
  });
}

async function handleArtifactRoute(args: {
  request: Request;
  projectionId: string;
  artifactId: string | null;
  content: boolean;
  service: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  now: () => string;
}) {
  if (args.request.method === 'GET' && !args.content) {
    const read = args.service.readArtifactMetadata({
      projection_id: args.projectionId,
      browser_token_fingerprint: requireBrowserToken(args.request),
      artifact_id: args.artifactId,
      now: args.now(),
    });
    return json(args.artifactId && read.status === 'ok' ? { ...read, artifact: read.artifacts[0] ?? null } : read);
  }
  if (args.request.method === 'GET' && args.content && args.artifactId) {
    const read = args.service.readArtifactContent({
      projection_id: args.projectionId,
      browser_token_fingerprint: requireBrowserToken(args.request),
      artifact_id: args.artifactId,
      now: args.now(),
    });
    if (read.status !== 'ok' || !read.content) return json(read, 404);
    const bytes = base64ToBytes(read.content.content_base64);
    return new Response(toArrayBuffer(bytes), { status: 200, headers: withCorsHeaders(read.content.headers) });
  }
  if (args.request.method === 'POST' && !args.content) {
    const body = await readJson(args.request);
    return json(args.service.publishArtifactMetadata({
      projection_id: args.projectionId,
      bridge_token_fingerprint: requireBridgeToken(args.request),
      artifact: objectRecord(body.artifact) ?? body,
      now: args.now(),
    }));
  }
  if (args.request.method === 'POST' && args.content && args.artifactId) {
    const body = await readJson(args.request);
    return json(args.service.publishArtifactContent({
      projection_id: args.projectionId,
      bridge_token_fingerprint: requireBridgeToken(args.request),
      artifact: objectRecord(body.artifact) ?? { artifact_id: args.artifactId, kind: body.kind ?? 'text' },
      content: typeof body.content_base64 === 'string' ? base64ToBytes(body.content_base64) : String(body.content ?? ''),
      headers: objectStringRecord(body.headers),
      now: args.now(),
    }));
  }
  return json(refusal('route_not_found'), 404);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}));
  return objectRecord(body) ?? {};
}

function requireBrowserToken(request: Request): string {
  return tokenFromHeaders(request, 'x-narada-browser-token-fingerprint');
}

function requireBridgeToken(request: Request): string {
  return tokenFromHeaders(request, 'x-narada-bridge-token-fingerprint');
}

function tokenFromHeaders(request: Request, header: string): string {
  const direct = request.headers.get(header);
  if (direct) return direct;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get(header) ?? url.searchParams.get(header.replace(/^x-narada-/, '').replace(/-fingerprint$/, ''));
  if (queryToken) return queryToken;
  const auth = request.headers.get('authorization') ?? '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function numberParam(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function trimPath(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '');
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: withCorsHeaders({ 'content-type': 'application/json; charset=utf-8' }) });
}

function corsResponse(): Response {
  return new Response(null, { status: 204, headers: withCorsHeaders({}) });
}

function withCorsHeaders(headers: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set('access-control-allow-origin', '*');
  next.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
  next.set('access-control-allow-headers', 'content-type,authorization,x-narada-browser-token-fingerprint,x-narada-bridge-token-fingerprint');
  next.set('access-control-expose-headers', 'content-type,x-narada-artifact-id,x-narada-artifact-kind');
  return next;
}

async function serveAssetManifest(request: Request, env: CloudflareNarsProjectionWorkerEnv): Promise<Response> {
  if (!env.ASSETS?.fetch) return json(refusal('static_assets_not_configured'), 404);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = '/narada-cloudflare-assets.json';
  assetUrl.search = '';
  const response = await env.ASSETS.fetch(new Request(assetUrl, {
    method: 'GET',
    headers: request.headers,
  }));
  if (!response.ok) return json(refusal('asset_manifest_not_found'), 404);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withCorsHeaders(headers),
  });
}

async function serveStaticAsset(request: Request, env: CloudflareNarsProjectionWorkerEnv, workspaceDirectory: CloudflareNarsWorkspaceDirectoryService, now: () => string): Promise<Response> {
  const url = new URL(request.url);
  const directProjectionEntry = url.pathname === '/'
    && url.searchParams.has('cloudflare_projection_id');
  const workspaceLanding = !directProjectionEntry
    && (url.pathname === '/' || url.pathname === OPERATOR_CONSOLE_PATH || url.pathname === `${OPERATOR_CONSOLE_PATH}/`);
  if (workspaceLanding) {
    const directory = await readWorkspaceDirectoryForPage(request, env, workspaceDirectory, now);
    return new Response(renderCloudflareWorkspacePage(directory, url.origin), {
      status: 200,
      headers: withCorsHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }),
    });
  }
  if (!env.ASSETS?.fetch) return json(refusal('static_assets_not_configured'), 404);
  const sessionDocument = url.pathname === '/sessions' || url.pathname === '/sessions/' || url.pathname.startsWith('/sessions/');
  const consoleDocument = isDocumentPath(url.pathname, OPERATOR_CONSOLE_PATH);
  const consoleLease = consoleDocument
    ? (env.NARS_WORKSPACE_DIRECTORY
      ? await lookupWorkspaceRouteInDurableObject(url.pathname, env)
      : workspaceDirectory.findByPath(url.pathname, now()))
    : null;
  const consoleUiConfig = objectRecord(consoleLease?.ui_config);
  if (consoleDocument && !consoleLease) return json(refusal('operator_console_route_not_leased'), 404);
  if (consoleDocument && !consoleUiConfig) return json(refusal('operator_console_route_configuration_unavailable'), 503);
  const assetUrl = new URL(url);
  if (directProjectionEntry) assetUrl.pathname = '/sessions/index.html';
  if (consoleDocument) assetUrl.pathname = `${OPERATOR_CONSOLE_PATH}/index.html`;
  if (sessionDocument && !hasFileExtension(url.pathname)) assetUrl.pathname = '/sessions/index.html';
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  if ((!sessionDocument && !consoleDocument) || !isHtmlResponse(response)) return response;
  const lease = consoleDocument ? consoleLease : (env.NARS_WORKSPACE_DIRECTORY
    ? await lookupWorkspaceRouteInDurableObject(url.pathname, env)
    : workspaceDirectory.findByPath(url.pathname, now()));
  const uiConfig = objectRecord(lease?.ui_config);
  if (sessionDocument && !uiConfig) return json(refusal('workspace_session_route_not_found'), 404);
  const consoleRouteDirectory = objectRecord(uiConfig?.workspace_route_directory);
  const consoleConfig = consoleRouteDirectory
    ? {
      routeDirectory: {
        endpoint: stringOrUndefined(consoleRouteDirectory.endpoint) ?? null,
        projectionId: stringOrUndefined(consoleRouteDirectory.projection_id) ?? null,
        browserToken: stringOrUndefined(consoleRouteDirectory.browser_token) ?? null,
      },
    }
    : {};
  const content = await response.text();
  const headers = new Headers(response.headers);
  // The body is no longer the immutable asset returned by ASSETS. Do not
  // retain validators or encoding metadata that describe that old body.
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.delete('content-md5');
  headers.delete('digest');
  headers.set('cache-control', 'no-store');
  return new Response(content
    .replace('__NARADA_AGENT_WEB_UI_CONFIG__', serializeHtmlJson(uiConfig ?? {}))
    .replace('__NARADA_OPERATOR_CONSOLE_CONFIG__', serializeHtmlJson(consoleConfig)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isDocumentPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname === `${prefix}/` || (pathname.startsWith(`${prefix}/`) && !hasFileExtension(pathname) && !pathname.includes('/assets/'));
}

function hasFileExtension(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

function serializeHtmlJson(value: unknown): string {
  const serialized = JSON.stringify(value) ?? '{}';
  return serialized
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function refusal(code: string) {
  return { status: 'refused', code };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function objectStringRecord(value: unknown): Record<string, string> | undefined {
  const record = objectRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).map(([key, next]) => [key, String(next)]));
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function base64ToBytes(value: string): Uint8Array {
  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: { from(value: string, encoding: 'base64'): Uint8Array } }).Buffer;
  if (bufferCtor) return bufferCtor.from(value, 'base64');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
