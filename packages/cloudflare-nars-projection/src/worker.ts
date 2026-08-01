import {
  createCloudflareNarsAuthorityService,
  createCloudflareNarsConfiguredRuntimeExecutor,
  createCloudflareNarsRemoteAccessRecord,
  createCloudflareNarsProjectionWorkerService,
  projectedEventMatchesView,
  validateProjectionCredential,
  type CloudflareNarsAuthorityWorkerState,
  type CloudflareNarsAuthorityRuntimeExecutor,
  type CloudflareNarsProjectionIntent,
  type CloudflareNarsRemoteAccessRecord,
  type CloudflareNarsProjectionWorkerState,
  type CloudflareNarsAuthorityEvent,
  type ProjectedEvent,
} from './index.js';
import type { CloudflareNarsRuntimeEnvironment } from './cloudflare-runtime-executor.js';
import {
  createCloudflareNarsWorkspaceDirectoryService,
  handleCloudflareNarsWorkspaceDirectoryRequest,
  NarsWorkspaceDirectory,
  type CloudflareNarsWorkspaceDirectoryService,
} from './workspace-directory.js';
import {
  OPERATOR_CONSOLE_PATH,
} from '@narada2/operator-console-contract';
import type {
  OperatorConsoleHttpRouteParityEntry,
  OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';
import { renderCloudflareWorkspacePage } from './cloudflare-workspace-page.js';
import { handleCloudflareHostFleetRequest, isCloudflareHostFleetPath } from './cloudflare-host-fleet.js';

export interface CloudflareNarsProjectionWorkerEnv {
  [binding: string]: unknown;
  ASSETS?: { fetch(request: Request): Promise<Response> | Response };
  NARS_PROJECTION_STATE?: DurableObjectNamespaceLike;
  NARS_WORKSPACE_DIRECTORY?: DurableObjectNamespaceLike;
  INTELLIGENCE_REGISTRY_DB?: CloudflareNarsRuntimeEnvironment['INTELLIGENCE_REGISTRY_DB'];
  AI?: CloudflareNarsRuntimeEnvironment['AI'];
  NARS_OUTBOUND_PROVIDER_ENABLED?: CloudflareNarsRuntimeEnvironment['NARS_OUTBOUND_PROVIDER_ENABLED'];
  NARS_AUTHORITY_REQUIRE_CREDENTIAL?: string | boolean;
  OPERATOR_CONSOLE_GATEWAY_URL?: string;
  OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN?: string;
  OPERATOR_CONSOLE_GATEWAY_TOKEN?: string;
  OPERATOR_CONSOLE_GATEWAY_TRANSPORT?: string;
  OPERATOR_CONSOLE_GATEWAY?: CloudflareNarsOperatorConsoleGatewayBinding;
  OPERATOR_CONSOLE_GATEWAY_NETWORK?: CloudflareNarsOperatorConsoleGatewayNetworkBinding;
  OPERATOR_CONSOLE_GATEWAY_TCP_HOST?: string;
  OPERATOR_CONSOLE_GATEWAY_TCP_PORT?: string | number;
  NARADA_OPERATOR_CONSOLE_SHARED_SECRET?: string;
  OPERATOR_CONSOLE_GATEWAY_TIMEOUT_MS?: string | number;
  NARADA_HOST_FLEET_REGISTRY?: string;
  NARADA_HOST_FLEET_UI_API_BASE_PATH?: string;
  NARADA_HOST_FLEET_UI_ROUTE_SHAPE?: string;
  NARADA_HOST_FLEET_OBSERVABILITY?: string;
}

export interface CloudflareNarsOperatorConsoleGatewayBinding {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export interface CloudflareNarsOperatorConsoleTcpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close?(): void;
}

export interface CloudflareNarsOperatorConsoleGatewayNetworkBinding {
  connect(address: string | { hostname: string; port: number }): Promise<CloudflareNarsOperatorConsoleTcpSocket>;
}

export interface NarsProjectionStateOptions {
  authority_runtime_executor?: CloudflareNarsAuthorityRuntimeExecutor;
  require_authority_credential?: boolean;
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
  accept(options?: { allowHalfOpen?: boolean }): void;
  serializeAttachment?(attachment: unknown): void;
  deserializeAttachment?(): unknown;
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
  blockConcurrencyWhile?(callback: () => Promise<void> | void): Promise<void> | void;
  acceptWebSocket?(socket: WorkerWebSocket): void;
  getWebSockets?(): WorkerWebSocket[];
  waitUntil?(promise: Promise<unknown>): void;
}

export interface CloudflareNarsProjectionWorkerOptions {
  service?: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  authority_service?: ReturnType<typeof createCloudflareNarsAuthorityService>;
  authority_runtime_executor?: CloudflareNarsAuthorityRuntimeExecutor;
  workspace_directory_service?: CloudflareNarsWorkspaceDirectoryService;
  now?: () => string;
  require_authority_credential?: boolean;
  fetch_fn?: typeof fetch;
  require_operator_console_secret?: boolean;
  host_fleet_observation_sink?: (observation: import('./cloudflare-host-fleet.js').CloudflareHostFleetRequestObservation) => void;
}

export function createCloudflareNarsProjectionWorker(options: CloudflareNarsProjectionWorkerOptions = {}) {
  const service = options.service ?? createCloudflareNarsProjectionWorkerService();
  let authorityService = options.authority_service ?? null;
  const resolveAuthorityService = (env: CloudflareNarsProjectionWorkerEnv) => {
    if (!authorityService) authorityService = createCloudflareNarsAuthorityService({
      runtime_executor: options.authority_runtime_executor ?? createCloudflareNarsConfiguredRuntimeExecutor(env),
    });
    return authorityService;
  };
  const workspaceDirectory = options.workspace_directory_service ?? createCloudflareNarsWorkspaceDirectoryService();
  const now = options.now ?? (() => new Date().toISOString());
  const fetchFn = options.fetch_fn ?? fetch;
  return {
    async fetch(request: Request, env: CloudflareNarsProjectionWorkerEnv = {}): Promise<Response> {
      const url = new URL(request.url);
      const path = trimPath(url.pathname);
      const directProjectionEntry = url.pathname === '/' && url.searchParams.has('cloudflare_projection_id');
      if (isOperatorConsoleAuthPath(url.pathname)) {
        return handleOperatorConsoleAuth(request, env);
      }
      if (isCloudflareHostFleetPath(url.pathname)) {
        const secretFailure = await authorizeOperatorConsoleSecret(request, env, options);
        if (secretFailure) return secretFailure;
        const response = await handleCloudflareHostFleetRequest(request, env, now, fetchFn, {
          observe_request: options.host_fleet_observation_sink
            ?? (env.NARADA_HOST_FLEET_OBSERVABILITY === 'log'
              ? (observation) => console.log(JSON.stringify({ event: 'host_fleet_gateway_observation', ...observation }))
              : undefined),
        });
        if (response) return response;
      }
      if (isOperatorConsolePath(url.pathname) || (url.pathname === '/' && !directProjectionEntry && (operatorConsoleGatewayConfigured(env) || operatorConsoleSharedSecretRequired(env, options)))) {
        const secretFailure = await authorizeOperatorConsoleSecret(request, env, options);
        if (secretFailure) return secretFailure;
        if (isOperatorConsoleApiPath(url.pathname)) {
          return proxyAdmittedOperatorWorkspaceRoute(request, env, fetchFn, now);
        }
      }
      if (operatorConsoleGatewayConfigured(env)
        && (isPotentialOperatorWorkspaceRoute(url.pathname) || isOperatorConsoleGatewayPath(url.pathname))) {
        const secretFailure = await authorizeOperatorConsoleSecret(request, env, options);
        if (secretFailure) return secretFailure;
        return proxyAdmittedOperatorWorkspaceRoute(request, env, fetchFn, now);
      }
      if (!path.startsWith('api/nars/')) return serveStaticAsset(request, env, workspaceDirectory, now, fetchFn);
      if (request.method === 'OPTIONS') return corsResponse();
      if (path === 'api/nars/operator-console/routes' || path === 'api/nars/operator-console/health') {
        const secretFailure = await authorizeOperatorConsoleSecret(request, env, options);
        if (secretFailure) return secretFailure;
      }
      if (path === 'api/nars/operator-console/routes' && request.method === 'GET') {
        return readOperatorConsoleRouteDirectory(request, env, fetchFn, now);
      }
      if (path === 'api/nars/operator-console/health' && request.method === 'GET') {
        return readOperatorConsoleGatewayHealth(request, env, fetchFn, now);
      }
      if (request.method === 'GET' && path === 'api/nars/assets/manifest') {
        return serveAssetManifest(request, env);
      }
      if (request.method === 'GET' && path === 'api/nars/authority/health') {
        const authorityCredentialFailure = authorizeAuthorityCredential({ request, env, options });
        if (authorityCredentialFailure) return authorityCredentialFailure;
        const authority = resolveAuthorityService(env);
        return json({
          schema: 'narada.cloudflare_nars_authority.service_health.v1',
          status: authority.execution_availability === 'available' ? 'healthy' : 'degraded',
          execution: authority.execution_mode,
          execution_availability: authority.execution_availability,
          code: authority.execution_unavailable_code,
        });
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
        const authorityCredentialFailure = authorizeAuthorityCredential({ request, env, options });
        if (authorityCredentialFailure) return authorityCredentialFailure;
        const authorityResponse = await routeAuthorityRequestToDurableObject(request, env, path);
        if (authorityResponse) return authorityResponse;
        const durableResponse = await routeProjectionRequestToDurableObject(request, env, path);
        if (durableResponse) return durableResponse;
      }
      if (request.method === 'POST' && path === 'api/nars/authority/sessions') {
        const authorityCredentialFailure = authorizeAuthorityCredential({ request, env, options });
        if (authorityCredentialFailure) return authorityCredentialFailure;
        const body = await readJson(request);
        return json(resolveAuthorityService(env).createSession({
          session_id: stringOrUndefined(body.session_id),
          site_id: stringOrUndefined(body.site_id) ?? '',
          agent_id: stringOrUndefined(body.agent_id) ?? '',
          principal_id: stringOrUndefined(body.principal_id),
          authority_credential_fingerprint: requireBrowserToken(request),
          user_site_id: stringOrUndefined(body.user_site_id),
          host_site_id: stringOrUndefined(body.host_site_id),
          mcp_fabric: objectRecord(body.mcp_fabric),
        }, now()));
      }
      const authority = authorityRoute(request);
      if (authority) {
        const authorityCredentialFailure = authorizeAuthorityCredential({ request, env, options, authority_service: resolveAuthorityService(env) });
        if (authorityCredentialFailure) return authorityCredentialFailure;
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
          request_id: stringOrUndefined(body.request_id),
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
  private projectionService: ReturnType<typeof createCloudflareNarsProjectionWorkerService> | null = null;
  private authorityService: ReturnType<typeof createCloudflareNarsAuthorityService> | null = null;
  private worker: ReturnType<typeof createCloudflareNarsProjectionWorker> | null = null;
  private initialization: Promise<void> | null = null;
  private persistence: Promise<void> = Promise.resolve();

  constructor(
    private readonly state?: DurableObjectStateLike,
    private readonly env?: CloudflareNarsProjectionWorkerEnv,
    private readonly options: NarsProjectionStateOptions = {},
  ) {
    this.restoreAcceptedSockets();
  }

  private restoreAcceptedSockets(): void {
    const acceptedSockets = this.state?.getWebSockets?.() ?? [];
    let restoredProjectionCount = 0;
    let restoredAuthorityCount = 0;
    for (const socket of acceptedSockets) {
      const attachment = objectRecord(socket.deserializeAttachment?.());
      if (attachment?.kind === 'projection'
        && typeof attachment.projectionId === 'string'
        && typeof attachment.view === 'string') {
        if (![...this.sockets].some((subscriber) => subscriber.socket === socket)) {
          this.sockets.add({ projectionId: attachment.projectionId, view: attachment.view, socket });
          restoredProjectionCount += 1;
        }
      } else if (attachment?.kind === 'authority' && typeof attachment.sessionId === 'string') {
        if (![...this.authoritySockets].some((subscriber) => subscriber.socket === socket)) {
          this.authoritySockets.add({ sessionId: attachment.sessionId, socket });
          restoredAuthorityCount += 1;
        }
      }
    }
    if (acceptedSockets.length > 0) {
      console.log(JSON.stringify({
        event: 'projection_websocket_registry_restored',
        accepted_socket_count: acceptedSockets.length,
        restored_projection_count: restoredProjectionCount,
        restored_authority_count: restoredAuthorityCount,
        projection_socket_count: this.sockets.size,
        authority_socket_count: this.authoritySockets.size,
      }));
    }
  }

  webSocketMessage(socket: WorkerWebSocket, message: string | ArrayBuffer): void {
    const attachment = objectRecord(socket.deserializeAttachment?.());
    if (attachment?.kind !== 'projection' || typeof attachment.projectionId !== 'string') return;
    this.handleProjectionWebSocketMessage(socket, attachment.projectionId, message);
  }

  webSocketClose(socket: WorkerWebSocket, code?: number, reason?: string, wasClean?: boolean): void {
    console.log(JSON.stringify({
      event: 'projection_websocket_closed',
      code: code ?? null,
      reason: reason ?? null,
      was_clean: wasClean ?? null,
      attachment: objectRecord(socket.deserializeAttachment?.()),
      accepted_socket_count: this.state?.getWebSockets?.().length ?? null,
    }));
    this.sockets.forEach((subscriber) => {
      if (subscriber.socket === socket) this.sockets.delete(subscriber);
    });
    this.authoritySockets.forEach((subscriber) => {
      if (subscriber.socket === socket) this.authoritySockets.delete(subscriber);
    });
  }

  webSocketError(socket: WorkerWebSocket): void {
    console.log(JSON.stringify({
      event: 'projection_websocket_error',
      attachment: objectRecord(socket.deserializeAttachment?.()),
      accepted_socket_count: this.state?.getWebSockets?.().length ?? null,
    }));
    this.webSocketClose(socket);
  }

  private acceptWebSocket(socket: WorkerWebSocket): boolean {
    if (this.state?.acceptWebSocket) {
      this.state.acceptWebSocket(socket);
      return true;
    }
    socket.accept();
    return false;
  }

  private async persistState(): Promise<void> {
    if (!this.state?.storage || !this.projectionService || !this.authorityService) return;
    const write = this.persistence.then(async () => {
      await Promise.all([
        this.state!.storage.put(NarsProjectionState.storageKey, this.projectionService!.snapshot()),
        this.state!.storage.put(NarsProjectionState.authorityStorageKey, this.authorityService!.snapshot()),
      ]);
    });
    this.persistence = write.catch(() => {});
    await write;
  }

  private async broadcastAuthorityEvent(event: CloudflareNarsAuthorityEvent): Promise<void> {
    this.restoreAcceptedSockets();
    for (const subscriber of [...this.authoritySockets]) {
      if (subscriber.sessionId !== event.session_id) continue;
      try {
        subscriber.socket.send(JSON.stringify(event.payload));
      } catch {
        this.authoritySockets.delete(subscriber);
      }
    }
  }

  private async initialize(): Promise<void> {
    const initialize = async () => {
      const stored = await this.state!.storage.get<CloudflareNarsProjectionWorkerState>(NarsProjectionState.storageKey);
      const storedAuthority = await this.state!.storage.get<CloudflareNarsAuthorityWorkerState>(NarsProjectionState.authorityStorageKey);
      this.projectionService = createCloudflareNarsProjectionWorkerService({ initial_state: stored ?? null });
      this.authorityService = createCloudflareNarsAuthorityService({
        initial_state: storedAuthority ?? null,
        runtime_executor: this.options.authority_runtime_executor ?? createCloudflareNarsConfiguredRuntimeExecutor(this.env ?? {}),
        on_event: async (event) => {
          await this.broadcastAuthorityEvent(event);
          await this.persistState();
        },
      });
      this.worker = createCloudflareNarsProjectionWorker({
        service: this.projectionService,
        authority_service: this.authorityService,
        authority_runtime_executor: this.options.authority_runtime_executor,
        require_authority_credential: this.options.require_authority_credential,
      });
    };
    if (this.state?.blockConcurrencyWhile) {
      await this.state.blockConcurrencyWhile(initialize);
    } else {
      await initialize();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initialize().catch((error) => {
        this.initialization = null;
        throw error;
      });
    }
    await this.initialization;
  }

  private handleProjectionWebSocketMessage(socket: WorkerWebSocket, projectionId: string, message: string | ArrayBuffer): void {
    try {
      const parsed = typeof message === 'string'
        ? JSON.parse(message)
        : JSON.parse(new TextDecoder().decode(message));
      const record = objectRecord(parsed);
      if (record?.event !== 'websocket_heartbeat') return;
      socket.send(JSON.stringify({
        event: 'websocket_heartbeat_ack',
        transport: 'cloudflare_projection_websocket',
        projection_id: projectionId,
      }));
    } catch {
      // Ignore non-JSON application frames; projection events are server-originated.
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.state?.storage) {
      return this.fallbackWorker.fetch(request, {});
    }
    await this.ensureInitialized();
    const service = this.projectionService!;
    const authorityService = this.authorityService!;
    const authority = authorityRoute(request);
    if (authority && request.method === 'GET' && authority.suffix === 'events/websocket') {
      const authorityCredentialFailure = authorizeAuthorityCredential({
        request,
        env: this.env ?? {},
        options: { require_authority_credential: this.options.require_authority_credential },
        authority_service: authorityService,
      });
      if (authorityCredentialFailure) return authorityCredentialFailure;
      return this.openAuthorityEventWebSocket({ request, sessionId: authority.sessionId, service: authorityService });
    }
    const route = projectionRoute(request);
    if (route && request.method === 'GET' && route.suffix === 'events/stream') {
      return this.openEventStream({ request, projectionId: route.projectionId, service });
    }
    if (route && request.method === 'GET' && route.suffix === 'events/websocket') {
      return this.openEventWebSocket({ request, projectionId: route.projectionId, service });
    }
    const response = await this.worker!.fetch(request, this.env ?? {});
    await this.persistState();
    if (authority && request.method === 'DELETE' && authority.suffix === '') {
      await this.closeAuthoritySockets(authority.sessionId, 4000, 'session_revoked');
    }
    if (authority && request.method === 'POST' && authority.suffix === 'input') {
      const body = await response.clone().json().catch(() => null);
      if (body?.status === 'admitted' && body?.method === 'session.close') {
        await this.closeAuthoritySockets(authority.sessionId, 4001, 'session_closed');
      }
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
    this.restoreAcceptedSockets();
    const eventPayload = objectRecord(event.payload);
    if (eventPayload?.event === 'user_message') {
      console.log(JSON.stringify({
        event: 'projection_websocket_broadcast',
        projection_id: event.projection_id,
        event_sequence: event.event_sequence ?? null,
        projection_socket_count: this.sockets.size,
        accepted_socket_count: this.state?.getWebSockets?.().length ?? null,
      }));
    }
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
    this.restoreAcceptedSockets();
    console.log(JSON.stringify({
      event: 'projection_websocket_revocation_broadcast',
      projection_id: projectionId,
      projection_socket_count: this.sockets.size,
      accepted_socket_count: this.state?.getWebSockets?.().length ?? null,
    }));
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
    const hibernating = this.acceptWebSocket(server);
    server.serializeAttachment?.({ kind: 'projection', projectionId: args.projectionId, view });
    this.sockets.add(subscriber);
    console.log(JSON.stringify({
      event: 'projection_websocket_opened',
      projection_id: args.projectionId,
      view,
      hibernating,
      projection_socket_count: this.sockets.size,
      accepted_socket_count: this.state?.getWebSockets?.().length ?? null,
    }));
    if (!hibernating) {
      server.addEventListener('close', () => this.sockets.delete(subscriber));
      server.addEventListener('error', () => this.sockets.delete(subscriber));
      server.addEventListener('message', (event: MessageEvent<unknown>) => {
        this.handleProjectionWebSocketMessage(server, args.projectionId, event.data as string | ArrayBuffer);
      });
    }
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
    const hibernating = this.acceptWebSocket(server);
    server.serializeAttachment?.({ kind: 'authority', sessionId: args.sessionId });
    this.authoritySockets.add(subscriber);
    if (!hibernating) {
      server.addEventListener('close', () => this.authoritySockets.delete(subscriber));
      server.addEventListener('error', () => this.authoritySockets.delete(subscriber));
    }
    server.send(JSON.stringify({
      event: 'websocket_connected',
      transport: 'cloudflare_authority_websocket',
      session_id: args.sessionId,
      cursor: read.cursor ?? null,
    }));
    for (const entry of read.events ?? []) server.send(JSON.stringify(entry.payload));
    if (read.terminal) {
      try {
        server.close(4000, 'session_revoked');
      } finally {
        this.authoritySockets.delete(subscriber);
      }
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WorkerWebSocket });
  }

  private async closeAuthoritySockets(sessionId: string, code: number, reason: string): Promise<void> {
    this.restoreAcceptedSockets();
    for (const subscriber of [...this.authoritySockets]) {
      if (subscriber.sessionId !== sessionId) continue;
      try {
        subscriber.socket.close(code, reason);
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

function authorityCredentialRequired(env: CloudflareNarsProjectionWorkerEnv, options: CloudflareNarsProjectionWorkerOptions): boolean {
  if (options.require_authority_credential != null) return options.require_authority_credential;
  const configured = env.NARS_AUTHORITY_REQUIRE_CREDENTIAL;
  return configured === true || configured === 'true';
}

function authorizeAuthorityCredential(args: {
  request: Request;
  env: CloudflareNarsProjectionWorkerEnv;
  options: CloudflareNarsProjectionWorkerOptions;
  authority_service?: ReturnType<typeof createCloudflareNarsAuthorityService> | null;
}): Response | null {
  const path = trimPath(new URL(args.request.url).pathname);
  const isAuthorityRoute = path === 'api/nars/authority/health'
    || path === 'api/nars/authority/sessions'
    || path.startsWith('api/nars/authority/sessions/');
  if (!isAuthorityRoute || !authorityCredentialRequired(args.env, args.options)) return null;
  const credential = requireBrowserToken(args.request);
  if (!credential) return json(refusal('authority_credential_required'), 401);
  const route = authorityRoute(args.request);
  if (route && args.authority_service) {
    const allowTerminalReplay = route.suffix === 'events' || route.suffix === 'events/websocket';
    const validation = args.authority_service.authorizeSessionCredential(route.sessionId, credential, { allow_terminal_replay: allowTerminalReplay });
    if (!validation.ok) return json(validation, validation.code === 'session_not_found' ? 404 : 403);
  }
  return null;
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
  return new Response(JSON.stringify(payload), { status, headers: withCorsHeaders({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }) });
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

function isOperatorConsolePath(pathname: string): boolean {
  return pathname === OPERATOR_CONSOLE_PATH || pathname.startsWith(`${OPERATOR_CONSOLE_PATH}/`);
}

const OPERATOR_CONSOLE_AUTH_PATH = '/auth/operator-console';
const OPERATOR_CONSOLE_LOGOUT_PATH = '/auth/operator-console/logout';
const OPERATOR_CONSOLE_SESSION_COOKIE = 'narada_operator_console_session';
const OPERATOR_CONSOLE_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function isOperatorConsoleAuthPath(pathname: string): boolean {
  return pathname === OPERATOR_CONSOLE_AUTH_PATH || pathname === OPERATOR_CONSOLE_LOGOUT_PATH;
}

const OPERATOR_CONSOLE_STATIC_DOCUMENT_PATHS = new Set([
  `${OPERATOR_CONSOLE_PATH}/agents`,
  `${OPERATOR_CONSOLE_PATH}/registry`,
  `${OPERATOR_CONSOLE_PATH}/registry/add`,
  `${OPERATOR_CONSOLE_PATH}/registry/manage`,
  `${OPERATOR_CONSOLE_PATH}/launch`,
  `${OPERATOR_CONSOLE_PATH}/onboarding`,
  `${OPERATOR_CONSOLE_PATH}/sessions`,
]);

function isOperatorConsoleEntryPath(pathname: string): boolean {
  return pathname === OPERATOR_CONSOLE_PATH || pathname === `${OPERATOR_CONSOLE_PATH}/`;
}

function isOperatorConsoleAssetPath(pathname: string): boolean {
  return pathname === `${OPERATOR_CONSOLE_PATH}/assets`
    || pathname.startsWith(`${OPERATOR_CONSOLE_PATH}/assets/`);
}

function isOperatorConsoleStaticDocumentPath(pathname: string): boolean {
  const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return OPERATOR_CONSOLE_STATIC_DOCUMENT_PATHS.has(normalizedPath);
}

function isOperatorConsoleApiPath(pathname: string): boolean {
  return pathname.includes(`${OPERATOR_CONSOLE_PATH}/`) && pathname.includes('/api/');
}

function isOperatorConsoleGatewayPath(pathname: string): boolean {
  return isOperatorConsolePath(pathname)
    && !isOperatorConsoleEntryPath(pathname)
    && !isOperatorConsoleAssetPath(pathname)
    && !isOperatorConsoleStaticDocumentPath(pathname);
}

function operatorConsoleSharedSecretRequired(
  env: CloudflareNarsProjectionWorkerEnv,
  options: CloudflareNarsProjectionWorkerOptions,
): boolean {
  if (options.require_operator_console_secret !== undefined) return options.require_operator_console_secret;
  return Boolean(env.NARADA_OPERATOR_CONSOLE_SHARED_SECRET?.trim()) || operatorConsoleGatewayConfigured(env);
}

function operatorConsoleGatewayTransport(env: CloudflareNarsProjectionWorkerEnv): 'public-tunnel' | 'vpc-service' | null {
  const value = env.OPERATOR_CONSOLE_GATEWAY_TRANSPORT?.trim() || 'public-tunnel';
  return value === 'public-tunnel' || value === 'vpc-service' ? value : null;
}

function operatorConsoleGatewayBinding(env: CloudflareNarsProjectionWorkerEnv): CloudflareNarsOperatorConsoleGatewayBinding | null {
  const binding = env.OPERATOR_CONSOLE_GATEWAY;
  return binding && typeof binding.fetch === 'function' ? binding : null;
}

function operatorConsoleGatewayNetwork(env: CloudflareNarsProjectionWorkerEnv): CloudflareNarsOperatorConsoleGatewayNetworkBinding | null {
  const binding = env.OPERATOR_CONSOLE_GATEWAY_NETWORK;
  return binding && typeof binding.connect === 'function' ? binding : null;
}

function operatorConsoleGatewayTransportHealth(env: CloudflareNarsProjectionWorkerEnv): {
  status: 'ready' | 'degraded' | 'unconfigured';
  transport: 'public-tunnel' | 'vpc-service' | null;
  websocket: {
    status: 'ready' | 'unavailable' | 'not_configured';
    transport: 'gateway-websocket-upgrade' | 'vpc-network-tcp' | null;
    refusal_code?: string;
  };
} {
  const configuration = operatorConsoleGatewayConfiguration(env);
  if (!configuration) {
    return {
      status: 'unconfigured',
      transport: null,
      websocket: { status: 'not_configured', transport: null, refusal_code: 'operator_console_gateway_not_configured_or_pinned' },
    };
  }
  if (configuration.transport === 'vpc-service') {
    const available = Boolean(operatorConsoleGatewayNetwork(env));
    return {
      status: available ? 'ready' : 'degraded',
      transport: configuration.transport,
      websocket: available
        ? { status: 'ready', transport: 'vpc-network-tcp' }
        : { status: 'unavailable', transport: 'vpc-network-tcp', refusal_code: 'operator_console_gateway_network_binding_unavailable' },
    };
  }
  return {
    status: 'ready',
    transport: configuration.transport,
    websocket: { status: 'ready', transport: 'gateway-websocket-upgrade' },
  };
}

function operatorConsoleGatewayConfiguration(
  env: CloudflareNarsProjectionWorkerEnv,
): { baseUrl: string; token: string; transport: 'public-tunnel' | 'vpc-service' } | null {
  const rawUrl = env.OPERATOR_CONSOLE_GATEWAY_URL?.trim();
  const token = env.OPERATOR_CONSOLE_GATEWAY_TOKEN?.trim();
  const rawPin = env.OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN?.trim();
  const transport = operatorConsoleGatewayTransport(env);
  if (!rawUrl || !token || !rawPin) return null;
  if (!transport || (transport === 'vpc-service' && !operatorConsoleGatewayBinding(env))) return null;
  try {
    const target = new URL(rawUrl);
    const pin = new URL(rawPin);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
    if (target.username || target.password || target.search || target.hash || target.pathname !== '/') return null;
    if (pin.username || pin.password || pin.search || pin.hash || pin.pathname !== '/') return null;
    if (target.origin !== pin.origin) return null;
    if (transport === 'public-tunnel') {
      if (target.protocol !== 'https:' || pin.protocol !== 'https:') return null;
    }
    return { baseUrl: target.toString().replace(/\/$/, ''), token, transport };
  } catch {
    return null;
  }
}

function operatorConsoleGatewayConfigured(env: CloudflareNarsProjectionWorkerEnv): boolean {
  return Boolean(operatorConsoleGatewayConfiguration(env));
}

async function authorizeOperatorConsoleSecret(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  options: CloudflareNarsProjectionWorkerOptions,
): Promise<Response | null> {
  if (!operatorConsoleSharedSecretRequired(env, options)) return null;
  const expected = env.NARADA_OPERATOR_CONSOLE_SHARED_SECRET?.trim();
  if (!expected) return json(refusal('operator_console_shared_secret_not_configured'), 503);
  const presented = operatorConsoleSecretFromRequest(request);
  if (presented && await sharedSecretEquals(presented, expected)) return null;
  const pathname = new URL(request.url).pathname;
  if (request.method === 'GET' && !pathname.startsWith('/api/') && !isOperatorConsoleApiPath(pathname)) {
    return redirectToOperatorConsoleLogin(request);
  }
  const headers = withCorsHeaders({
    'www-authenticate': 'Bearer realm="narada-operator-console"',
  });
  return new Response(JSON.stringify(refusal('operator_console_shared_secret_required')), {
    status: 401,
    headers,
  });
}

function operatorConsoleSecretFromRequest(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  for (const item of cookies) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== OPERATOR_CONSOLE_SESSION_COOKIE) continue;
    const raw = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

async function sharedSecretEquals(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function redirectToOperatorConsoleLogin(request: Request): Response {
  const loginUrl = new URL(OPERATOR_CONSOLE_AUTH_PATH, request.url);
  loginUrl.searchParams.set('return_to', operatorConsoleReturnPath(request.url));
  return new Response(null, {
    status: 303,
    headers: withCorsHeaders({ location: loginUrl.toString(), 'cache-control': 'no-store' }),
  });
}

function operatorConsoleReturnPath(value: string): string {
  try {
    const parsed = new URL(value, 'https://narada.invalid');
    const path = `${parsed.pathname}${parsed.search}`;
    return path.startsWith('/') && !path.startsWith('//') && path !== OPERATOR_CONSOLE_AUTH_PATH
      ? path
      : `${OPERATOR_CONSOLE_PATH}/agents`;
  } catch {
    return `${OPERATOR_CONSOLE_PATH}/agents`;
  }
}

async function handleOperatorConsoleAuth(request: Request, env: CloudflareNarsProjectionWorkerEnv): Promise<Response> {
  if (new URL(request.url).pathname === OPERATOR_CONSOLE_LOGOUT_PATH) {
    if (request.method !== 'POST') return json(refusal('operator_console_logout_method_not_allowed'), 405);
    const headers = withCorsHeaders({
      location: OPERATOR_CONSOLE_AUTH_PATH,
      'cache-control': 'no-store',
      'set-cookie': `${OPERATOR_CONSOLE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    });
    if ((request.headers.get('accept') ?? '').includes('application/json')) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
    }
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'GET') return operatorConsoleLoginPage(request);
  if (request.method !== 'POST') return json(refusal('operator_console_auth_method_not_allowed'), 405);
  const expected = env.NARADA_OPERATOR_CONSOLE_SHARED_SECRET?.trim();
  if (!expected) return json(refusal('operator_console_shared_secret_not_configured'), 503);
  const body = await readOperatorConsoleAuthBody(request);
  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  if (!secret || !(await sharedSecretEquals(secret, expected))) {
    return json(refusal('operator_console_shared_secret_invalid'), 401);
  }
  const requestedReturnTo = typeof body.return_to === 'string' && body.return_to.trim()
    ? body.return_to
    : new URL(request.url).searchParams.get('return_to') ?? `${OPERATOR_CONSOLE_PATH}/agents`;
  const returnTo = operatorConsoleReturnPath(requestedReturnTo);
  const headers = withCorsHeaders({
    location: returnTo,
    'cache-control': 'no-store',
    'set-cookie': `${OPERATOR_CONSOLE_SESSION_COOKIE}=${encodeURIComponent(secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${OPERATOR_CONSOLE_SESSION_MAX_AGE_SECONDS}`,
  });
  if ((request.headers.get('accept') ?? '').includes('application/json')) {
    return new Response(JSON.stringify({ status: 'ok', return_to: returnTo }), { status: 200, headers });
  }
  return new Response(null, { status: 303, headers });
}

async function readOperatorConsoleAuthBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 64 * 1024) return {};
  const raw = (await request.text()).slice(0, 64 * 1024);
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try { return objectRecord(JSON.parse(raw)) ?? {}; } catch { return {}; }
  }
  const params = new URLSearchParams(raw);
  return { secret: params.get('secret') ?? '', return_to: params.get('return_to') ?? '' };
}

function operatorConsoleLoginPage(request: Request): Response {
  const returnTo = operatorConsoleReturnPath(new URL(request.url).searchParams.get('return_to') ?? `${OPERATOR_CONSOLE_PATH}/agents`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Narada Operator Console</title><style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:2rem;color:#202124}form{display:grid;gap:1rem}input,button{font:inherit;padding:.7rem}button{cursor:pointer}</style></head><body><main><h1>Narada Operator Console</h1><p>Enter the shared operator secret to continue.</p><form method="post" action="${OPERATOR_CONSOLE_AUTH_PATH}"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"><label for="secret">Shared secret</label><input id="secret" name="secret" type="password" autocomplete="current-password" required autofocus><button type="submit">Continue</button></form></main></body></html>`;
  return new Response(html, { status: 200, headers: withCorsHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }) });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function operatorConsoleGatewayTimeoutMs(env: CloudflareNarsProjectionWorkerEnv): number {
  const value = Number(env.OPERATOR_CONSOLE_GATEWAY_TIMEOUT_MS ?? 30_000);
  return Number.isInteger(value) && value >= 100 && value <= 120_000 ? value : 30_000;
}

async function fetchOperatorConsoleGateway(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
  pathname: string,
): Promise<Response> {
  const configuration = operatorConsoleGatewayConfiguration(env);
  if (!configuration) return json(refusal('operator_console_gateway_not_configured_or_pinned'), 503);
  const gatewayBinding = configuration.transport === 'vpc-service' ? operatorConsoleGatewayBinding(env) : null;
  if (configuration.transport === 'vpc-service' && !gatewayBinding) return json(refusal('operator_console_gateway_vpc_binding_unavailable'), 503);
  const sourceUrl = new URL(request.url);
  const target = new URL(pathname + sourceUrl.search, `${configuration.baseUrl}/`);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'if-none-match', 'if-modified-since', 'cache-control', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-narada-operator-console-bridge-token', configuration.token);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(operatorConsoleGatewayTimeoutMs(env)),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Buffer Console mutation bodies so the same adapter works in Workers and
    // Node-based test/gateway fetch implementations without stream-duplex quirks.
    init.body = await request.arrayBuffer();
    // The VPC service hop must receive an explicitly framed request body. A
    // browser POST can arrive at the Worker without a reusable content-length
    // header, and leaving the buffered body to transport-specific inference
    // can leave the loopback gateway waiting for the request terminator.
    headers.set('content-length', String((init.body as ArrayBuffer).byteLength));
  }
  try {
    // Passing one fully formed Request keeps the body and method together for
    // service bindings. Some bindings accept URL + init for GET but do not
    // reliably preserve POST framing across the VPC boundary.
    const upstreamRequest = new Request(target, init);
    return await (gatewayBinding ? gatewayBinding.fetch(upstreamRequest) : fetchFn(upstreamRequest));
  } catch {
    return json(refusal('operator_console_gateway_unavailable'), 503);
  }
}

async function proxyOperatorConsoleRequest(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
  _now: () => string,
): Promise<Response> {
  const upstream = await fetchOperatorConsoleGateway(request, env, fetchFn, new URL(request.url).pathname);
  if (upstream.headers.get('content-type')?.includes('application/json')) {
    const body = await upstream.text();
    let parsed = false;
    let payload: unknown;
    try {
      payload = JSON.parse(body);
      parsed = true;
    } catch {
      // Preserve a malformed upstream body below; the gateway still owns its
      // response contract and the Worker must not invent a JSON payload.
    }
    if (parsed) {
      if (!upstream.ok) return json(redactOperatorConsoleRemotePayload(payload), upstream.status);
      const headers = new Headers(upstream.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.delete('etag');
      headers.delete('set-cookie');
      headers.set('cache-control', 'no-store');
      return new Response(JSON.stringify(redactOperatorConsoleRemotePayload(payload)), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: withCorsHeaders(headers),
      });
    }
    if (!upstream.ok) return json(refusal('operator_console_gateway_request_failed'), upstream.status);
    const headers = new Headers(upstream.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.delete('set-cookie');
    headers.set('cache-control', 'no-store');
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: withCorsHeaders(headers),
    });
  }
  if (upstream.ok && isHtmlResponse(upstream) && isOperatorConsoleSessionDocumentPath(new URL(request.url).pathname)) {
    const body = await upstream.text();
    const rewritten = rewriteOperatorConsoleSessionDocument(request, body);
    if (!rewritten.ok) return json(refusal('operator_console_session_config_unavailable'), 502);
    const headers = new Headers(upstream.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.delete('set-cookie');
    headers.set('cache-control', 'no-store');
    return new Response(rewritten.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: withCorsHeaders(headers),
    });
  }
  const headers = new Headers(upstream.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.delete('set-cookie');
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: withCorsHeaders(headers),
  });
}

function isOperatorConsoleSessionDocumentPath(pathname: string): boolean {
  return /^\/sessions\/[^/]+\/?$/.test(pathname);
}

function rewriteOperatorConsoleSessionDocument(request: Request, body: string): { ok: true; body: string } | { ok: false } {
  const script = body.match(/(<script\b(?=[^>]*\bid=["']nars-config["'])[^>]*>)([\s\S]*?)(<\/script>)/i);
  if (!script) return { ok: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(script[2]?.trim() ?? '');
  } catch {
    return { ok: false };
  }
  const config = objectRecord(parsed);
  if (!config) return { ok: false };
  const sourceUrl = new URL(request.url);
  const sessionPath = sourceUrl.pathname.replace(/\/+$/, '');
  const eventEndpoint = new URL(sourceUrl.origin);
  eventEndpoint.protocol = sourceUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  eventEndpoint.pathname = `${sessionPath}/events`;
  eventEndpoint.search = '';
  const inputEndpoint = new URL(sourceUrl.origin);
  inputEndpoint.pathname = `${sessionPath}/input`;
  inputEndpoint.search = '';
  const healthEndpoint = new URL(sourceUrl.origin);
  healthEndpoint.pathname = `${sessionPath}/api/health`;
  healthEndpoint.search = '';
  const rewrittenConfig: Record<string, unknown> = {
    ...config,
    eventEndpoint: eventEndpoint.toString(),
    inputEndpoint: inputEndpoint.toString(),
    healthEndpoint: healthEndpoint.toString(),
  };
  if ('event_endpoint' in config) rewrittenConfig.event_endpoint = eventEndpoint.toString();
  if ('input_endpoint' in config) rewrittenConfig.input_endpoint = inputEndpoint.toString();
  if ('health_endpoint' in config) rewrittenConfig.health_endpoint = healthEndpoint.toString();
  return {
    ok: true,
    body: body.replace(script[0], `${script[1]}${serializeHtmlJson(rewrittenConfig)}${script[3]}`),
  };
}

const OPERATOR_CONSOLE_REMOTE_REDACTED_VALUE = '[local value withheld]';
const OPERATOR_CONSOLE_REMOTE_SENSITIVE_KEYS = new Set([
  'root',
  'siteroot',
  'registrypath',
  'statepath',
  'sourcepath',
  'targeturl',
  'healthurl',
  'routerurl',
  'gatewayurl',
  'logpath',
  'tunnellogpath',
  'tokenfile',
]);

function isOperatorConsoleRemoteSensitiveKey(key: string): boolean {
  return OPERATOR_CONSOLE_REMOTE_SENSITIVE_KEYS.has(key.replaceAll('_', '').replaceAll('-', '').toLowerCase());
}

function isOperatorConsoleRemoteLocalString(value: string): boolean {
  return /(?:^|[^a-z])[a-z]:[\\/]/i.test(value)
    || /^(?:\\\\|\/(?:Users|home|tmp|var|opt|mnt|ProgramData|data)(?:[\\/]|$))/i.test(value)
    || /(?:127\.0\.0\.1|localhost|operator-console\.internal)(?::\d+)?/i.test(value);
}

function redactOperatorConsoleRemotePayload(value: unknown, key?: string): unknown {
  if (key && isOperatorConsoleRemoteSensitiveKey(key)) {
    return value === null ? null : OPERATOR_CONSOLE_REMOTE_REDACTED_VALUE;
  }
  if (typeof value === 'string') return isOperatorConsoleRemoteLocalString(value) ? OPERATOR_CONSOLE_REMOTE_REDACTED_VALUE : value;
  if (Array.isArray(value)) return value.map((item) => redactOperatorConsoleRemotePayload(item));
  const record = objectRecord(value);
  if (!record) return value;
  return Object.fromEntries(Object.entries(record).map(([entryKey, entryValue]) => [
    entryKey,
    redactOperatorConsoleRemotePayload(entryValue, entryKey),
  ]));
}

async function proxyAdmittedOperatorWorkspaceRoute(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
  now: () => string,
): Promise<Response> {
  const directoryResponse = await readOperatorConsoleRouteDirectory(request, env, fetchFn, now);
  const directory = await directoryResponse.clone().json().catch(() => null);
  if (!directoryResponse.ok || !isWorkspaceRouteDirectory(directory)) return directoryResponse;
  const pathname = new URL(request.url).pathname;
  const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
  const parity = directory.httpRouteParity?.routes ?? [];
  const requestedMethod = request.method.toUpperCase();
  const matching = parity.filter((route) => route.disposition === 'proxy'
    && (route.method === requestedMethod || (requestedMethod === 'HEAD' && route.method === 'GET'))
    && matchesParityPath(route, pathname));
  if (upgrade) {
    const websocketRoute = matching.find((route) => route.protocol === 'websocket');
    return websocketRoute
      ? proxyOperatorConsoleWorkspaceWebSocket(request, env, fetchFn)
      : json(refusal('operator_console_workspace_route_not_admitted'), 404);
  }
  const httpRoute = matching.find((route) => route.protocol === 'http');
  if (!httpRoute) return json(refusal('operator_console_workspace_route_not_admitted'), 404);
  return proxyOperatorConsoleRequest(request, env, fetchFn, now);
}

function isPotentialOperatorWorkspaceRoute(pathname: string): boolean {
  return pathname.startsWith('/sessions/')
    || pathname.startsWith('/artifacts/')
    || pathname.startsWith('/sites/');
}

function matchesParityPath(route: OperatorConsoleHttpRouteParityEntry, pathname: string): boolean {
  try { return new RegExp(route.pattern).test(pathname); } catch { return false; }
}

async function proxyOperatorConsoleWorkspaceWebSocket(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
): Promise<Response> {
  const network = operatorConsoleGatewayNetwork(env);
  const configuration = operatorConsoleGatewayConfiguration(env);
  if (configuration?.transport === 'vpc-service') {
    return network
      ? proxyOperatorConsoleWorkspaceWebSocketViaTcp(request, env, network)
      : json(refusal('operator_console_gateway_network_binding_unavailable'), 503);
  }
  return proxyOperatorConsoleWorkspaceWebSocketViaHttp(request, env, fetchFn);
}

const OPERATOR_CONSOLE_WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPERATOR_CONSOLE_WEBSOCKET_MAX_FRAME_BYTES = 16 * 1024 * 1024;
const OPERATOR_CONSOLE_WEBSOCKET_MAX_HANDSHAKE_BYTES = 64 * 1024;

type OperatorConsoleTcpWebSocketFrame = {
  fin: boolean;
  opcode: number;
  payload: Uint8Array;
};

type OperatorConsoleTcpWebSocketParser = {
  buffer: Uint8Array;
  fragmentedOpcode: number | null;
  fragmentedPayload: Uint8Array[];
  fragmentedBytes: number;
};

async function proxyOperatorConsoleWorkspaceWebSocketViaTcp(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  network: CloudflareNarsOperatorConsoleGatewayNetworkBinding,
): Promise<Response> {
  const configuration = operatorConsoleGatewayConfiguration(env);
  if (!configuration) return json(refusal('operator_console_gateway_not_configured_or_pinned'), 503);
  const key = request.headers.get('sec-websocket-key');
  if (!key) return json(refusal('operator_console_websocket_key_required'), 400);
  const tcpPort = Number(env.OPERATOR_CONSOLE_GATEWAY_TCP_PORT ?? 61_730);
  const tcpHost = env.OPERATOR_CONSOLE_GATEWAY_TCP_HOST?.trim() || '127.0.0.1';
  if (!Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65_535 || !tcpHost || /[\s/]/u.test(tcpHost)) {
    return json(refusal('operator_console_gateway_tcp_address_invalid'), 503);
  }

  let socket: CloudflareNarsOperatorConsoleTcpSocket;
  try {
    socket = await readOperatorConsoleWithTimeout(
      network.connect({ hostname: tcpHost, port: tcpPort }),
      Number(env.OPERATOR_CONSOLE_GATEWAY_TIMEOUT_MS ?? 30_000),
    );
  } catch (error) {
    console.log(JSON.stringify({
      event: 'operator_console_websocket_connect_failed',
      error: operatorConsoleGatewayErrorSummary(error),
    }));
    return json(refusal('operator_console_websocket_upstream_unavailable'), 503);
  }
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  let closed = false;
  const closeTcp = (): void => {
    if (closed) return;
    closed = true;
    void reader.cancel().catch(() => undefined);
    void writer.close().catch(() => undefined);
    try { socket.close?.(); } catch { /* best effort */ }
  };

  try {
    const source = new URL(request.url);
    const gatewayHost = new URL(configuration.baseUrl).host;
    const handshakeLines = [
      `GET ${source.pathname}${source.search} HTTP/1.1`,
      `Host: ${gatewayHost}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
      `x-narada-operator-console-bridge-token: ${configuration.token}`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: ${request.headers.get('sec-websocket-version') ?? '13'}`,
    ];
    const protocol = request.headers.get('sec-websocket-protocol');
    if (protocol) handshakeLines.push(`Sec-WebSocket-Protocol: ${protocol}`);
    const extensions = request.headers.get('sec-websocket-extensions');
    if (extensions) handshakeLines.push(`Sec-WebSocket-Extensions: ${extensions}`);
    await writer.write(new TextEncoder().encode(`${handshakeLines.join('\r\n')}\r\n\r\n`));
    const handshake = await readOperatorConsoleTcpWebSocketHandshake(reader, key, Number(env.OPERATOR_CONSOLE_GATEWAY_TIMEOUT_MS ?? 30_000));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept({ allowHalfOpen: true });
    const parser = createOperatorConsoleTcpWebSocketParser();
    let writeChain = Promise.resolve();
    let bridgeClosed = false;
    const closeBridge = (code = 1011, reason = 'operator_console_websocket_closed'): void => {
      if (bridgeClosed) return;
      bridgeClosed = true;
      try { server.close(code, reason); } catch { /* best effort */ }
      closeTcp();
    };
    const queueUpstream = (frame: Uint8Array): Promise<void> => {
      writeChain = writeChain.then(async () => {
        if (!bridgeClosed) await writer.write(frame);
      });
      return writeChain;
    };

    server.addEventListener('message', (event: MessageEvent<unknown>) => {
      void operatorConsoleWebSocketData(event.data)
        .then((data) => queueUpstream(encodeOperatorConsoleClientWebSocketFrame(0x1, data)))
        .catch(() => closeBridge());
    });
    server.addEventListener('close', (event: CloseEvent) => {
      const code = Number.isInteger(event.code) && event.code > 0 ? event.code : 1000;
      const reason = event.reason || 'client_closed';
      void queueUpstream(encodeOperatorConsoleClientWebSocketFrame(0x8, encodeOperatorConsoleClosePayload(code, reason)))
        .finally(closeTcp);
    });
    server.addEventListener('error', () => closeBridge());

    void pumpOperatorConsoleTcpWebSocket({
      reader,
      parser,
      initialBytes: handshake.remainder,
      server,
      queueUpstream,
      closeBridge,
    });
    return webSocketUpgradeResponse(client);
  } catch (error) {
    closeTcp();
    console.log(JSON.stringify({
      event: 'operator_console_websocket_upstream_failed',
      error: operatorConsoleGatewayErrorSummary(error),
    }));
    const code = error instanceof Error && error.message === 'operator_console_websocket_upstream_invalid_handshake'
      ? 'operator_console_websocket_upstream_invalid_handshake'
      : 'operator_console_websocket_upstream_unavailable';
    return json(refusal(code), 502);
  }
}

function operatorConsoleGatewayErrorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message.slice(0, 256),
    };
  }
  return {
    name: typeof error,
    message: 'non_error_throwable',
  };
}

async function readOperatorConsoleTcpWebSocketHandshake(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  key: string,
  timeoutMs: number,
): Promise<{ remainder: Uint8Array }> {
  const deadline = Date.now() + Math.max(500, timeoutMs);
  let buffer = new Uint8Array(0);
  const delimiter = new Uint8Array([13, 10, 13, 10]);
  while (true) {
    const headerEnd = indexOfOperatorConsoleBytes(buffer, delimiter);
    if (headerEnd >= 0) {
      const headerBytes = buffer.slice(0, headerEnd);
      const header = new TextDecoder().decode(headerBytes);
      if (!/^HTTP\/1\.1 101(?:\s|$)/u.test(header)) throw new Error('operator_console_websocket_upstream_invalid_handshake');
      const accepted = readOperatorConsoleHttpHeader(header, 'sec-websocket-accept');
      if (!accepted || accepted !== await operatorConsoleWebSocketAccept(key)) {
        throw new Error('operator_console_websocket_upstream_invalid_handshake');
      }
      return { remainder: buffer.slice(headerEnd + delimiter.byteLength) };
    }
    if (buffer.byteLength > OPERATOR_CONSOLE_WEBSOCKET_MAX_HANDSHAKE_BYTES) {
      throw new Error('operator_console_websocket_upstream_invalid_handshake');
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('operator_console_websocket_upstream_unavailable');
    const result = await readOperatorConsoleWithTimeout(reader.read(), remaining);
    if (result.done) throw new Error('operator_console_websocket_upstream_unavailable');
    buffer = concatenateOperatorConsoleBytes(buffer, result.value) as Uint8Array<ArrayBuffer>;
  }
}

async function pumpOperatorConsoleTcpWebSocket(args: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  parser: OperatorConsoleTcpWebSocketParser;
  initialBytes: Uint8Array;
  server: WorkerWebSocket;
  queueUpstream: (frame: Uint8Array) => Promise<void>;
  closeBridge: (code?: number, reason?: string) => void;
}): Promise<void> {
  try {
    if (args.initialBytes.byteLength > 0) await handleOperatorConsoleTcpWebSocketFrames(args, args.initialBytes);
    while (true) {
      const result = await args.reader.read();
      if (result.done) throw new Error('operator_console_websocket_upstream_closed');
      await handleOperatorConsoleTcpWebSocketFrames(args, result.value);
    }
  } catch {
    args.closeBridge(1011, 'operator_console_websocket_upstream_closed');
  }
}

async function handleOperatorConsoleTcpWebSocketFrames(
  args: {
    parser: OperatorConsoleTcpWebSocketParser;
    server: WorkerWebSocket;
    queueUpstream: (frame: Uint8Array) => Promise<void>;
    closeBridge: (code?: number, reason?: string) => void;
  },
  chunk: Uint8Array,
): Promise<void> {
  const frames = parseOperatorConsoleTcpWebSocketFrames(args.parser, chunk);
  for (const frame of frames) {
    if (frame.opcode === 0x9) {
      await args.queueUpstream(encodeOperatorConsoleClientWebSocketFrame(0xA, frame.payload));
      continue;
    }
    if (frame.opcode === 0xA) continue;
    if (frame.opcode === 0x8) {
      const close = decodeOperatorConsoleClosePayload(frame.payload);
      try { args.server.close(close.code, close.reason); } catch { /* best effort */ }
      args.closeBridge(close.code, close.reason || 'upstream_closed');
      return;
    }
    if (frame.opcode !== 0x0 && frame.opcode !== 0x1 && frame.opcode !== 0x2) {
      args.closeBridge(1002, 'operator_console_websocket_opcode_invalid');
      return;
    }
    if (frame.opcode !== 0x0 && args.parser.fragmentedOpcode !== null) {
      args.closeBridge(1002, 'operator_console_websocket_fragment_invalid');
      return;
    }
    if (frame.opcode !== 0x0 && !frame.fin) {
      args.parser.fragmentedOpcode = frame.opcode;
      args.parser.fragmentedPayload = [frame.payload];
      args.parser.fragmentedBytes = frame.payload.byteLength;
      continue;
    }
    if (frame.opcode === 0x0) {
      if (args.parser.fragmentedOpcode === null) {
        args.closeBridge(1002, 'operator_console_websocket_fragment_invalid');
        return;
      }
      args.parser.fragmentedPayload.push(frame.payload);
      args.parser.fragmentedBytes += frame.payload.byteLength;
      if (!frame.fin) continue;
      const opcode = args.parser.fragmentedOpcode;
      const payload = concatenateOperatorConsoleChunks(args.parser.fragmentedPayload, args.parser.fragmentedBytes);
      args.parser.fragmentedOpcode = null;
      args.parser.fragmentedPayload = [];
      args.parser.fragmentedBytes = 0;
      sendOperatorConsoleWebSocketMessage(args.server, opcode, payload);
      continue;
    }
    sendOperatorConsoleWebSocketMessage(args.server, frame.opcode, frame.payload);
  }
}

function sendOperatorConsoleWebSocketMessage(server: WorkerWebSocket, opcode: number, payload: Uint8Array): void {
  if (opcode === 0x1) server.send(new TextDecoder().decode(payload));
  else server.send(payload.slice().buffer as ArrayBuffer);
}

function createOperatorConsoleTcpWebSocketParser(): OperatorConsoleTcpWebSocketParser {
  return { buffer: new Uint8Array(0), fragmentedOpcode: null, fragmentedPayload: [], fragmentedBytes: 0 };
}

function parseOperatorConsoleTcpWebSocketFrames(
  parser: OperatorConsoleTcpWebSocketParser,
  chunk: Uint8Array,
): OperatorConsoleTcpWebSocketFrame[] {
  parser.buffer = concatenateOperatorConsoleBytes(parser.buffer, chunk);
  const frames: OperatorConsoleTcpWebSocketFrame[] = [];
  while (parser.buffer.byteLength >= 2) {
    const first = parser.buffer[0] ?? 0;
    const second = parser.buffer[1] ?? 0;
    const fin = (first & 0x80) !== 0;
    const rsv = first & 0x70;
    const opcode = first & 0x0F;
    if (rsv !== 0) throw new Error('operator_console_websocket_extensions_unsupported');
    let length = second & 0x7F;
    let offset = 2;
    if (length === 126) {
      if (parser.buffer.byteLength < offset + 2) break;
      length = ((parser.buffer[offset] ?? 0) << 8) | (parser.buffer[offset + 1] ?? 0);
      offset += 2;
    } else if (length === 127) {
      if (parser.buffer.byteLength < offset + 8) break;
      length = 0;
      for (let index = 0; index < 8; index += 1) {
        length = length * 256 + (parser.buffer[offset + index] ?? 0);
        if (length > OPERATOR_CONSOLE_WEBSOCKET_MAX_FRAME_BYTES) throw new Error('operator_console_websocket_frame_too_large');
      }
      offset += 8;
    }
    if (length > OPERATOR_CONSOLE_WEBSOCKET_MAX_FRAME_BYTES) throw new Error('operator_console_websocket_frame_too_large');
    const masked = (second & 0x80) !== 0;
    if (masked) offset += 4;
    if (parser.buffer.byteLength < offset + length) break;
    const mask = masked ? parser.buffer.slice(offset - 4, offset) : null;
    const payload = parser.buffer.slice(offset, offset + length);
    if (mask) for (let index = 0; index < payload.byteLength; index += 1) payload[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
    parser.buffer = parser.buffer.slice(offset + length);
    frames.push({ fin, opcode, payload });
  }
  return frames;
}

function encodeOperatorConsoleClientWebSocketFrame(opcode: number, payload: Uint8Array): Uint8Array {
  if (payload.byteLength > OPERATOR_CONSOLE_WEBSOCKET_MAX_FRAME_BYTES) throw new Error('operator_console_websocket_frame_too_large');
  const mask = new Uint8Array(4);
  crypto.getRandomValues(mask);
  const lengthBytes = payload.byteLength < 126 ? 0 : payload.byteLength <= 65_535 ? 2 : 8;
  const header = 2 + lengthBytes + 4;
  const frame = new Uint8Array(header + payload.byteLength);
  frame[0] = 0x80 | (opcode & 0x0F);
  if (lengthBytes === 0) frame[1] = 0x80 | payload.byteLength;
  else if (lengthBytes === 2) {
    frame[1] = 0x80 | 126;
    frame[2] = (payload.byteLength >>> 8) & 0xFF;
    frame[3] = payload.byteLength & 0xFF;
  } else {
    frame[1] = 0x80 | 127;
    let remaining = payload.byteLength;
    for (let index = 9; index >= 2; index -= 1) {
      frame[index] = remaining & 0xFF;
      remaining = Math.floor(remaining / 256);
    }
  }
  frame.set(mask, 2 + lengthBytes);
  for (let index = 0; index < payload.byteLength; index += 1) {
    frame[header + index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  }
  return frame;
}

function encodeOperatorConsoleClosePayload(code: number, reason: string): Uint8Array {
  const reasonBytes = new TextEncoder().encode(reason).slice(0, 123);
  const payload = new Uint8Array(2 + reasonBytes.byteLength);
  payload[0] = (code >>> 8) & 0xFF;
  payload[1] = code & 0xFF;
  payload.set(reasonBytes, 2);
  return payload;
}

function decodeOperatorConsoleClosePayload(payload: Uint8Array): { code: number; reason: string } {
  if (payload.byteLength < 2) return { code: 1000, reason: '' };
  return {
    code: (payload[0] ?? 0) * 256 + (payload[1] ?? 0),
    reason: new TextDecoder().decode(payload.slice(2)),
  };
}

async function operatorConsoleWebSocketData(value: unknown): Promise<Uint8Array> {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  throw new Error('operator_console_websocket_message_invalid');
}

async function operatorConsoleWebSocketAccept(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${key}${OPERATOR_CONSOLE_WEBSOCKET_GUID}`));
  return base64FromOperatorConsoleBytes(new Uint8Array(digest));
}

function base64FromOperatorConsoleBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readOperatorConsoleHttpHeader(header: string, name: string): string | null {
  const prefix = `${name}:`;
  const line = header.split('\r\n').find((candidate) => candidate.toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? line.slice(prefix.length).trim() : null;
}

async function readOperatorConsoleWithTimeout<T>(value: T | PromiseLike<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('operator_console_websocket_upstream_unavailable')), timeoutMs);
    Promise.resolve(value).then((resolved) => { clearTimeout(timer); resolve(resolved); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function concatenateOperatorConsoleBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left, 0);
  result.set(right, left.byteLength);
  return result;
}

function concatenateOperatorConsoleChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function indexOfOperatorConsoleBytes(value: Uint8Array, needle: Uint8Array): number {
  outer: for (let index = 0; index <= value.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (value[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

async function proxyOperatorConsoleWorkspaceWebSocketViaHttp(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
): Promise<Response> {
  const configuration = operatorConsoleGatewayConfiguration(env);
  if (!configuration) return json(refusal('operator_console_gateway_not_configured_or_pinned'), 503);
  const gatewayBinding = configuration.transport === 'vpc-service' ? operatorConsoleGatewayBinding(env) : null;
  if (configuration.transport === 'vpc-service' && !gatewayBinding) return json(refusal('operator_console_gateway_vpc_binding_unavailable'), 503);
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, `${configuration.baseUrl}/`);
  const headers = new Headers({
    Upgrade: 'websocket',
    'x-narada-operator-console-bridge-token': configuration.token,
  });
  const protocol = request.headers.get('sec-websocket-protocol');
  if (protocol) headers.set('sec-websocket-protocol', protocol);
  let upstream: Response;
  try {
    upstream = await (gatewayBinding ? gatewayBinding.fetch(target, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(operatorConsoleGatewayTimeoutMs(env)),
    }) : fetchFn(target, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(operatorConsoleGatewayTimeoutMs(env)),
    }));
  } catch {
    return json(refusal('operator_console_websocket_upstream_unavailable'), 503);
  }
  const upstreamSocket = (upstream as Response & { webSocket?: WorkerWebSocket }).webSocket;
  if (upstream.status !== 101 || !upstreamSocket) return json(refusal('operator_console_websocket_upstream_unavailable'), 502);
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  upstreamSocket.accept?.();
  let closed = false;
  const closeBoth = (code = 1011, reason = 'operator_console_websocket_closed'): void => {
    if (closed) return;
    closed = true;
    try { server.close(code, reason); } catch { /* best effort */ }
    try { upstreamSocket.close(code, reason); } catch { /* best effort */ }
  };
  server.addEventListener('message', (event: MessageEvent<unknown>) => {
    try { upstreamSocket.send(event.data as string | ArrayBuffer | Blob); } catch { closeBoth(); }
  });
  upstreamSocket.addEventListener('message', (event: MessageEvent<unknown>) => {
    try { server.send(event.data as string | ArrayBuffer | Blob); } catch { closeBoth(); }
  });
  server.addEventListener('close', () => closeBoth(1000, 'client_closed'));
  server.addEventListener('error', () => closeBoth());
  upstreamSocket.addEventListener('close', () => closeBoth(1011, 'gateway_closed'));
  upstreamSocket.addEventListener('error', () => closeBoth());
  return webSocketUpgradeResponse(client);
}

function webSocketUpgradeResponse(client: WorkerWebSocket): Response {
  try {
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WorkerWebSocket });
  } catch {
    // Node's WHATWG Response rejects 101; keep unit tests transport-neutral
    // while Cloudflare receives the native upgrade response above.
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, 'status', { value: 101 });
    Object.defineProperty(response, 'webSocket', { value: client });
    return response;
  }
}

async function readOperatorConsoleRouteDirectory(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
  _now: () => string,
): Promise<Response> {
  const discoveryRequest = new Request(request.url, {
    method: 'GET',
    headers: request.headers,
  });
  const upstream = await fetchOperatorConsoleGateway(discoveryRequest, env, fetchFn, '/console/routes');
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) return json(payload ?? refusal('operator_console_route_directory_unavailable'), upstream.status);
  if (!isWorkspaceRouteDirectory(payload)) return json(refusal('operator_console_route_directory_invalid'), 502);
  const origin = new URL(request.url).origin;
  return json({ ...payload, workspaceHost: { kind: 'cloudflare', id: 'worker', origin } });
}

async function readOperatorConsoleGatewayHealth(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  fetchFn: typeof fetch,
  _now: () => string,
): Promise<Response> {
  const upstream = await fetchOperatorConsoleGateway(request, env, fetchFn, '/health');
  const payload = await upstream.json().catch(() => null);
  const transport = operatorConsoleGatewayTransportHealth(env);
  const healthy = upstream.ok && transport.status === 'ready';
  return json({
    schema: 'narada.operator_console.cloudflare_mirror_health.v1',
    status: healthy ? 'healthy' : 'degraded',
    transport,
    gateway: payload,
  }, healthy ? 200 : 503);
}

async function serveStaticAsset(
  request: Request,
  env: CloudflareNarsProjectionWorkerEnv,
  workspaceDirectory: CloudflareNarsWorkspaceDirectoryService,
  now: () => string,
  fetchFn: typeof fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const hasProjectionBootstrap = url.searchParams.has('cloudflare_projection_id');
  const legacyProjectionEntry = hasProjectionBootstrap
    && (url.pathname === '/sessions' || url.pathname === '/sessions/');
  if (legacyProjectionEntry) {
    const canonicalUrl = new URL(url);
    canonicalUrl.pathname = '/';
    return new Response(null, {
      status: 307,
      headers: {
        location: canonicalUrl.toString(),
        'cache-control': 'no-store',
      },
    });
  }
  const directProjectionEntry = url.pathname === '/'
    && hasProjectionBootstrap;
  const operatorConsoleEntry = !directProjectionEntry
    && (url.pathname === OPERATOR_CONSOLE_PATH || url.pathname === `${OPERATOR_CONSOLE_PATH}/`);
  if (operatorConsoleEntry) {
    const canonicalUrl = new URL(url);
    canonicalUrl.pathname = `${OPERATOR_CONSOLE_PATH}/agents`;
    return new Response(null, {
      status: 302,
      headers: {
        location: canonicalUrl.toString(),
        'cache-control': 'no-store',
      },
    });
  }
  const workspaceLanding = !directProjectionEntry && url.pathname === '/';
  if (workspaceLanding) {
    let directory: OperatorWorkspaceRouteDirectory;
    if (operatorConsoleGatewayConfigured(env)) {
      const remoteDirectory = await readOperatorConsoleRouteDirectory(request, env, fetchFn, now);
      const payload = await remoteDirectory.json().catch(() => null);
      if (!remoteDirectory.ok || !isWorkspaceRouteDirectory(payload)) {
        return json(payload ?? refusal('operator_console_route_directory_unavailable'), remoteDirectory.status || 503);
      }
      directory = payload;
    } else {
      directory = await readWorkspaceDirectoryForPage(request, env, workspaceDirectory, now);
    }
    return new Response(renderCloudflareWorkspacePage(directory, url.origin), {
      status: 200,
      headers: withCorsHeaders({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }),
    });
  }
  if (!env.ASSETS?.fetch) return json(refusal('static_assets_not_configured'), 404);
  const sessionDocument = url.pathname === '/sessions' || url.pathname === '/sessions/' || url.pathname.startsWith('/sessions/');
  const consoleDocument = isOperatorConsoleStaticDocumentPath(url.pathname);
  const consoleLease = consoleDocument
    ? (env.NARS_WORKSPACE_DIRECTORY
      ? await lookupWorkspaceRouteInDurableObject(url.pathname, env)
      : workspaceDirectory.findByPath(url.pathname, now()))
    : null;
  const consoleUiConfig = objectRecord(consoleLease?.ui_config);
  if (consoleDocument && !consoleLease && !operatorConsoleGatewayConfigured(env)) return json(refusal('operator_console_route_not_leased'), 404);
  if (consoleDocument && !consoleUiConfig && !operatorConsoleGatewayConfigured(env)) return json(refusal('operator_console_route_configuration_unavailable'), 503);
  const assetUrl = new URL(url);
  // Fetch directory forms for SPA entrypoints. Cloudflare's asset binding
  // redirects an internal `/sessions/index.html` or `/console/index.html`
  // fetch to its directory URL; using the directory form avoids leaking that
  // redirect into the canonical projection URL.
  if (directProjectionEntry || (sessionDocument && !hasFileExtension(url.pathname))) assetUrl.pathname = '/sessions/';
  if (consoleDocument) assetUrl.pathname = `${OPERATOR_CONSOLE_PATH}/`;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  if ((!directProjectionEntry && !sessionDocument && !consoleDocument) || !isHtmlResponse(response)) return response;
  const lease = consoleDocument ? consoleLease : (env.NARS_WORKSPACE_DIRECTORY
    ? await lookupWorkspaceRouteInDurableObject(url.pathname, env)
    : workspaceDirectory.findByPath(url.pathname, now()));
  const uiConfig = objectRecord(lease?.ui_config);
  if (sessionDocument && !uiConfig) return json(refusal('workspace_session_route_not_found'), 404);
  const consoleRouteDirectory = objectRecord(uiConfig?.workspace_route_directory);
  const baseConsoleConfig = consoleRouteDirectory
    ? {
      routeDirectory: {
        endpoint: stringOrUndefined(consoleRouteDirectory.endpoint) ?? null,
        projectionId: stringOrUndefined(consoleRouteDirectory.projection_id) ?? null,
        browserToken: stringOrUndefined(consoleRouteDirectory.browser_token) ?? null,
      },
    }
       : operatorConsoleGatewayConfigured(env)
        ? {
          routeDirectory: {
            endpoint: '/api/nars/operator-console/routes',
            projectionId: null,
            browserToken: null,
            timeoutMs: operatorConsoleGatewayTimeoutMs(env),
          },
        }
         : {};
  const hostFleetConfig = operatorConsoleHostFleetUiConfig(env);
  const consoleConfig = hostFleetConfig
    ? { ...baseConsoleConfig, hostFleet: hostFleetConfig }
    : baseConsoleConfig;
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
  const documentContent = directProjectionEntry
    ? content.replaceAll('./assets/', '/sessions/assets/')
    : content;
  return new Response(documentContent
    .replace('__NARADA_AGENT_WEB_UI_CONFIG__', serializeHtmlJson(uiConfig ?? {}))
    .replace('__NARADA_OPERATOR_CONSOLE_CONFIG__', serializeHtmlJson(consoleConfig)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function operatorConsoleHostFleetUiConfig(env: CloudflareNarsProjectionWorkerEnv): Record<string, string> | null {
  const configuredPath = env.NARADA_HOST_FLEET_UI_API_BASE_PATH?.trim();
  const apiBasePath = configuredPath || (env.NARADA_HOST_FLEET_REGISTRY ? '/api/narada/fleet/hosts' : '');
  if (!apiBasePath || !apiBasePath.startsWith('/') || apiBasePath.includes('//') || apiBasePath.includes('..') || apiBasePath.includes('\\') || apiBasePath.includes('?') || apiBasePath.includes('#')) return null;
  const routeShape = env.NARADA_HOST_FLEET_UI_ROUTE_SHAPE?.trim()
    || (apiBasePath === '/api/narada/fleet/hosts' ? 'cloudflare-projection' : 'local-console');
  if (routeShape !== 'cloudflare-projection' && routeShape !== 'local-console') return null;
  return { apiBasePath, routeShape };
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
