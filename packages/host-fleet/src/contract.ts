export const HOST_FLEET_REGISTRY_SCHEMA = 'narada.host_fleet.registry.v1' as const;
export const HOST_RECORD_SCHEMA = 'narada.host_fleet.host_record.v1' as const;
export const HOST_GATEWAY_HEALTH_SCHEMA = 'narada.host_fleet.gateway_health.v1' as const;
export const HOST_SESSION_DISCOVERY_SCHEMA = 'narada.host_fleet.session_discovery.v1' as const;
export const HOST_QUALIFIED_EVENT_SCHEMA = 'narada.host_fleet.qualified_event.v1' as const;
export const HOST_FLEET_REFUSAL_SCHEMA = 'narada.host_fleet.refusal.v1' as const;
export const HOST_FLEET_OVERVIEW_SCHEMA = 'narada.host_fleet.overview.v1' as const;

export type HostPlatform = 'windows' | 'linux' | 'macos' | 'cloudflare' | 'unknown';
export type HostGatewayTransport = 'loopback' | 'ssh-tunnel' | 'https' | 'cloudflare';
export type HostLifecycleState = 'pending' | 'active' | 'revoked' | 'retired';
export type HostHealthStatus = 'unknown' | 'online' | 'degraded' | 'offline' | 'stale' | 'unauthenticated' | 'revoked';
export type RuntimeSessionState = 'active' | 'starting' | 'degraded' | 'closed' | 'stale';

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INSTANCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CREDENTIAL_REF_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/;

export interface HostKey {
  host_id: string;
  host_instance_id: string;
}

export interface RuntimeTarget extends HostKey {
  site_id: string;
  agent_id: string;
  runtime_session_id: string;
}

export interface HostGatewayBinding {
  endpoint: string;
  transport: HostGatewayTransport;
  admitted_paths: readonly string[];
}

export interface HostHealthSnapshot {
  status: HostHealthStatus;
  observed_at: string | null;
  detail: string | null;
  gateway_schema: string | null;
}

export interface HostRecord {
  schema: typeof HOST_RECORD_SCHEMA;
  host_id: string;
  host_instance_id: string;
  display_name: string;
  platform: HostPlatform;
  narada_version: string | null;
  gateway: HostGatewayBinding;
  capabilities: readonly string[];
  admitted_sites: readonly string[];
  credential_ref: string;
  lifecycle_state: HostLifecycleState;
  health: HostHealthSnapshot;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  revision: number;
}

export interface HostRecordInput {
  host_id: string;
  host_instance_id: string;
  display_name: string;
  platform: HostPlatform;
  narada_version?: string | null;
  gateway: HostGatewayBinding;
  capabilities?: readonly string[];
  admitted_sites?: readonly string[];
  credential_ref: string;
  lifecycle_state?: HostLifecycleState;
}

export interface HostGatewayHealthProjection {
  schema: typeof HOST_GATEWAY_HEALTH_SCHEMA;
  host: HostKey;
  status: HostHealthStatus;
  observed_at: string;
  endpoint: string;
  gateway_schema: string | null;
  detail: string | null;
}

export interface HostQualifiedEvent<TPayload = unknown> {
  schema: typeof HOST_QUALIFIED_EVENT_SCHEMA;
  host: HostKey;
  site_id: string | null;
  agent_id: string | null;
  runtime_session_id: string | null;
  host_sequence: number;
  occurred_at: string;
  event_type: string;
  payload: TPayload;
}

export interface HostRuntimeSession {
  target: RuntimeTarget;
  state: RuntimeSessionState;
  health_status: HostHealthStatus;
  started_at: string | null;
  last_seen_at: string | null;
}

export interface HostSessionDiscovery {
  schema: typeof HOST_SESSION_DISCOVERY_SCHEMA;
  status: 'success' | 'refused';
  host: HostKey;
  generated_at: string;
  sessions: readonly HostRuntimeSession[];
  refusals: readonly HostFleetRefusal[];
}

export interface HostFleetOverview {
  schema: typeof HOST_FLEET_OVERVIEW_SCHEMA;
  generated_at: string;
  hosts: readonly HostRecord[];
}

export interface HostFleetRefusal {
  schema: typeof HOST_FLEET_REFUSAL_SCHEMA;
  status: 'refused';
  reason: string;
  host: HostKey | null;
  target: RuntimeTarget | null;
  candidates: readonly RuntimeTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, code: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) throw new Error(code);
  return value.trim();
}

