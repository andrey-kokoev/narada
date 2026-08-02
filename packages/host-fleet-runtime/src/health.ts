import type { HostFleetRuntimeConfig } from './config.js';

export const HOST_FLEET_RUNTIME_HEALTH_SCHEMA = 'narada.host_fleet.runtime_health.v1' as const;

export interface HostFleetRuntimeHealth {
  schema: typeof HOST_FLEET_RUNTIME_HEALTH_SCHEMA;
  status: 'healthy' | 'degraded';
  mode: HostFleetRuntimeConfig['mode'];
  fleet_id: string;
  host_id: string;
  authority_host_id: string;
  checked_at: string;
  last_publish_attempt_at: string | null;
  last_publish_success_at: string | null;
  last_publish_failure_code: string | null;
}

export interface HostFleetPublishState {
  last_publish_attempt_at: string | null;
  last_publish_success_at: string | null;
  last_publish_failure_code: string | null;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FAILURE_CODE_PATTERN = /^host_fleet_[a-z0-9_]{1,148}$/;

export function createHostFleetRuntimeHealth(
  config: HostFleetRuntimeConfig,
  state: HostFleetPublishState,
  now: Date,
): HostFleetRuntimeHealth {
  return {
    schema: HOST_FLEET_RUNTIME_HEALTH_SCHEMA,
    status: state.last_publish_success_at !== null && state.last_publish_failure_code === null ? 'healthy' : 'degraded',
    mode: config.mode,
    fleet_id: config.fleet_id,
    host_id: config.host_id,
    authority_host_id: config.authority_host_id,
    checked_at: now.toISOString(),
    ...state,
  };
}

export function validateHostFleetRuntimeHealth(value: unknown): HostFleetRuntimeHealth {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('host_fleet_runtime_health_invalid');
  const source = value as Record<string, unknown>;
  const expected = [
    'schema', 'status', 'mode', 'fleet_id', 'host_id', 'authority_host_id', 'checked_at',
    'last_publish_attempt_at', 'last_publish_success_at', 'last_publish_failure_code',
  ].sort();
  const actual = Object.keys(source).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('host_fleet_runtime_health_invalid');
  }
  if (source.schema !== HOST_FLEET_RUNTIME_HEALTH_SCHEMA) throw new Error('host_fleet_runtime_health_schema_invalid');
  if (source.status !== 'healthy' && source.status !== 'degraded') throw new Error('host_fleet_runtime_health_status_invalid');
  if (source.mode !== 'authority' && source.mode !== 'publisher') throw new Error('host_fleet_runtime_health_mode_invalid');
  for (const key of ['fleet_id', 'host_id', 'authority_host_id'] as const) {
    if (typeof source[key] !== 'string' || !ID_PATTERN.test(source[key])) throw new Error('host_fleet_runtime_health_identity_invalid');
  }
  if (typeof source.checked_at !== 'string' || source.checked_at.length === 0) throw new Error('host_fleet_runtime_health_invalid');
  for (const key of ['last_publish_attempt_at', 'last_publish_success_at', 'last_publish_failure_code'] as const) {
    if (source[key] !== null && typeof source[key] !== 'string') throw new Error('host_fleet_runtime_health_invalid');
  }
  for (const key of ['checked_at', 'last_publish_attempt_at', 'last_publish_success_at'] as const) {
    if (source[key] !== null && Number.isNaN(Date.parse(source[key] as string))) throw new Error('host_fleet_runtime_health_timestamp_invalid');
  }
  if (source.last_publish_failure_code !== null && !FAILURE_CODE_PATTERN.test(source.last_publish_failure_code as string)) {
    throw new Error('host_fleet_runtime_health_failure_code_invalid');
  }
  if (source.status === 'healthy' && (source.last_publish_success_at === null || source.last_publish_failure_code !== null)) {
    throw new Error('host_fleet_runtime_health_state_incoherent');
  }
  return source as unknown as HostFleetRuntimeHealth;
}
