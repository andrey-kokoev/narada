import {
  createCloudflareNarsRemoteAccessRecord,
  createCloudflareNarsProjectionWorkerService,
  type CloudflareNarsProjectionIntent,
  type CloudflareNarsRemoteAccessRecord,
} from './index.js';

export interface CloudflareNarsProjectionWorkerEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> | Response };
}

export interface CloudflareNarsProjectionWorkerOptions {
  service?: ReturnType<typeof createCloudflareNarsProjectionWorkerService>;
  now?: () => string;
}

export function createCloudflareNarsProjectionWorker(options: CloudflareNarsProjectionWorkerOptions = {}) {
  const service = options.service ?? createCloudflareNarsProjectionWorkerService();
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async fetch(request: Request, env: CloudflareNarsProjectionWorkerEnv = {}): Promise<Response> {
      const url = new URL(request.url);
      const path = trimPath(url.pathname);
      if (!path.startsWith('api/nars/')) return serveStaticAsset(request, env);
      if (request.method === 'GET' && path === 'api/nars/projections/health') {
        return json({ schema: 'narada.cloudflare_nars_projection.service_health.v1', status: 'healthy' });
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
          max_events: numberParam(url, 'max_events') ?? undefined,
          now: now(),
        }));
      }
      if (request.method === 'GET' && suffix === 'health') {
        const read = service.readEvents({
          projection_id: projectionId,
          browser_token_fingerprint: requireBrowserToken(request),
          max_events: 0,
          now: now(),
        });
        return json(read.status === 'ok'
          ? { schema: 'narada.cloudflare_nars_projection.health.v1', status: 'healthy', projection_id: projectionId }
          : { schema: 'narada.cloudflare_nars_projection.health.v1', status: 'refused', projection_id: projectionId, code: read.code });
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
    return new Response(toArrayBuffer(bytes), { status: 200, headers: read.content.headers });
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
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function serveStaticAsset(request: Request, env: CloudflareNarsProjectionWorkerEnv): Promise<Response> {
  if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
  return json(refusal('static_assets_not_configured'), 404);
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
