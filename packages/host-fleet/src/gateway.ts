import { randomUUID } from 'node:crypto';
import {
  HOST_GATEWAY_HEALTH_SCHEMA,
  HOST_SESSION_DISCOVERY_SCHEMA,
  refusal,
  validateHostKey,
  validateRuntimeTarget,
  type HostGatewayHealthProjection,
  type HostRecord,
  type HostHealthStatus,
  type HostKey,
  type HostRuntimeSession,
  type HostSessionDiscovery,
} from './contract.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
export const HOST_GATEWAY_REQUEST_OBSERVATION_SCHEMA = 'narada.host_fleet.gateway_request_observation.v1' as const;
export const HOST_GATEWAY_TOKEN_HEADER = 'x-narada-host-gateway-token' as const;
export const HOST_GATEWAY_BRIDGE_TOKEN_HEADER = 'x-narada-operator-console-bridge-token' as const;

export interface HostGatewayClientOptions {
  fetch_fn?: typeof fetch;
  credential_resolver?: (credential_ref: string) => string | Promise<string | null> | null;
  timeout_ms?: number;
  max_response_bytes?: number;
  now?: () => string;
  observe_request?: (observation: HostGatewayRequestObservation) => void;
}

export interface HostGatewayRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  request_id?: string;
}

export interface HostGatewayRequestObservation {
  schema: typeof HOST_GATEWAY_REQUEST_OBSERVATION_SCHEMA;
  request_id: string;
  host: HostKey;
  method: string;
  path: string;
  status: number | null;
  outcome: 'success' | 'refused' | 'error';
  duration_ms: number;
  reason: string | null;
  observed_at: string;
}

export interface HostGatewayClient {
  health(): Promise<HostGatewayHealthProjection>;
  sessions(): Promise<HostSessionDiscovery>;
  requestJson<T = unknown>(path: string, options?: HostGatewayRequestOptions): Promise<T>;
  requestDocument(path: string, options?: Pick<HostGatewayRequestOptions, 'method' | 'request_id'>): Promise<HostGatewayDocument>;
}

export interface HostGatewayDocument {
  status: number;
  content_type: string;
  body: Uint8Array;
}

export function resolveHostGatewayEnvironmentCredential(credentialRef: string): string | null {
  const match = /^(?:env:\/\/|env:\/)([A-Za-z_][A-Za-z0-9_]*)$/u.exec(credentialRef.trim());
  return match ? process.env[match[1]!] ?? null : null;
}

export async function resolveHostGatewayCredential(
  record: HostRecord,
  resolver: HostGatewayClientOptions['credential_resolver'] = resolveHostGatewayEnvironmentCredential,
  now = new Date(),
): Promise<string> {
  const policy = record.gateway.credential;
  if (policy.not_before && now.getTime() < Date.parse(policy.not_before)) throw new Error('host_gateway_credential_not_yet_valid');
  if (policy.expires_at && now.getTime() >= Date.parse(policy.expires_at)) throw new Error('host_gateway_credential_expired');
  const value = await resolver?.(record.credential_ref);
  if (typeof value !== 'string' || value.length === 0) throw new Error('host_gateway_credential_unavailable');
  return value;
}

function baseEndpoint(record: HostRecord): string {
  return record.gateway.endpoint.replace(/\/+$/, '');
}

function allowedPath(record: HostRecord, path: string): boolean {
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('?') || path.includes('#')) return false;
  return record.gateway.admitted_paths.some((candidate) => candidate.endsWith('/*')
    ? path.startsWith(candidate.slice(0, -1))
    : path === candidate);
}

function healthStatus(value: unknown, ok: boolean): HostHealthStatus {
  if (value === 'healthy' || value === 'online') return ok ? 'online' : 'degraded';
  if (value === 'degraded') return 'degraded';
  if (value === 'unauthenticated') return 'unauthenticated';
  return ok ? 'degraded' : 'offline';
}

async function readBounded(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('host_gateway_response_too_large');
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) throw new Error('host_gateway_response_too_large');
  try { return JSON.parse(text); } catch { throw new Error('host_gateway_response_invalid_json'); }
}

function healthFailureStatus(detail: string): HostHealthStatus {
  if (detail.includes('credential') || detail.includes('unauthenticated')) return 'unauthenticated';
  if (detail.startsWith('host_gateway_http_5') || detail.startsWith('host_gateway_http_429')) return 'degraded';
  return 'offline';
}

function sessionState(value: unknown): HostRuntimeSession['state'] | null {
  if (value === 'active') return 'active';
  if (value === 'starting_or_degraded') return 'degraded';
  if (value === 'closed' || value === 'historical') return 'closed';
  if (value === 'stale') return 'stale';
  return null;
}

