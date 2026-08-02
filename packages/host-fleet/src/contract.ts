export const HOST_FLEET_HOST_SCHEMA = 'narada.host_fleet.host.v1' as const;
export const HOST_FLEET_SNAPSHOT_SCHEMA = 'narada.host_fleet.snapshot.v1' as const;
export const HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA = 'narada.host_fleet.membership_authority.v1' as const;

export type HostFleetPlatform = 'windows' | 'linux' | 'macos' | 'cloudflare' | 'unknown';
export type HostFleetReachabilityStatus = 'reachable' | 'unreachable' | 'unknown';
export type HostFleetHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';
export type HostFleetConsoleStatus = 'available' | 'unavailable' | 'unknown';

export interface HostFleetIdentity {
  host_id: string;
  display_name: string;
  platform: HostFleetPlatform;
}

export interface HostFleetReachability {
  status: HostFleetReachabilityStatus;
  observed_at: string | null;
}

export interface HostFleetHealth {
  status: HostFleetHealthStatus;
  observed_at: string | null;
  detail: string | null;
}

export interface HostFleetOperatorConsole {
  status: HostFleetConsoleStatus;
  url: string | null;
}

export interface HostFleetHostInput {
  identity: HostFleetIdentity;
  reachability: HostFleetReachability;
  health: HostFleetHealth;
  operator_console: HostFleetOperatorConsole;
}

export interface HostFleetHost extends HostFleetHostInput {
  schema: typeof HOST_FLEET_HOST_SCHEMA;
}

export interface HostFleetSnapshot {
  schema: typeof HOST_FLEET_SNAPSHOT_SCHEMA;
  generated_at: string;
  hosts: HostFleetHost[];
}

export interface HostFleetMembershipAuthority {
  schema: typeof HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA;
  scope: 'host';
  host_fleet_membership_secret: string;
}

export interface HostFleetAuthenticatedObservation {
  host: HostFleetHostInput;
  host_fleet_membership_secret: string;
}

const HOST_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PLATFORMS: readonly HostFleetPlatform[] = ['windows', 'linux', 'macos', 'cloudflare', 'unknown'];
const REACHABILITY: readonly HostFleetReachabilityStatus[] = ['reachable', 'unreachable', 'unknown'];
const HEALTH: readonly HostFleetHealthStatus[] = ['healthy', 'degraded', 'unavailable', 'unknown'];
const CONSOLE: readonly HostFleetConsoleStatus[] = ['available', 'unavailable', 'unknown'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[], code: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new Error(code);
  }
  return value;
}

function requiredString(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) throw new Error(code);
  return value.trim();
}

function nullableString(value: unknown, code: string, maxLength: number): string | null {
  return value === null ? null : requiredString(value, code, maxLength);
}

