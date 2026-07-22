import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface SessionDiscovery {
  sessionId: string | null;
  eventEndpoint: string;
  healthEndpoint: string | null;
  source: 'attach' | 'launch_binding' | 'discovery_reference';
}

const OPERATOR_PROJECTION_LAUNCH_BINDING_SCHEMA = 'narada.operator_projection_launch_binding.v1';
const OPERATOR_PROJECTION_LAUNCH_BINDING_REF_SCHEMA = 'narada.operator_projection_launch_binding_ref.v1';
const AGENT_START_RESULT_SCHEMA = 'narada.agent_start.result.v0';
const SESSION_INDEX_RECORD_SCHEMA = 'narada.nars.session_index_record.v1';

type JsonRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function requiredString(value: unknown, code: string): string {
  const result = firstString(value);
  if (!result) throw new Error(code);
  return result;
}

function websocketEndpoint(value: unknown, code = 'nars_event_endpoint_invalid'): string {
  const endpoint = requiredString(value, code);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(code);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new Error(code);
  return parsed.toString();
}

function healthEndpoint(value: unknown): string | null {
  const endpoint = firstString(value);
  if (!endpoint) return null;
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('nars_health_endpoint_invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('nars_health_endpoint_invalid');
  }
  return parsed.toString();
}

function readJsonRecord(path: string, code: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(code);
  }
  const result = record(parsed);
  if (!result) throw new Error(code);
  return result;
}

function nestedRecord(value: JsonRecord, key: string): JsonRecord {
  return record(value[key]) ?? {};
}

function bindingSessionId(binding: JsonRecord): string | null {
  const sessionRef = nestedRecord(binding, 'session_ref');
  return firstString(
    binding.session_id,
    binding.nars_session_id,
    binding.runtime_session_id,
    binding.carrier_session_id,
    sessionRef.id,
  );
}

function resultSessionId(result: JsonRecord): string | null {
  const handoff = nestedRecord(result, 'handoff');
  const sessionRef = nestedRecord(handoff, 'session_ref');
  const narsLaunch = nestedRecord(result, 'nars_launch');
  const carrierSession = nestedRecord(result, 'carrier_session');
  return firstString(
    result.nars_session_id,
    result.session_id,
    narsLaunch.nars_session_id,
    narsLaunch.session_id,
    carrierSession.nars_session_id,
    carrierSession.session_id,
    sessionRef.id,
  );
}

function assertCorrelation(binding: JsonRecord, result: JsonRecord): void {
  const bindingAgent = firstString(binding.agent);
  const resultAgent = firstString(result.identity, result.agent_id);
  if (bindingAgent && resultAgent && bindingAgent !== resultAgent) {
    throw new Error('launch_binding_agent_mismatch');
  }
  const bindingSite = firstString(binding.site_root);
  const resultSite = firstString(
    result.target_site_root,
    result.session_site_root,
    nestedRecord(result, 'required_environment').NARADA_SITE_ROOT,
  );
  if (bindingSite && resultSite && normalizePath(bindingSite) !== normalizePath(resultSite)) {
    throw new Error('launch_binding_site_root_mismatch');
  }
  const bindingLaunch = firstString(binding.launch_session_id);
  const resultLaunch = firstString(
    result.launch_session_id,
    nestedRecord(result, 'required_environment').NARADA_LAUNCH_SESSION_ID,
  );
  if (bindingLaunch && resultLaunch && bindingLaunch !== resultLaunch) {
    throw new Error('launch_binding_launch_session_mismatch');
  }
  const bindingId = bindingSessionId(binding);
  const resultId = resultSessionId(result);
  if (bindingId && resultId && bindingId !== resultId) {
    throw new Error('launch_binding_session_mismatch');
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/[\\/]+$/, '').toLowerCase();
}

function sessionRecordPath(value: string): string {
  const normalized = value.toLowerCase().endsWith('.jsonl') || value.toLowerCase().endsWith('.json')
    ? join(dirname(value), 'session-index-record.json')
    : join(value, 'session-index-record.json');
  return normalized;
}