function sessionHealth(value: unknown): HostHealthStatus {
  if (value === 'healthy' || value === 'online') return 'online';
  if (value === 'degraded' || value === 'starting') return 'degraded';
  if (value === 'stale') return 'stale';
  if (value === 'revoked') return 'revoked';
  if (value === 'unauthenticated') return 'unauthenticated';
  if (value === 'offline') return 'offline';
  return 'unknown';
}

function optionalTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function projectSessions(payload: unknown, hostRecord: HostRecord, generatedAt: string): HostSessionDiscovery {
  const host = validateHostKey(hostRecord);
  const record = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!record || record.schema !== 'narada.operator_console.agent_sessions.v1' || !Array.isArray(record.sessions)) {
    return {
      schema: HOST_SESSION_DISCOVERY_SCHEMA,
      status: 'refused',
      host,
      generated_at: generatedAt,
      sessions: [],
      refusals: [refusal({ reason: 'host_session_discovery_contract_invalid', host })],
    };
  }
  const sessions: HostRuntimeSession[] = [];
  const refusals = [] as ReturnType<typeof refusal>[];
  for (const value of record.sessions.slice(0, 500)) {
    const entry = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    const state = sessionState(entry?.display_state);
    const sessionId = typeof entry?.session_id === 'string' ? entry.session_id.trim() : '';
    const siteId = typeof entry?.site_id === 'string' ? entry.site_id.trim() : '';
    const agentId = typeof entry?.agent_id === 'string' ? entry.agent_id.trim() : '';
    if (!entry || !state || !sessionId || !siteId || !agentId) {
      refusals.push(refusal({ reason: 'host_session_record_invalid', host }));
      continue;
    }
    if (!hostRecord.admitted_sites.includes(siteId)) {
      refusals.push(refusal({ reason: 'host_site_not_admitted', host }));
      continue;
    }
    const target = validateRuntimeTarget({
      ...host,
      site_id: siteId,
      agent_id: agentId,
      runtime_session_id: sessionId,
    });
    sessions.push({
      target,
      state,
      health_status: sessionHealth(entry.health_status),
      started_at: optionalTimestamp(entry.started_at),
      last_seen_at: optionalTimestamp(entry.last_seen_at),
    });
  }
  return {
    schema: HOST_SESSION_DISCOVERY_SCHEMA,
    status: refusals.length > 0 && sessions.length === 0 ? 'refused' : 'success',
    host,
    generated_at: generatedAt,
    sessions,
    refusals,
  };
}

function requestHeaders(
  headers: Record<string, string> | undefined,
  record: HostRecord,
  token: string,
  requestId: string,
): Record<string, string> {
  const host = validateHostKey(record);
  const reserved = new Set([
    'accept',
    'x-narada-host-id',
    'x-narada-host-instance-id',
    'x-narada-operator-console-bridge-token',
    HOST_GATEWAY_TOKEN_HEADER,
    'x-request-id',
  ]);
  for (const name of Object.keys(headers ?? {})) {
    if (reserved.has(name.toLowerCase())) throw new Error(`host_gateway_reserved_header_override:${name}`);
  }
  const credentialHeader = record.gateway.credential.class === 'dedicated_host_gateway'
    ? HOST_GATEWAY_TOKEN_HEADER
    : HOST_GATEWAY_BRIDGE_TOKEN_HEADER;
  return {
    accept: 'application/json',
    'x-narada-host-id': host.host_id,
    'x-narada-host-instance-id': host.host_instance_id,
    'x-request-id': requestId,
    [credentialHeader]: token,
    ...(headers ?? {}),
  };
}

