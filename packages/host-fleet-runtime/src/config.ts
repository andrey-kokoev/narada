import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { HostFleetPlatform } from '@narada-core/host-fleet';

export const HOST_FLEET_RUNTIME_CONFIG_SCHEMA = 'narada.host_fleet.runtime_config.v1' as const;
export const DEFAULT_HOST_FLEET_AUTHORITY_PORT = 61_732;

export interface HostFleetCredentialRef {
  key_id: string;
  file: string;
  accept_until: string | null;
}

export interface HostFleetRosterEntry {
  host_id: string;
  display_name: string;
  platform: HostFleetPlatform;
  operator_console_url: string | null;
  operator_console_health_url: string | null;
}

export interface HostFleetRuntimeConfig {
  schema: typeof HOST_FLEET_RUNTIME_CONFIG_SCHEMA;
  mode: 'authority' | 'publisher';
  fleet_id: string;
  host_id: string;
  authority_host_id: string;
  ingress_url: string | null;
  allow_insecure_ingress: boolean;
  local_health_url: string | null;
  listener: { host: '127.0.0.1' | '::1'; port: number };
  credentials: {
    active: HostFleetCredentialRef;
    previous: HostFleetCredentialRef | null;
  };
  heartbeat: {
    interval_ms: number;
    stale_after_ms: number;
    max_clock_skew_ms: number;
    max_body_bytes: number;
  };
  probe: {
    interval_ms: number;
    timeout_ms: number;
  };
  roster: HostFleetRosterEntry[];
}

export interface HostFleetMachinePaths {
  config_path: string;
  state_path: string;
  service_definition_path: string | null;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const KEY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const PLATFORMS: readonly HostFleetPlatform[] = ['windows', 'linux', 'macos', 'cloudflare', 'unknown'];

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  const parsed = record(value, code);
  const actual = Object.keys(parsed).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
  return parsed;
}