function timestamp(value: unknown, code: string): string {
  const normalized = requiredString(value, code, 64);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function nullableTimestamp(value: unknown, code: string): string | null {
  return value === null ? null : timestamp(value, code);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(code);
  return value as T;
}

function operatorConsoleUrl(value: unknown): string | null {
  if (value === null) return null;
  const normalized = requiredString(value, 'host_fleet_operator_console_url_invalid', 2_048);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('host_fleet_operator_console_url_invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.hash) {
    throw new Error('host_fleet_operator_console_url_invalid');
  }
  return parsed.toString().replace(/\/$/, '');
}

function validateIdentity(value: unknown): HostFleetIdentity {
  const record = exactKeys(value, ['host_id', 'display_name', 'platform'], 'host_fleet_identity_keys_invalid');
  const hostId = requiredString(record.host_id, 'host_fleet_host_id_invalid', 64).toLowerCase();
  if (!HOST_ID_PATTERN.test(hostId)) throw new Error('host_fleet_host_id_invalid');
  return {
    host_id: hostId,
    display_name: requiredString(record.display_name, 'host_fleet_display_name_invalid', 256),
    platform: enumValue(record.platform, PLATFORMS, 'host_fleet_platform_invalid'),
  };
}

function validateReachability(value: unknown): HostFleetReachability {
  const record = exactKeys(value, ['status', 'observed_at'], 'host_fleet_reachability_keys_invalid');
  const status = enumValue(record.status, REACHABILITY, 'host_fleet_reachability_status_invalid');
  const observedAt = nullableTimestamp(record.observed_at, 'host_fleet_reachability_observed_at_invalid');
  if (status === 'reachable' && observedAt === null) throw new Error('host_fleet_reachability_observation_required');
  return { status, observed_at: observedAt };
}

function validateHealth(value: unknown): HostFleetHealth {
  const record = exactKeys(value, ['status', 'observed_at', 'detail'], 'host_fleet_health_keys_invalid');
  const status = enumValue(record.status, HEALTH, 'host_fleet_health_status_invalid');
  const observedAt = nullableTimestamp(record.observed_at, 'host_fleet_health_observed_at_invalid');
  if (status !== 'unknown' && observedAt === null) throw new Error('host_fleet_health_observation_required');
  return {
    status,
    observed_at: observedAt,
    detail: nullableString(record.detail, 'host_fleet_health_detail_invalid', 1_024),
  };
}

function validateOperatorConsole(value: unknown): HostFleetOperatorConsole {
  const record = exactKeys(value, ['status', 'url'], 'host_fleet_operator_console_keys_invalid');
  const status = enumValue(record.status, CONSOLE, 'host_fleet_operator_console_status_invalid');
  const url = operatorConsoleUrl(record.url);
  if (status === 'available' && url === null) throw new Error('host_fleet_operator_console_url_required');
  return { status, url };
}

export function validateHostFleetHostInput(value: unknown): HostFleetHostInput {
  const record = exactKeys(
    value,
    ['identity', 'reachability', 'health', 'operator_console'],
    'host_fleet_host_keys_invalid',
  );
  return {
    identity: validateIdentity(record.identity),
    reachability: validateReachability(record.reachability),
    health: validateHealth(record.health),
    operator_console: validateOperatorConsole(record.operator_console),
  };
}

export function validateHostFleetHost(value: unknown): HostFleetHost {
  const record = exactKeys(
    value,
    ['schema', 'identity', 'reachability', 'health', 'operator_console'],
    'host_fleet_host_keys_invalid',
  );
  if (record.schema !== HOST_FLEET_HOST_SCHEMA) throw new Error('host_fleet_host_schema_invalid');
  return {
    schema: HOST_FLEET_HOST_SCHEMA,
    ...validateHostFleetHostInput({
      identity: record.identity,
      reachability: record.reachability,
      health: record.health,
      operator_console: record.operator_console,
    }),
  };
}

export function validateHostFleetSnapshot(value: unknown): HostFleetSnapshot {
  const record = exactKeys(value, ['schema', 'generated_at', 'hosts'], 'host_fleet_snapshot_keys_invalid');
  if (record.schema !== HOST_FLEET_SNAPSHOT_SCHEMA) throw new Error('host_fleet_snapshot_schema_invalid');
  if (!Array.isArray(record.hosts)) throw new Error('host_fleet_snapshot_hosts_invalid');
  const hosts = record.hosts.map(validateHostFleetHost);
  const hostIds = new Set<string>();
  for (const host of hosts) {
    if (hostIds.has(host.identity.host_id)) throw new Error('host_fleet_snapshot_host_duplicate');
    hostIds.add(host.identity.host_id);
  }
  return {
    schema: HOST_FLEET_SNAPSHOT_SCHEMA,
    generated_at: timestamp(record.generated_at, 'host_fleet_snapshot_generated_at_invalid'),
    hosts,
  };
}

function membershipSecret(value: unknown): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 4_096) {
    throw new Error('host_fleet_membership_secret_invalid');
  }
  return value;
}

export function validateHostFleetMembershipAuthority(value: unknown): HostFleetMembershipAuthority {
  const record = exactKeys(
    value,
    ['schema', 'scope', 'host_fleet_membership_secret'],
    'host_fleet_membership_authority_keys_invalid',
  );
  if (record.schema !== HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA) {
    throw new Error('host_fleet_membership_authority_schema_invalid');
  }
  if (record.scope !== 'host') throw new Error('host_fleet_membership_authority_scope_invalid');
  return {
    schema: HOST_FLEET_MEMBERSHIP_AUTHORITY_SCHEMA,
    scope: 'host',
    host_fleet_membership_secret: membershipSecret(record.host_fleet_membership_secret),
  };
}

export function validateHostFleetAuthenticatedObservation(value: unknown): HostFleetAuthenticatedObservation {
  const record = exactKeys(
    value,
    ['host', 'host_fleet_membership_secret'],
    'host_fleet_authenticated_observation_keys_invalid',
  );
  return {
    host: validateHostFleetHostInput(record.host),
    host_fleet_membership_secret: membershipSecret(record.host_fleet_membership_secret),
  };
}