function identifier(value: unknown, code: string): string {
  const normalized = requiredString(value, code, 64).toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function instanceIdentifier(value: unknown, code: string): string {
  const normalized = requiredString(value, code, 128);
  if (!INSTANCE_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function timestamp(value: unknown, code: string): string {
  const normalized = requiredString(value, code, 64);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function uniqueStrings(value: unknown, code: string, maxLength: number): string[] {
  if (value !== undefined && !Array.isArray(value)) throw new Error(code);
  const values = (value ?? []) as unknown[];
  if (values.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > maxLength)) throw new Error(code);
  return [...new Set(values.map((item) => (item as string).trim()))];
}

function normalizeEndpoint(value: unknown, transport: HostGatewayTransport): string {
  const endpoint = requiredString(value, 'host_gateway_endpoint_required', 2_048).replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('host_gateway_endpoint_invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.hash
    || parsed.search) throw new Error('host_gateway_endpoint_invalid');
  const loopback = parsed.hostname === '127.0.0.1'
    || parsed.hostname === 'localhost'
    || parsed.hostname === '::1'
    || parsed.hostname === '[::1]';
  if ((transport === 'loopback' || transport === 'ssh-tunnel') && !loopback) {
    throw new Error('host_gateway_loopback_required');
  }
  if ((transport === 'https' || transport === 'cloudflare') && parsed.protocol !== 'https:') {
    throw new Error('host_gateway_https_required');
  }
  return endpoint;
}

function normalizeCredentialRef(value: unknown): string {
  const ref = requiredString(value, 'host_credential_ref_required', 512);
  if (!CREDENTIAL_REF_PATTERN.test(ref)) throw new Error('host_credential_ref_invalid');
  return ref;
}

function normalizePath(value: string): string {
  if (!value.startsWith('/') || value.includes('..') || value.includes('\\') || value.includes('?') || value.includes('#')) {
    throw new Error('host_gateway_admitted_path_invalid');
  }
  return value === '/' ? value : value.replace(/\/+$/, '');
}

export function validateHostKey(value: unknown): HostKey {
  if (!isRecord(value)) throw new Error('host_key_invalid');
  return {
    host_id: identifier(value.host_id, 'host_id_invalid'),
    host_instance_id: instanceIdentifier(value.host_instance_id, 'host_instance_id_invalid'),
  };
}

export function validateRuntimeTarget(value: unknown): RuntimeTarget {
  if (!isRecord(value)) throw new Error('runtime_target_invalid');
  const host = validateHostKey(value);
  return {
    ...host,
    site_id: requiredString(value.site_id, 'runtime_target_site_id_required', 256),
    agent_id: requiredString(value.agent_id, 'runtime_target_agent_id_required', 256),
    runtime_session_id: requiredString(value.runtime_session_id, 'runtime_target_session_id_required', 256),
  };
}

export function createHostRecord(input: HostRecordInput, now = new Date()): HostRecord {
  if (!isRecord(input)) throw new Error('host_record_input_invalid');
  const platform = input.platform;
  if (!['windows', 'linux', 'macos', 'cloudflare', 'unknown'].includes(platform)) throw new Error('host_platform_invalid');
  const transport = input.gateway?.transport;
  if (!['loopback', 'ssh-tunnel', 'https', 'cloudflare'].includes(transport)) throw new Error('host_gateway_transport_invalid');
  const admittedPaths = uniqueStrings(input.gateway?.admitted_paths, 'host_gateway_admitted_paths_invalid', 512)
    .map(normalizePath);
  if (admittedPaths.length === 0) throw new Error('host_gateway_admitted_paths_empty');
  const timestampValue = now.toISOString();
  const lifecycleState = input.lifecycle_state ?? 'pending';
  if (!['pending', 'active', 'revoked', 'retired'].includes(lifecycleState)) throw new Error('host_lifecycle_state_invalid');
  return {
    schema: HOST_RECORD_SCHEMA,
    host_id: identifier(input.host_id, 'host_id_invalid'),
    host_instance_id: instanceIdentifier(input.host_instance_id, 'host_instance_id_invalid'),
    display_name: requiredString(input.display_name, 'host_display_name_required', 256),
    platform,
    narada_version: input.narada_version == null ? null : requiredString(input.narada_version, 'host_narada_version_invalid', 128),
    gateway: {
      endpoint: normalizeEndpoint(input.gateway?.endpoint, transport),
      transport,
      admitted_paths: admittedPaths,
    },
    capabilities: uniqueStrings(input.capabilities, 'host_capabilities_invalid', 256),
    admitted_sites: uniqueStrings(input.admitted_sites, 'host_admitted_sites_invalid', 256),
    credential_ref: normalizeCredentialRef(input.credential_ref),
    lifecycle_state: lifecycleState,
    health: {
      status: 'unknown',
      observed_at: null,
      detail: null,
      gateway_schema: null,
    },
    created_at: timestampValue,
    updated_at: timestampValue,
    last_seen_at: null,
    revision: 1,
  };
}

export function validateHostRecord(value: unknown): HostRecord {
  if (!isRecord(value) || value.schema !== HOST_RECORD_SCHEMA) throw new Error('host_record_schema_invalid');
  const record = createHostRecord(value as unknown as HostRecordInput, new Date(value.created_at as string));
  const createdAt = timestamp(value.created_at, 'host_created_at_invalid');
  const updatedAt = timestamp(value.updated_at, 'host_updated_at_invalid');
  const lastSeenAt = value.last_seen_at === null ? null : value.last_seen_at == null ? null : timestamp(value.last_seen_at, 'host_last_seen_at_invalid');
  const health = isRecord(value.health) ? value.health : null;
  if (!health || !['unknown', 'online', 'degraded', 'offline', 'stale', 'unauthenticated', 'revoked'].includes(health.status as string)) {
    throw new Error('host_health_invalid');
  }
  return {
    ...record,
    created_at: createdAt,
    updated_at: updatedAt,
    last_seen_at: lastSeenAt,
    health: {
      status: health.status as HostHealthStatus,
      observed_at: health.observed_at == null ? null : timestamp(health.observed_at, 'host_health_observed_at_invalid'),
      detail: health.detail == null ? null : requiredString(health.detail, 'host_health_detail_invalid', 2_048),
      gateway_schema: health.gateway_schema == null ? null : requiredString(health.gateway_schema, 'host_health_schema_invalid', 256),
    },
    revision: Number.isInteger(value.revision) && Number(value.revision) > 0 ? Number(value.revision) : (() => { throw new Error('host_revision_invalid'); })(),
  };
}

export function hostKey(value: HostKey): string {
  const normalized = validateHostKey(value);
  return `${normalized.host_id}@${normalized.host_instance_id}`;
}

export function hostKeysEqual(left: HostKey, right: HostKey): boolean {
  return hostKey(left) === hostKey(right);
}

export function runtimeTargetKey(target: RuntimeTarget): string {
  const normalized = validateRuntimeTarget(target);
  return `${hostKey(normalized)}:${normalized.site_id}:${normalized.agent_id}:${normalized.runtime_session_id}`;
}

export function qualifyEvent<TPayload>(input: {
  host: HostKey;
  site_id?: string | null;
  agent_id?: string | null;
  runtime_session_id?: string | null;
  host_sequence: number;
  occurred_at: string;
  event_type: string;
  payload: TPayload;
}): HostQualifiedEvent<TPayload> {
  const host = validateHostKey(input.host);
  if (!Number.isInteger(input.host_sequence) || input.host_sequence < 0) throw new Error('host_event_sequence_invalid');
  return {
    schema: HOST_QUALIFIED_EVENT_SCHEMA,
    host,
    site_id: input.site_id ?? null,
    agent_id: input.agent_id ?? null,
    runtime_session_id: input.runtime_session_id ?? null,
    host_sequence: input.host_sequence,
    occurred_at: timestamp(input.occurred_at, 'host_event_occurred_at_invalid'),
    event_type: requiredString(input.event_type, 'host_event_type_required', 256),
    payload: input.payload,
  };
}

export function refusal(input: {
  reason: string;
  host?: HostKey | null;
  target?: RuntimeTarget | null;
  candidates?: readonly RuntimeTarget[];
}): HostFleetRefusal {
  return {
    schema: HOST_FLEET_REFUSAL_SCHEMA,
    status: 'refused',
    reason: requiredString(input.reason, 'host_refusal_reason_required', 256),
    host: input.host ? validateHostKey(input.host) : null,
    target: input.target ? validateRuntimeTarget(input.target) : null,
    candidates: [...(input.candidates ?? [])].map(validateRuntimeTarget),
  };
}