export function createHostGatewayClient(record: HostRecord, options: HostGatewayClientOptions = {}): HostGatewayClient {
  const host = validateHostKey(record);
  const fetchFn = options.fetch_fn ?? fetch;
  const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.max_response_bytes ?? MAX_RESPONSE_BYTES;
  const now = options.now ?? (() => new Date().toISOString());
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('host_gateway_timeout_invalid');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 64 * 1024 * 1024) throw new Error('host_gateway_response_limit_invalid');

  async function requestJson<T>(path: string, request: HostGatewayRequestOptions = {}): Promise<T> {
    const method = (request.method ?? 'GET').toUpperCase();
    const requestedRequestId = request.request_id?.trim();
    if (requestedRequestId && !REQUEST_ID_PATTERN.test(requestedRequestId)) throw new Error('host_gateway_request_id_invalid');
    const requestId = requestedRequestId || randomUUID();
    const startedAt = Date.now();
    const observe = (status: number | null, outcome: HostGatewayRequestObservation['outcome'], reason: string | null): void => {
      try {
        options.observe_request?.({
          schema: HOST_GATEWAY_REQUEST_OBSERVATION_SCHEMA,
          request_id: requestId,
          host,
          method,
          path,
          status,
          outcome,
          duration_ms: Math.max(0, Date.now() - startedAt),
          reason,
          observed_at: now(),
        });
      } catch {
        // Observability must never change gateway admission or request results.
      }
    };
    try {
      if (!allowedPath(record, path)) throw new Error(`host_gateway_path_not_admitted:${path}`);
      const token = await resolveHostGatewayCredential(record, options.credential_resolver, new Date(now()));
      const response = await fetchFn(`${baseEndpoint(record)}${path}`, {
        method,
        headers: requestHeaders(request.headers, record, token, requestId),
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await readBounded(response, maxResponseBytes);
      if (!response.ok) {
        const reason = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string'
          ? payload.code
          : `host_gateway_http_${response.status}`;
        observe(response.status, 'refused', reason);
        throw new Error(reason);
      }
      observe(response.status, 'success', null);
      return payload as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
      if (!reason.startsWith('host_gateway_http_')) observe(null, 'error', reason);
      throw error;
    }
  }

  async function requestDocument(
    path: string,
    request: Pick<HostGatewayRequestOptions, 'method' | 'request_id'> = {},
  ): Promise<HostGatewayDocument> {
    const method = (request.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') throw new Error('host_gateway_document_method_invalid');
    const requestedRequestId = request.request_id?.trim();
    if (requestedRequestId && !REQUEST_ID_PATTERN.test(requestedRequestId)) throw new Error('host_gateway_request_id_invalid');
    const requestId = requestedRequestId || randomUUID();
    const startedAt = Date.now();
    const observe = (status: number | null, outcome: HostGatewayRequestObservation['outcome'], reason: string | null): void => {
      try {
        options.observe_request?.({
          schema: HOST_GATEWAY_REQUEST_OBSERVATION_SCHEMA,
          request_id: requestId,
          host,
          method,
          path,
          status,
          outcome,
          duration_ms: Math.max(0, Date.now() - startedAt),
          reason,
          observed_at: now(),
        });
      } catch {
        // Observability must never change gateway admission or document results.
      }
    };
    try {
      if (!allowedPath(record, path)) throw new Error(`host_gateway_path_not_admitted:${path}`);
      const token = await resolveHostGatewayCredential(record, options.credential_resolver, new Date(now()));
      const response = await fetchFn(`${baseEndpoint(record)}${path}`, {
        method,
        headers: {
          ...requestHeaders(undefined, record, token, requestId),
          accept: 'text/html,application/xhtml+xml,application/octet-stream',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) throw new Error('host_gateway_response_too_large');
      const body = method === 'HEAD' ? new Uint8Array() : new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maxResponseBytes) throw new Error('host_gateway_response_too_large');
      if (!response.ok) {
        const reason = `host_gateway_http_${response.status}`;
        observe(response.status, 'refused', reason);
        throw new Error(reason);
      }
      observe(response.status, 'success', null);
      return {
        status: response.status,
        content_type: response.headers.get('content-type') ?? 'application/octet-stream',
        body,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
      if (!reason.startsWith('host_gateway_http_')) observe(null, 'error', reason);
      throw error;
    }
  }

  return {
    async health(): Promise<HostGatewayHealthProjection> {
      const observedAt = now();
      try {
        const payload = await requestJson<Record<string, unknown>>('/health');
        return {
          schema: HOST_GATEWAY_HEALTH_SCHEMA,
          host,
          status: healthStatus(payload.status, true),
          observed_at: observedAt,
          endpoint: record.gateway.endpoint,
          gateway_schema: typeof payload.schema === 'string' ? payload.schema : null,
          detail: typeof payload.detail === 'string' ? payload.detail : null,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          schema: HOST_GATEWAY_HEALTH_SCHEMA,
          host,
          status: healthFailureStatus(detail),
          observed_at: observedAt,
          endpoint: record.gateway.endpoint,
          gateway_schema: null,
          detail: detail.slice(0, 512),
        };
      }
    },
    async sessions(): Promise<HostSessionDiscovery> {
      const generatedAt = now();
      try {
        const payload = await requestJson('/console/sessions/api/sessions');
        return projectSessions(payload, record, generatedAt);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          schema: HOST_SESSION_DISCOVERY_SCHEMA,
          status: 'refused',
          host,
          generated_at: generatedAt,
          sessions: [],
          refusals: [refusal({ reason: detail.slice(0, 256), host })],
        };
      }
    },
    requestJson,
    requestDocument,
  };
}
