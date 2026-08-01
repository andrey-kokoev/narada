export const HOST_FLEET_REGISTRY_SCHEMA = 'narada.host_fleet.registry.v1' as const;
export const HOST_RECORD_SCHEMA = 'narada.host_fleet.host_record.v1' as const;
export const HOST_GATEWAY_HEALTH_SCHEMA = 'narada.host_fleet.gateway_health.v1' as const;
export const HOST_SESSION_DISCOVERY_SCHEMA = 'narada.host_fleet.session_discovery.v1' as const;
export const HOST_QUALIFIED_EVENT_SCHEMA = 'narada.host_fleet.qualified_event.v1' as const;
export const HOST_FLEET_REFUSAL_SCHEMA = 'narada.host_fleet.refusal.v1' as const;
export const HOST_FLEET_OVERVIEW_SCHEMA = 'narada.host_fleet.overview.v1' as const;
export const HOST_GATEWAY_CREDENTIAL_SCHEMA = 'narada.host_fleet.gateway_credential.v1' as const;
export const HOST_FLEET_LIFECYCLE_INTENT_SCHEMA = 'narada.host_fleet.lifecycle_intent.v1' as const;
export const HOST_FLEET_LIFECYCLE_RESULT_SCHEMA = 'narada.host_fleet.lifecycle_result.v1' as const;
export const HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA = 'narada.host_fleet.lifecycle_preflight.v1' as const;
export const HOST_FLEET_ENROLLMENT_INTENT_SCHEMA = 'narada.host_fleet.enrollment_intent.v1' as const;
export const HOST_FLEET_ENROLLMENT_RESULT_SCHEMA = 'narada.host_fleet.enrollment_result.v1' as const;
export const HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA = 'narada.host_fleet.enrollment_preflight.v1' as const;
export const HOST_FLEET_LAUNCH_INTENT_SCHEMA = 'narada.host_fleet.launch_intent.v1' as const;
export const HOST_FLEET_LAUNCH_RESULT_SCHEMA = 'narada.host_fleet.launch_result.v1' as const;
export const HOST_FLEET_LAUNCH_PREFLIGHT_SCHEMA = 'narada.host_fleet.launch_preflight.v1' as const;
export const HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA = 'narada.host_fleet.credential_rotation_intent.v1' as const;
export const HOST_FLEET_CREDENTIAL_ROTATION_RESULT_SCHEMA = 'narada.host_fleet.credential_rotation_result.v1' as const;
export const HOST_FLEET_CREDENTIAL_ROTATION_PREFLIGHT_SCHEMA = 'narada.host_fleet.credential_rotation_preflight.v1' as const;

export type HostPlatform = 'windows' | 'linux' | 'macos' | 'cloudflare' | 'unknown';
export type HostGatewayTransport = 'loopback' | 'ssh-tunnel' | 'https' | 'cloudflare';
export type HostLifecycleState = 'pending' | 'active' | 'revoked' | 'retired';
export type HostHealthStatus = 'unknown' | 'online' | 'degraded' | 'offline' | 'stale' | 'unauthenticated' | 'revoked';
export type RuntimeSessionState = 'active' | 'starting' | 'degraded' | 'closed' | 'stale';
export type HostGatewayCredentialClass = 'bridge_compatibility' | 'dedicated_host_gateway';
export type HostFleetLifecycleOperation = 'revoke' | 'retire';

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

export interface HostGatewayBindingInput {
  endpoint: string;
  transport: HostGatewayTransport;
  admitted_paths: readonly string[];
  /** Existing records default to the bridge header during migration. */
  credential?: HostGatewayCredentialPolicy;
}

export interface HostGatewayBinding extends Omit<HostGatewayBindingInput, 'credential'> {
  credential: HostGatewayCredentialPolicy;
}