function resolveEndpointsFromSessionRecord(binding: JsonRecord, result: JsonRecord): {
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  sessionId: string | null;
} {
  const narsLaunch = nestedRecord(result, 'nars_launch');
  const carrierSession = nestedRecord(result, 'carrier_session');
  const candidates = [
    binding.session_path,
    binding.session_dir,
    result.session_path,
    result.session_dir,
    narsLaunch.session_path,
    narsLaunch.session_dir,
    carrierSession.session_path,
    carrierSession.session_dir,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  for (const candidate of candidates) {
    const path = sessionRecordPath(candidate);
    try {
      const session = readJsonRecord(path, 'launch_binding_session_record_invalid');
      if (session.schema !== SESSION_INDEX_RECORD_SCHEMA) throw new Error('launch_binding_session_record_invalid');
      return {
        eventEndpoint: firstString(session.event_endpoint, session.websocket_endpoint),
        healthEndpoint: firstString(session.health_endpoint),
        sessionId: firstString(session.session_id, session.nars_session_id, session.carrier_session_id),
      };
    } catch {
      // The session index may not exist while the runtime is still starting.
    }
  }
  return { eventEndpoint: null, healthEndpoint: null, sessionId: null };
}

function resolveLaunchBinding(binding: JsonRecord): SessionDiscovery {
  const schema = firstString(binding.schema);
  if (schema !== OPERATOR_PROJECTION_LAUNCH_BINDING_SCHEMA
    && schema !== OPERATOR_PROJECTION_LAUNCH_BINDING_REF_SCHEMA) {
    throw new Error('launch_binding_schema_invalid');
  }
  if (schema === OPERATOR_PROJECTION_LAUNCH_BINDING_SCHEMA) {
    if (firstString(binding.status) !== 'ready') throw new Error('launch_binding_not_ready');
    requiredString(binding.site_root, 'launch_binding_site_root_missing');
    requiredString(binding.workspace_root, 'launch_binding_workspace_root_missing');
    requiredString(binding.agent, 'launch_binding_agent_missing');
    requiredString(binding.runtime_host_kind, 'launch_binding_runtime_host_missing');
  } else {
    if (binding.exact_attach_required !== true) throw new Error('launch_binding_exact_attach_required');
    const lease = nestedRecord(binding, 'lease');
    if (firstString(lease.schema) !== 'narada.operator_projection_attachment_lease.v1') {
      throw new Error('launch_binding_attachment_lease_invalid');
    }
    if (!firstString(binding.path, lease.binding_path)) throw new Error('launch_binding_path_missing');
  }

  const nested = nestedRecord(binding, 'session_started');
  const events = nestedRecord(binding, 'nars_events');
  let eventEndpoint = firstString(
    binding.event_endpoint,
    binding.events_endpoint,
    binding.websocket_endpoint,
    events.endpoint,
    nested.event_endpoint,
    nested.events_endpoint,
    nested.websocket_endpoint,
  );
  let health = firstString(binding.health_endpoint, nested.health_endpoint);
  let sessionId = bindingSessionId(binding);
  const resultPath = firstString(binding.agent_start_result_file, binding.result_file);
  if (resultPath) {
    const result = readJsonRecord(resultPath, 'launch_binding_result_invalid');
    if (result.schema !== AGENT_START_RESULT_SCHEMA) throw new Error('launch_binding_result_schema_invalid');
    assertCorrelation(binding, result);
    sessionId ??= resultSessionId(result);
    const resultEvents = nestedRecord(result, 'nars_events');
    eventEndpoint ??= firstString(result.event_endpoint, resultEvents.endpoint);
    health ??= firstString(result.health_endpoint, nestedRecord(result, 'nars_health').endpoint);
    if (!eventEndpoint) {
      const session = resolveEndpointsFromSessionRecord(binding, result);
      eventEndpoint = session.eventEndpoint;
      health ??= session.healthEndpoint;
      sessionId ??= session.sessionId;
    }
  }
  const endpoint = websocketEndpoint(eventEndpoint, 'nars_event_endpoint_missing_from_launch_binding');
  const resolvedHealth = healthEndpoint(health);
  return {
    sessionId,
    eventEndpoint: endpoint,
    healthEndpoint: resolvedHealth,
    source: 'launch_binding',
  };
}

export function resolveSessionDiscovery(input: string | URL | Record<string, unknown>): SessionDiscovery {
  if (input instanceof URL) {
    return { sessionId: null, eventEndpoint: websocketEndpoint(input.toString()), healthEndpoint: null, source: 'attach' };
  }
  if (typeof input === 'string') {
    const value = input.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      return { sessionId: null, eventEndpoint: websocketEndpoint(value), healthEndpoint: null, source: 'attach' };
    }
    const parsed = JSON.parse(readFileSync(value, 'utf8')) as Record<string, unknown>;
    return resolveSessionDiscovery(parsed);
  }
  const binding = input;
  if (binding.schema === OPERATOR_PROJECTION_LAUNCH_BINDING_SCHEMA
    || binding.schema === OPERATOR_PROJECTION_LAUNCH_BINDING_REF_SCHEMA) {
    return resolveLaunchBinding(binding);
  }
  const nested = binding.session_started && typeof binding.session_started === 'object'
    ? binding.session_started as Record<string, unknown>
    : {};
  const events = binding.nars_events && typeof binding.nars_events === 'object'
    ? binding.nars_events as Record<string, unknown>
    : {};
  const eventEndpoint = firstString(
    binding.event_endpoint,
    binding.events_endpoint,
    binding.websocket_endpoint,
    events.endpoint,
    nested.event_endpoint,
    nested.events_endpoint,
    nested.websocket_endpoint,
  );
  const endpoint = websocketEndpoint(eventEndpoint, 'nars_event_endpoint_missing_from_discovery_reference');
  return {
    sessionId: firstString(binding.session_id, binding.nars_session_id, nested.session_id),
    eventEndpoint: endpoint,
    healthEndpoint: healthEndpoint(firstString(binding.health_endpoint, nested.health_endpoint)),
    source: 'discovery_reference',
  };
}