function text(value: unknown, code: string, max = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw new Error(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const parsed = text(value, code, 64).toLowerCase();
  if (!ID_PATTERN.test(parsed)) throw new Error(code);
  return parsed;
}

function integer(value: unknown, minimum: number, maximum: number, code: string): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

function absolutePath(value: unknown, code: string): string {
  const parsed = text(value, code, 4_096);
  if (!isAbsolute(parsed)) throw new Error(code);
  return resolve(parsed);
}

function nullableUrl(value: unknown, code: string, loopbackOnly = false): string | null {
  if (value === null) return null;
  const source = text(value, code, 2_048);
  let parsed: URL;
  try { parsed = new URL(source); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error(code);
  if (loopbackOnly && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) throw new Error(code);
  return parsed.toString().replace(/\/$/, '');
}

function credential(value: unknown, previous: boolean): HostFleetCredentialRef {
  const parsed = exact(value, ['key_id', 'file', 'accept_until'], 'host_fleet_credential_ref_keys_invalid');
  const keyId = text(parsed.key_id, 'host_fleet_credential_key_id_invalid', 64);
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error('host_fleet_credential_key_id_invalid');
  const acceptUntil = parsed.accept_until === null ? null : text(parsed.accept_until, 'host_fleet_credential_accept_until_invalid', 64);
  if (acceptUntil !== null && Number.isNaN(Date.parse(acceptUntil))) throw new Error('host_fleet_credential_accept_until_invalid');
  if (previous && acceptUntil === null) throw new Error('host_fleet_previous_credential_expiry_required');
  if (!previous && acceptUntil !== null) throw new Error('host_fleet_active_credential_expiry_forbidden');
  return { key_id: keyId, file: absolutePath(parsed.file, 'host_fleet_credential_file_invalid'), accept_until: acceptUntil };
}

function rosterEntry(value: unknown): HostFleetRosterEntry {
  const parsed = exact(
    value,
    ['host_id', 'display_name', 'platform', 'operator_console_url', 'operator_console_health_url'],
    'host_fleet_roster_entry_keys_invalid',
  );
  const platform = text(parsed.platform, 'host_fleet_roster_platform_invalid', 32) as HostFleetPlatform;
  if (!PLATFORMS.includes(platform)) throw new Error('host_fleet_roster_platform_invalid');
  return {
    host_id: id(parsed.host_id, 'host_fleet_roster_host_id_invalid'),
    display_name: text(parsed.display_name, 'host_fleet_roster_display_name_invalid'),
    platform,
    operator_console_url: nullableUrl(parsed.operator_console_url, 'host_fleet_roster_console_url_invalid'),
    operator_console_health_url: nullableUrl(parsed.operator_console_health_url, 'host_fleet_roster_health_url_invalid'),
  };
}

export function validateHostFleetRuntimeConfig(value: unknown): HostFleetRuntimeConfig {
  const parsed = exact(value, [
    'schema', 'mode', 'fleet_id', 'host_id', 'authority_host_id', 'ingress_url', 'allow_insecure_ingress', 'local_health_url',
    'listener', 'credentials', 'heartbeat', 'probe', 'roster',
  ], 'host_fleet_runtime_config_keys_invalid');
  if (parsed.schema !== HOST_FLEET_RUNTIME_CONFIG_SCHEMA) throw new Error('host_fleet_runtime_config_schema_invalid');
  if (parsed.mode !== 'authority' && parsed.mode !== 'publisher') throw new Error('host_fleet_runtime_mode_invalid');
  const listener = exact(parsed.listener, ['host', 'port'], 'host_fleet_listener_keys_invalid');
  if (listener.host !== '127.0.0.1' && listener.host !== '::1') throw new Error('host_fleet_listener_not_loopback');
  const credentials = exact(parsed.credentials, ['active', 'previous'], 'host_fleet_credentials_keys_invalid');
  const heartbeat = exact(parsed.heartbeat, ['interval_ms', 'stale_after_ms', 'max_clock_skew_ms', 'max_body_bytes'], 'host_fleet_heartbeat_policy_keys_invalid');
  const probe = exact(parsed.probe, ['interval_ms', 'timeout_ms'], 'host_fleet_probe_policy_keys_invalid');
  if (!Array.isArray(parsed.roster)) throw new Error('host_fleet_roster_invalid');
  const roster = parsed.roster.map(rosterEntry);
  const ids = new Set<string>();
  for (const entry of roster) {
    if (ids.has(entry.host_id)) throw new Error('host_fleet_roster_host_duplicate');
    ids.add(entry.host_id);
  }
  const mode = parsed.mode;
  const hostId = id(parsed.host_id, 'host_fleet_runtime_host_id_invalid');
  const authorityHostId = id(parsed.authority_host_id, 'host_fleet_authority_host_id_invalid');
  const ingressUrl = nullableUrl(parsed.ingress_url, 'host_fleet_ingress_url_invalid');
  if (typeof parsed.allow_insecure_ingress !== 'boolean') throw new Error('host_fleet_allow_insecure_ingress_invalid');
  if (mode === 'authority' && (!ids.has(hostId) || authorityHostId !== hostId || ingressUrl !== null)) {
    throw new Error('host_fleet_authority_config_incoherent');
  }
  if (mode === 'publisher' && (roster.length !== 0 || ingressUrl === null || hostId === authorityHostId)) {
    throw new Error('host_fleet_publisher_config_incoherent');
  }
  const active = credential(credentials.active, false);
  const previous = credentials.previous === null ? null : credential(credentials.previous, true);
  if (previous?.key_id === active.key_id) throw new Error('host_fleet_credential_key_id_duplicate');
  if (mode === 'publisher' && previous !== null) throw new Error('host_fleet_publisher_previous_credential_forbidden');
  if (ingressUrl && new URL(ingressUrl).protocol === 'http:' && !parsed.allow_insecure_ingress) {
    throw new Error('host_fleet_insecure_ingress_requires_opt_in');
  }
  const heartbeatInterval = integer(heartbeat.interval_ms, 1_000, 300_000, 'host_fleet_heartbeat_interval_invalid');
  const staleAfter = integer(heartbeat.stale_after_ms, 2_000, 900_000, 'host_fleet_stale_after_invalid');
  if (staleAfter <= heartbeatInterval) throw new Error('host_fleet_stale_after_must_exceed_interval');
  return {
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode,
    fleet_id: id(parsed.fleet_id, 'host_fleet_id_invalid'),
    host_id: hostId,
    authority_host_id: authorityHostId,
    ingress_url: ingressUrl,
    allow_insecure_ingress: parsed.allow_insecure_ingress,
    local_health_url: nullableUrl(parsed.local_health_url, 'host_fleet_local_health_url_invalid', true),
    listener: { host: listener.host, port: integer(listener.port, 1, 65_535, 'host_fleet_listener_port_invalid') },
    credentials: { active, previous },
    heartbeat: {
      interval_ms: heartbeatInterval,
      stale_after_ms: staleAfter,
      max_clock_skew_ms: integer(heartbeat.max_clock_skew_ms, 1_000, 300_000, 'host_fleet_clock_skew_invalid'),
      max_body_bytes: integer(heartbeat.max_body_bytes, 256, 65_536, 'host_fleet_body_limit_invalid'),
    },
    probe: {
      interval_ms: integer(probe.interval_ms, 1_000, 300_000, 'host_fleet_probe_interval_invalid'),
      timeout_ms: integer(probe.timeout_ms, 100, 30_000, 'host_fleet_probe_timeout_invalid'),
    },
    roster,
  };
}

export async function readHostFleetRuntimeConfig(path: string): Promise<HostFleetRuntimeConfig> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(resolve(path), 'utf8')); }
  catch { throw new Error('host_fleet_runtime_config_unavailable'); }
  return validateHostFleetRuntimeConfig(parsed);
}

export function defaultHostFleetMachinePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): HostFleetMachinePaths {
  if (platform === 'win32') {
    const root = resolve(env.ProgramData?.trim() || 'C:\\ProgramData', 'Narada', 'host-fleet');
    return { config_path: join(root, 'config.json'), state_path: join(root, 'state.sqlite'), service_definition_path: null };
  }
  if (platform === 'linux') {
    return {
      config_path: '/etc/narada/host-fleet/config.json',
      state_path: '/var/lib/narada/host-fleet/state.sqlite',
      service_definition_path: '/etc/systemd/system/narada-host-fleet.service',
    };
  }
  const root = resolve(env.HOME?.trim() || homedir(), '.narada', 'host-fleet');
  return { config_path: join(root, 'config.json'), state_path: join(root, 'state.sqlite'), service_definition_path: null };
}