export interface HostGatewayCredentialPolicy {
  schema: typeof HOST_GATEWAY_CREDENTIAL_SCHEMA;
  class: HostGatewayCredentialClass;
  not_before: string | null;
  expires_at: string | null;
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

/** The registry state needed to validate a lifecycle intent without mutation. */
export interface HostFleetLifecycleCurrent {
  host_id: string;
  host_instance_id: string;
  lifecycle_state: HostLifecycleState;
  revision: number;
}

export interface HostFleetLaunchCurrent {
  host_id: string;
  host_instance_id: string;
  lifecycle_state: HostLifecycleState;
  revision: number;
  admitted_sites: readonly string[];
}

export interface HostRecordInput {
  host_id: string;
  host_instance_id: string;
  display_name: string;
  platform: HostPlatform;
  narada_version?: string | null;
  gateway: HostGatewayBindingInput;
  capabilities?: readonly string[];
  admitted_sites?: readonly string[];
  credential_ref: string;
  lifecycle_state?: HostLifecycleState;
}

export interface HostFleetLifecycleIntent {
  schema: typeof HOST_FLEET_LIFECYCLE_INTENT_SCHEMA;
  request_id: string;
  operation: HostFleetLifecycleOperation;
  host: HostKey;
  expected_revision: number;
  confirmation: string;
  reason: string | null;
}

export interface HostFleetEnrollmentIntent {
  schema: typeof HOST_FLEET_ENROLLMENT_INTENT_SCHEMA;
  request_id: string;
  host: HostRecordInput;
  expected_revision: number | null;
  allow_reenrollment: boolean;
  confirmation: string;
}

export interface HostFleetLaunchIntent {
  schema: typeof HOST_FLEET_LAUNCH_INTENT_SCHEMA;
  request_id: string;
  host: HostKey;
  expected_revision: number;
  site_id: string;
  agent_id: string;
  operator_surface: string | null;
  confirmation: string;
}

export interface HostFleetLaunchResult {
  schema: typeof HOST_FLEET_LAUNCH_RESULT_SCHEMA;
  status: 'launched' | 'reused' | 'refused';
  mutation_performed: boolean;
  request_id: string;
  host: HostKey | null;
  site_id: string | null;
  agent_id: string | null;
  operator_surface: string | null;
  session_id: string | null;
  reason: string | null;
}

export interface HostFleetLaunchPreflight {
  schema: typeof HOST_FLEET_LAUNCH_PREFLIGHT_SCHEMA;
  status: 'ready' | 'refused';
  mutation_performed: false;
  intent: HostFleetLaunchIntent | null;
  current_revision: number | null;
  current_lifecycle_state: HostLifecycleState | null;
  refusals: readonly string[];
}

export interface HostFleetCredentialRotationIntent {
  schema: typeof HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA;
  request_id: string;
  host: HostKey;
  expected_revision: number;
  credential_ref: string;
  credential: HostGatewayCredentialPolicy;
  confirmation: string;
}

export type HostFleetCredentialRotationCurrent = Pick<HostRecord, 'host_id' | 'host_instance_id' | 'revision' | 'lifecycle_state'>;

export interface HostFleetCredentialRotationResult {
  schema: typeof HOST_FLEET_CREDENTIAL_ROTATION_RESULT_SCHEMA;
  status: 'applied' | 'replayed' | 'unchanged' | 'refused';
  mutation_performed: boolean;
  request_id: string;
  host: HostKey | null;
  revision: number | null;
  credential_class: HostGatewayCredentialClass | null;
  reason: string | null;
}

export interface HostFleetCredentialRotationPreflight {
  schema: typeof HOST_FLEET_CREDENTIAL_ROTATION_PREFLIGHT_SCHEMA;
  status: 'ready' | 'refused';
  mutation_performed: false;
  intent: HostFleetCredentialRotationIntent | null;
  current_revision: number | null;
  current_lifecycle_state: HostLifecycleState | null;
  refusals: readonly string[];
}

export interface HostFleetLifecycleResult {
  schema: typeof HOST_FLEET_LIFECYCLE_RESULT_SCHEMA;
  status: 'applied' | 'replayed' | 'unchanged' | 'refused';
  mutation_performed: boolean;
  request_id: string;
  operation: HostFleetLifecycleOperation | null;
  host: HostKey | null;
  lifecycle_state: HostLifecycleState | null;
  revision: number | null;
  reason: string | null;
}

export interface HostFleetLifecyclePreflight {
  schema: typeof HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA;
  status: 'ready' | 'refused';
  mutation_performed: false;
  intent: HostFleetLifecycleIntent | null;
  current_revision: number | null;
  current_lifecycle_state: HostLifecycleState | null;
  refusals: readonly string[];
}

export interface HostFleetEnrollmentResult {
  schema: typeof HOST_FLEET_ENROLLMENT_RESULT_SCHEMA;
  status: 'applied' | 'replayed' | 'unchanged' | 'refused';
  mutation_performed: boolean;
  request_id: string;
  host: HostKey | null;
  lifecycle_state: HostLifecycleState | null;
  revision: number | null;
  reason: string | null;
}

export interface HostFleetEnrollmentPreflight {
  schema: typeof HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA;
  status: 'ready' | 'refused';
  mutation_performed: false;
  intent: HostFleetEnrollmentIntent | null;
  candidate: HostRecord | null;
  current_revision: number | null;
  current_lifecycle_state: HostLifecycleState | null;
  refusals: readonly string[];
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

function normalizeCredentialPolicy(value: unknown): HostGatewayCredentialPolicy {
  if (value === undefined || value === null) {
    return {
      schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
      class: 'bridge_compatibility',
      not_before: null,
      expires_at: null,
    };
  }
  if (!isRecord(value) || value.schema !== HOST_GATEWAY_CREDENTIAL_SCHEMA
    || (value.class !== 'bridge_compatibility' && value.class !== 'dedicated_host_gateway')) {
    throw new Error('host_gateway_credential_policy_invalid');
  }
  const notBefore = value.not_before == null ? null : timestamp(value.not_before, 'host_gateway_credential_not_before_invalid');
  const expiresAt = value.expires_at == null ? null : timestamp(value.expires_at, 'host_gateway_credential_expires_at_invalid');
  if (notBefore && expiresAt && Date.parse(expiresAt) <= Date.parse(notBefore)) {
    throw new Error('host_gateway_credential_expiry_order_invalid');
  }
  return {
    schema: HOST_GATEWAY_CREDENTIAL_SCHEMA,
    class: value.class,
    not_before: notBefore,
    expires_at: expiresAt,
  };
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

function requestId(value: unknown, requiredCode: string, invalidCode: string): string {
  const normalized = requiredString(value, requiredCode, 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(normalized)) throw new Error(invalidCode);
  return normalized;
}

export function validateHostFleetLaunchIntent(value: unknown): HostFleetLaunchIntent {
  if (!isRecord(value) || value.schema !== HOST_FLEET_LAUNCH_INTENT_SCHEMA) {
    throw new Error('host_launch_intent_schema_invalid');
  }
  const host = validateHostKey(value.host);
  const request_id = requestId(value.request_id, 'host_launch_request_id_required', 'host_launch_request_id_invalid');
  if (!Number.isInteger(value.expected_revision) || Number(value.expected_revision) < 1) {
    throw new Error('host_launch_expected_revision_invalid');
  }
  const site_id = requiredString(value.site_id, 'host_launch_site_id_required', 256);
  const agent_id = requiredString(value.agent_id, 'host_launch_agent_id_required', 256);
  const operator_surface = value.operator_surface == null
    ? null
    : requiredString(value.operator_surface, 'host_launch_operator_surface_invalid', 128);
  if (value.confirmation !== hostKey(host)) throw new Error('host_launch_confirmation_invalid');
  return {
    schema: HOST_FLEET_LAUNCH_INTENT_SCHEMA,
    request_id,
    host,
    expected_revision: Number(value.expected_revision),
    site_id,
    agent_id,
    operator_surface,
    confirmation: hostKey(host),
  };
}

export function validateHostFleetCredentialRotationIntent(value: unknown): HostFleetCredentialRotationIntent {
  if (!isRecord(value) || value.schema !== HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA) {
    throw new Error('host_credential_rotation_intent_schema_invalid');
  }
  const host = validateHostKey(value.host);
  const request_id = requestId(value.request_id, 'host_credential_rotation_request_id_required', 'host_credential_rotation_request_id_invalid');
  if (!Number.isInteger(value.expected_revision) || Number(value.expected_revision) < 1) {
    throw new Error('host_credential_rotation_expected_revision_invalid');
  }
  if (value.confirmation !== hostKey(host)) throw new Error('host_credential_rotation_confirmation_invalid');
  return {
    schema: HOST_FLEET_CREDENTIAL_ROTATION_INTENT_SCHEMA,
    request_id,
    host,
    expected_revision: Number(value.expected_revision),
    credential_ref: normalizeCredentialRef(value.credential_ref),
    credential: normalizeCredentialPolicy(value.credential),
    confirmation: hostKey(host),
  };
}

export function preflightHostFleetLaunchIntent(
  value: unknown,
  current: HostFleetLaunchCurrent | null,
): HostFleetLaunchPreflight {
  try {
    const intent = validateHostFleetLaunchIntent(value);
    if (!current) return {
      schema: HOST_FLEET_LAUNCH_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent,
      current_revision: null,
      current_lifecycle_state: null,
      refusals: ['host_not_registered'],
    };
    const refusals: string[] = [];
    if (!hostKeysEqual(intent.host, current)) refusals.push('host_key_mismatch');
    if (intent.expected_revision !== current.revision) refusals.push('host_revision_conflict');
    if (current.lifecycle_state === 'revoked' || current.lifecycle_state === 'retired') refusals.push(`host_${current.lifecycle_state}`);
    if (!current.admitted_sites.includes(intent.site_id)) refusals.push('host_site_not_admitted');
    return {
      schema: HOST_FLEET_LAUNCH_PREFLIGHT_SCHEMA,
      status: refusals.length === 0 ? 'ready' : 'refused',
      mutation_performed: false,
      intent,
      current_revision: current.revision,
      current_lifecycle_state: current.lifecycle_state,
      refusals,
    };
  } catch (error) {
    return {
      schema: HOST_FLEET_LAUNCH_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent: null,
      current_revision: current?.revision ?? null,
      current_lifecycle_state: current?.lifecycle_state ?? null,
      refusals: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function preflightHostFleetCredentialRotationIntent(
  value: unknown,
  current: HostFleetCredentialRotationCurrent | null,
  now = new Date(),
): HostFleetCredentialRotationPreflight {
  try {
    const intent = validateHostFleetCredentialRotationIntent(value);
    if (!current) return {
      schema: HOST_FLEET_CREDENTIAL_ROTATION_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent,
      current_revision: null,
      current_lifecycle_state: null,
      refusals: ['host_not_registered'],
    };
    const refusals: string[] = [];
    if (!hostKeysEqual(intent.host, current)) refusals.push('host_key_mismatch');
    if (intent.expected_revision !== current.revision) refusals.push('host_revision_conflict');
    if (current.lifecycle_state === 'revoked' || current.lifecycle_state === 'retired') refusals.push(`host_${current.lifecycle_state}`);
    if (intent.credential.expires_at && now.getTime() >= Date.parse(intent.credential.expires_at)) refusals.push('host_gateway_credential_expired');
    if (intent.credential.not_before && now.getTime() < Date.parse(intent.credential.not_before)) refusals.push('host_gateway_credential_not_yet_valid');
    return {
      schema: HOST_FLEET_CREDENTIAL_ROTATION_PREFLIGHT_SCHEMA,
      status: refusals.length === 0 ? 'ready' : 'refused',
      mutation_performed: false,
      intent,
      current_revision: current.revision,
      current_lifecycle_state: current.lifecycle_state,
      refusals,
    };
  } catch (error) {
    return {
      schema: HOST_FLEET_CREDENTIAL_ROTATION_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent: null,
      current_revision: current?.revision ?? null,
      current_lifecycle_state: current?.lifecycle_state ?? null,
      refusals: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function validateHostFleetLifecycleIntent(value: unknown): HostFleetLifecycleIntent {
  if (!isRecord(value) || value.schema !== HOST_FLEET_LIFECYCLE_INTENT_SCHEMA) {
    throw new Error('host_lifecycle_intent_schema_invalid');
  }
  const requestId = requiredString(value.request_id, 'host_lifecycle_request_id_required', 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(requestId)) throw new Error('host_lifecycle_request_id_invalid');
  if (value.operation !== 'revoke' && value.operation !== 'retire') throw new Error('host_lifecycle_operation_invalid');
  const host = validateHostKey(value.host);
  if (!Number.isInteger(value.expected_revision) || Number(value.expected_revision) < 1) {
    throw new Error('host_lifecycle_expected_revision_invalid');
  }
  if (value.confirmation !== hostKey(host)) throw new Error('host_lifecycle_confirmation_invalid');
  const reason = value.reason == null ? null : requiredString(value.reason, 'host_lifecycle_reason_invalid', 256);
  return {
    schema: HOST_FLEET_LIFECYCLE_INTENT_SCHEMA,
    request_id: requestId,
    operation: value.operation,
    host,
    expected_revision: Number(value.expected_revision),
    confirmation: hostKey(host),
    reason,
  };
}

function normalizedHostInput(record: HostRecord): HostRecordInput {
  return {
    host_id: record.host_id,
    host_instance_id: record.host_instance_id,
    display_name: record.display_name,
    platform: record.platform,
    narada_version: record.narada_version,
    gateway: {
      endpoint: record.gateway.endpoint,
      transport: record.gateway.transport,
      admitted_paths: [...record.gateway.admitted_paths],
      credential: { ...record.gateway.credential },
    },
    capabilities: [...record.capabilities],
    admitted_sites: [...record.admitted_sites],
    credential_ref: record.credential_ref,
    lifecycle_state: record.lifecycle_state,
  };
}

export function validateHostFleetEnrollmentIntent(value: unknown): HostFleetEnrollmentIntent {
  if (!isRecord(value) || value.schema !== HOST_FLEET_ENROLLMENT_INTENT_SCHEMA) {
    throw new Error('host_enrollment_intent_schema_invalid');
  }
  const requestId = requiredString(value.request_id, 'host_enrollment_request_id_required', 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(requestId)) throw new Error('host_enrollment_request_id_invalid');
  if (!isRecord(value.host)) throw new Error('host_enrollment_host_required');
  const candidate = createHostRecord(value.host as unknown as HostRecordInput);
  const expectedRevision = value.expected_revision == null ? null : value.expected_revision;
  if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1)) {
    throw new Error('host_enrollment_expected_revision_invalid');
  }
  if (value.allow_reenrollment !== true && value.allow_reenrollment !== false) {
    throw new Error('host_enrollment_allow_reenrollment_invalid');
  }
  if (value.confirmation !== hostKey(candidate)) throw new Error('host_enrollment_confirmation_invalid');
  return {
    schema: HOST_FLEET_ENROLLMENT_INTENT_SCHEMA,
    request_id: requestId,
    host: normalizedHostInput(candidate),
    expected_revision: expectedRevision === null ? null : Number(expectedRevision),
    allow_reenrollment: value.allow_reenrollment,
    confirmation: hostKey(candidate),
  };
}

/**
 * Validate a lifecycle intent without changing the registry. The eventual
 * mutation authority must perform the same revision check immediately before
 * applying the intent; this function is a preview, not an authorization.
 */
export function preflightHostFleetLifecycleIntent(
  value: unknown,
  current: HostFleetLifecycleCurrent | null,
): HostFleetLifecyclePreflight {
  try {
    const intent = validateHostFleetLifecycleIntent(value);
    if (!current) {
      return {
        schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        current_revision: null,
        current_lifecycle_state: null,
        refusals: ['host_not_registered'],
      };
    }
    if (!hostKeysEqual(intent.host, current)) {
      return {
        schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_key_mismatch'],
      };
    }
    if (intent.expected_revision !== current.revision) {
      return {
        schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_revision_conflict'],
      };
    }
    const desiredState: HostLifecycleState = intent.operation === 'revoke' ? 'revoked' : 'retired';
    if (current.lifecycle_state === 'revoked' && desiredState === 'retired') {
      return {
        schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_revoked'],
      };
    }
    if (current.lifecycle_state === 'retired' && desiredState === 'revoked') {
      return {
        schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_retired'],
      };
    }
    return {
      schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
      status: 'ready',
      mutation_performed: false,
      intent,
      current_revision: current.revision,
      current_lifecycle_state: current.lifecycle_state,
      refusals: [],
    };
  } catch (error) {
    return {
      schema: HOST_FLEET_LIFECYCLE_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent: null,
      current_revision: current?.revision ?? null,
      current_lifecycle_state: current?.lifecycle_state ?? null,
      refusals: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function preflightHostFleetEnrollmentIntent(
  value: unknown,
  current: HostRecord | null,
): HostFleetEnrollmentPreflight {
  try {
    const intent = validateHostFleetEnrollmentIntent(value);
    const candidate = createHostRecord(intent.host);
    if (!current) {
      return {
        schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
        status: 'ready',
        mutation_performed: false,
        intent,
        candidate,
        current_revision: null,
        current_lifecycle_state: null,
        refusals: [],
      };
    }
    if (!hostKeysEqual(intent.host, current)) {
      return {
        schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
        status: intent.allow_reenrollment ? 'ready' : 'refused',
        mutation_performed: false,
        intent,
        candidate,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: intent.allow_reenrollment ? [] : ['host_instance_conflict_requires_explicit_reenrollment'],
      };
    }
    if (intent.expected_revision !== current.revision) {
      return {
        schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        candidate,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_revision_conflict'],
      };
    }
    if (current.lifecycle_state === 'revoked' && !intent.allow_reenrollment) {
      return {
        schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        intent,
        candidate,
        current_revision: current.revision,
        current_lifecycle_state: current.lifecycle_state,
        refusals: ['host_revoked_requires_explicit_reenrollment'],
      };
    }
    return {
      schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
      status: 'ready',
      mutation_performed: false,
      intent,
      candidate,
      current_revision: current.revision,
      current_lifecycle_state: current.lifecycle_state,
      refusals: [],
    };
  } catch (error) {
    return {
      schema: HOST_FLEET_ENROLLMENT_PREFLIGHT_SCHEMA,
      status: 'refused',
      mutation_performed: false,
      intent: null,
      candidate: null,
      current_revision: current?.revision ?? null,
      current_lifecycle_state: current?.lifecycle_state ?? null,
      refusals: [error instanceof Error ? error.message : String(error)],
    };
  }
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
      credential: normalizeCredentialPolicy(input.gateway?.credential),
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
    gateway: {
      ...record.gateway,
      credential: normalizeCredentialPolicy(isRecord(value.gateway) ? value.gateway.credential : undefined),
    },
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
