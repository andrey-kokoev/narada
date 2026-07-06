import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';
import { buildAgentIdentityRef, normalizeAgentIdentityRef } from '@narada2/agent-identity';
import { narsSessionsRootFromSiteRoot as resolveNarsSessionsRootFromSiteRoot } from '@narada2/site-paths';

export const NARS_SESSION_INDEX_RECORD_SCHEMA = 'narada.nars.session_index_record.v1';
export const NARS_SESSION_INDEX_SCHEMA = 'narada.nars.session_index.v1';
export const NARS_SESSION_SITE_ID_SOURCE = Object.freeze({
  SESSION_STARTED: 'session_started',
  DERIVED_FROM_SITE_ROOT_OR_AGENT_ID: 'derived_from_site_root_or_agent_id',
});
export const NARS_SESSION_STATUS_HINT_AUTHORITY = Object.freeze({
  DISCOVERY_PROJECTION_ONLY: 'discovery_projection_only',
});
export const NARS_SESSION_ATTACHED_PROJECTIONS_STATUS = Object.freeze({
  NOT_TRACKED: 'not_tracked',
});
export const NARS_SESSION_AUTHORITY_RUNTIME_HOST = Object.freeze({
  LOCAL: 'local',
  CLOUDFLARE_HOST: 'cloudflare-host',
  UNKNOWN_AUTHORITY_METADATA: 'unknown_authority_metadata',
});
export const NARS_SESSION_DISPLAY_STATE = Object.freeze({
  ACTIVE: 'active',
  STARTING_OR_DEGRADED: 'starting_or_degraded',
  CLOSED: 'closed',
  STALE: 'stale',
  HISTORICAL: 'historical',
});

const DEFAULT_HEARTBEAT_FRESH_MS = 30000;

export function narsSessionsRootFromSiteRoot(siteRoot) {
  if (!siteRoot) throw new Error('site_root_required');
  return resolveNarsSessionsRootFromSiteRoot(siteRoot);
}

export function discoverNarsSessions({ siteRoot, sessionsRoot = null, now = new Date(), heartbeatFreshMs = DEFAULT_HEARTBEAT_FRESH_MS, healthBySessionId = null } = {}) {
  const resolvedSessionsRoot = sessionsRoot ?? narsSessionsRootFromSiteRoot(siteRoot);
  const index = readNarsSessionIndex({ sessionsRoot: resolvedSessionsRoot, siteRoot });
  const sessions = index.sessions.map((entry) => {
    const record = readJson(entry.record_path);
    const heartbeat = readJson(entry.heartbeat_path);
    const health = healthBySessionId instanceof Map
      ? healthBySessionId.get(entry.session_id)
      : healthBySessionId?.[entry.session_id];
    const displayState = classifyNarsSessionDisplayState({
      record: record ?? entry,
      heartbeat,
      health,
      now,
      heartbeatFreshMs,
    });
    return {
      ...entry,
      display_state: displayState.display_state,
      display_state_reason: displayState.reason,
      heartbeat_fresh: displayState.heartbeat_fresh,
      heartbeat_age_ms: displayState.heartbeat_age_ms,
      health_status: displayState.health_status,
      record,
      heartbeat,
    };
  });
  return {
    schema: 'narada.nars.session_discovery.v1',
    site_root: index.site_root ?? siteRoot ?? null,
    sessions_root: resolvedSessionsRoot,
    generated_at: new Date(now).toISOString(),
    index,
    sessions,
  };
}

export function classifyNarsSessionDisplayState({ record, heartbeat = null, health = null, now = new Date(), heartbeatFreshMs = DEFAULT_HEARTBEAT_FRESH_MS } = {}) {
  const nowMs = new Date(now).getTime();
  const heartbeatAt = heartbeatTimestampMs(heartbeat);
  const heartbeatAgeMs = heartbeatAt === null || Number.isNaN(nowMs) ? null : Math.max(0, nowMs - heartbeatAt);
  const heartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= heartbeatFreshMs;
  const healthStatus = normalizeHealthStatus(health);
  if (healthStatus === 'healthy') {
    return stateClassification(NARS_SESSION_DISPLAY_STATE.ACTIVE, 'health_probe_succeeded', heartbeatFresh, heartbeatAgeMs, healthStatus);
  }
  if (record?.terminal_state === 'closed') {
    return stateClassification(NARS_SESSION_DISPLAY_STATE.CLOSED, 'terminal_state_closed', heartbeatFresh, heartbeatAgeMs, healthStatus);
  }
  if (heartbeatFresh) {
    return stateClassification(NARS_SESSION_DISPLAY_STATE.STARTING_OR_DEGRADED, 'fresh_heartbeat_without_health', heartbeatFresh, heartbeatAgeMs, healthStatus);
  }
  if (heartbeatAt !== null || record?.status_hint === 'alive') {
    return stateClassification(NARS_SESSION_DISPLAY_STATE.STALE, 'stale_or_missing_liveness', heartbeatFresh, heartbeatAgeMs, healthStatus);
  }
  return stateClassification(NARS_SESSION_DISPLAY_STATE.HISTORICAL, 'historical_record_only', heartbeatFresh, heartbeatAgeMs, healthStatus);
}

export function narsSessionIndexPathsFromSessionPath(sessionPath) {
  if (!sessionPath) return null;
  const sessionDir = dirname(String(sessionPath));
  return {
    session_dir: sessionDir,
    record_path: join(sessionDir, 'session-index-record.json'),
    heartbeat_path: join(sessionDir, 'heartbeat.json'),
    aggregate_path: join(dirname(sessionDir), 'index.json'),
  };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function writeNarsSessionStartedIndex({ sessionStartedEvent, sessionPath, siteRoot, now = new Date() } = {}) {
  const paths = narsSessionIndexPathsFromSessionPath(sessionPath ?? sessionStartedEvent?.session_path);
  if (!paths || !sessionStartedEvent) return null;
  const record = buildSessionIndexRecord({ sessionStartedEvent, sessionPath, siteRoot, paths, now });
  mkdirSync(paths.session_dir, { recursive: true });
  writeJson(paths.record_path, record);
  const index = rebuildNarsSessionIndex({ sessionsRoot: dirname(paths.session_dir), siteRoot: record.site_root, generatedAt: now.toISOString() });
  return { record, index, paths };
}

export function markNarsSessionIndexClosed({ sessionPath, terminalState = 'closed', terminalReason = null, closedAt = new Date().toISOString(), siteRoot } = {}) {
  const paths = narsSessionIndexPathsFromSessionPath(sessionPath);
  if (!paths || !existsSync(paths.record_path)) return null;
  const current = readJson(paths.record_path);
  if (!current || current.schema !== NARS_SESSION_INDEX_RECORD_SCHEMA) return null;
  const next = {
    ...current,
    terminal_state: terminalState,
    terminal_reason: terminalReason ?? (terminalState === 'closed' ? (current.terminal_reason ?? 'session_closed') : current.terminal_reason ?? null),
    status_hint: terminalState,
    closed_at: closedAt,
    last_seen_at: closedAt,
    projection_generated_at: closedAt,
  };
  writeJson(paths.record_path, next);
  const index = rebuildNarsSessionIndex({ sessionsRoot: dirname(paths.session_dir), siteRoot: siteRoot ?? next.site_root, generatedAt: closedAt });
  return { record: next, index, paths };
}

export function updateNarsSessionAuthorityTransitionState({ sessionPath, authorityTransitionState = null, sourceWriteAdmission = null, supersededBySessionId = undefined, authorityLocatorRef = undefined, updatedAt = new Date().toISOString(), siteRoot } = {}) {
  const paths = narsSessionIndexPathsFromSessionPath(sessionPath);
  if (!paths || !existsSync(paths.record_path)) return null;
  const current = readJson(paths.record_path);
  if (!current || current.schema !== NARS_SESSION_INDEX_RECORD_SCHEMA) return null;
  const next = {
    ...current,
    authority_transition_state: normalizeAuthorityTransitionState(authorityTransitionState),
    source_write_admission: NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(sourceWriteAdmission) ? sourceWriteAdmission : current.source_write_admission ?? null,
    ...(supersededBySessionId !== undefined ? { superseded_by_session_id: normalizeOptionalString(supersededBySessionId) } : {}),
    ...(authorityLocatorRef !== undefined ? { authority_locator_ref: normalizeOptionalString(authorityLocatorRef) } : {}),
    last_seen_at: updatedAt,
    projection_generated_at: updatedAt,
  };
  writeJson(paths.record_path, next);
  const index = rebuildNarsSessionIndex({ sessionsRoot: dirname(paths.session_dir), siteRoot: siteRoot ?? next.site_root, generatedAt: updatedAt });
  return { record: next, index, paths };
}

export function readNarsSessionIndex({ sessionsRoot, siteRoot } = {}) {
  if (!sessionsRoot || !existsSync(sessionsRoot)) {
    return buildAggregateIndex({ siteRoot, sessions: [], generatedAt: new Date().toISOString() });
  }
  const aggregatePath = join(sessionsRoot, 'index.json');
  const aggregate = readJson(aggregatePath);
  const records = readSessionIndexRecords(sessionsRoot);
  if (isValidAggregate(aggregate) && aggregateCoversSessionRecords(aggregate, records)) {
    return overlayAggregateWithSessionRecords(aggregate, records);
  }
  return rebuildNarsSessionIndex({ sessionsRoot, siteRoot });
}

export function rebuildNarsSessionIndex({ sessionsRoot, siteRoot, generatedAt = new Date().toISOString() } = {}) {
  return withSessionIndexLock(sessionsRoot, () => {
    const records = readSessionIndexRecords(sessionsRoot);
    const inferredSiteRoot = siteRoot ?? records.find((record) => record.site_root)?.site_root ?? null;
    const index = buildAggregateIndex({ siteRoot: inferredSiteRoot, sessions: records.map(toAggregateEntry), generatedAt });
    if (sessionsRoot) {
      mkdirSync(sessionsRoot, { recursive: true });
      writeJson(join(sessionsRoot, 'index.json'), index);
    }
    return index;
  });
}

export function readSessionIndexRecords(sessionsRoot) {
  if (!sessionsRoot || !existsSync(sessionsRoot)) return [];
  return readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(sessionsRoot, entry.name, 'session-index-record.json'))
    .map((path) => readJson(path))
    .filter((record) => record?.schema === NARS_SESSION_INDEX_RECORD_SCHEMA)
    .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')));
}

function buildSessionIndexRecord({ sessionStartedEvent, sessionPath, siteRoot, paths, now }) {
  const sessionId = String(sessionStartedEvent.session_id ?? sessionStartedEvent.carrier_session_id ?? '');
  const resolvedSiteRoot = String(siteRoot ?? sessionStartedEvent.site_root ?? '');
  const generatedAt = now.toISOString();
  const eventEndpoint = sessionStartedEvent.event_endpoint ?? sessionStartedEvent.websocket_endpoint ?? null;
  const healthEndpoint = sessionStartedEvent.health_endpoint ?? null;
  const authorityRuntimeHost = normalizeAuthorityRuntimeHost(
    sessionStartedEvent.authority_runtime_host
      ?? sessionStartedEvent.authority_runtime_host_kind
      ?? sessionStartedEvent.runtime_authority_host,
    NARS_SESSION_AUTHORITY_RUNTIME_HOST.LOCAL,
  );
  const authorityEpoch = normalizeAuthorityEpoch(sessionStartedEvent.authority_epoch, 1);
  const siteId = sessionStartedEvent.site_id ?? inferSiteId({ siteRoot: resolvedSiteRoot, agentId: sessionStartedEvent.agent_id });
  const agentIdentityRef = normalizeAgentIdentityRef(sessionStartedEvent.agent_identity_ref)
    ?? (sessionStartedEvent.agent_id ? buildAgentIdentityRef(sessionStartedEvent.agent_id, sessionStartedEvent.role ?? null, siteId) : null);
  return {
    schema: NARS_SESSION_INDEX_RECORD_SCHEMA,
    session_id: sessionId,
    runtime_session_id: sessionStartedEvent.runtime_session_id ?? sessionId,
    nars_session_id: sessionStartedEvent.nars_session_id ?? sessionId,
    carrier_session_id: sessionStartedEvent.carrier_session_id ?? sessionId,
    derived_from_event: 'session_started',
    projection_generated_at: generatedAt,
    agent_id: sessionStartedEvent.agent_id ?? null,
    agent_identity_ref: agentIdentityRef,
    site_id: siteId,
    site_id_source: sessionStartedEvent.site_id
      ? NARS_SESSION_SITE_ID_SOURCE.SESSION_STARTED
      : NARS_SESSION_SITE_ID_SOURCE.DERIVED_FROM_SITE_ROOT_OR_AGENT_ID,
    site_root: resolvedSiteRoot || null,
    runtime_kind: sessionStartedEvent.runtime ?? sessionStartedEvent.runtime_substrate_kind ?? 'narada-agent-runtime-server',
    launch_operator_surface_kind: sessionStartedEvent.launch_operator_surface_kind ?? sessionStartedEvent.operator_surface_kind ?? null,
    session_dir: paths.session_dir,
    session_path: sessionPath ?? sessionStartedEvent.session_path ?? null,
    events_path: sessionStartedEvent.events_path ?? null,
    heartbeat_path: paths.heartbeat_path,
    event_endpoint: eventEndpoint,
    health_endpoint: healthEndpoint,
    started_at: sessionStartedEvent.started_at ?? sessionStartedEvent.timestamp ?? generatedAt,
    last_seen_at: generatedAt,
    terminal_state: sessionStartedEvent.terminal_state ?? null,
    status_hint: 'alive',
    status_hint_authority: NARS_SESSION_STATUS_HINT_AUTHORITY.DISCOVERY_PROJECTION_ONLY,
    authority_runtime_host: authorityRuntimeHost,
    authority_epoch: authorityEpoch,
    authority_runtime_id: normalizeOptionalString(sessionStartedEvent.authority_runtime_id)
      ?? defaultAuthorityRuntimeId({ hostKind: authorityRuntimeHost, sessionId }),
    authority_transition_state: normalizeAuthorityTransitionState(sessionStartedEvent.authority_transition_state),
    source_write_admission: NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(sessionStartedEvent.source_write_admission) ? sessionStartedEvent.source_write_admission : 'active',
    superseded_by_session_id: normalizeOptionalString(sessionStartedEvent.superseded_by_session_id),
    authority_locator_ref: normalizeOptionalString(sessionStartedEvent.authority_locator_ref),
    attached_projections: null,
    attached_projections_status: NARS_SESSION_ATTACHED_PROJECTIONS_STATUS.NOT_TRACKED,
    attach_commands: sessionStartedEvent.attach_commands ?? null,
  };
}

function toAggregateEntry(record) {
  return {
    session_id: record.session_id,
    runtime_session_id: record.runtime_session_id ?? record.session_id,
    nars_session_id: record.nars_session_id ?? record.session_id,
    carrier_session_id: record.carrier_session_id ?? record.session_id,
    agent_id: record.agent_id ?? null,
    agent_identity_ref: normalizeAgentIdentityRef(record.agent_identity_ref),
    site_id: record.site_id ?? null,
    site_id_source: record.site_id_source ?? null,
    session_dir: record.session_dir,
    record_path: join(record.session_dir, 'session-index-record.json'),
    heartbeat_path: record.heartbeat_path ?? join(record.session_dir, 'heartbeat.json'),
    event_endpoint: record.event_endpoint ?? null,
    health_endpoint: record.health_endpoint ?? null,
    started_at: record.started_at ?? null,
    last_seen_at: record.last_seen_at ?? null,
    terminal_state: record.terminal_state ?? null,
    status_hint: record.status_hint ?? null,
    status_hint_authority: record.status_hint_authority ?? NARS_SESSION_STATUS_HINT_AUTHORITY.DISCOVERY_PROJECTION_ONLY,
    authority_runtime_host: normalizeAuthorityRuntimeHost(record.authority_runtime_host, NARS_SESSION_AUTHORITY_RUNTIME_HOST.UNKNOWN_AUTHORITY_METADATA),
    authority_epoch: normalizeAuthorityEpoch(record.authority_epoch, null),
    authority_runtime_id: normalizeOptionalString(record.authority_runtime_id),
    authority_transition_state: normalizeAuthorityTransitionState(record.authority_transition_state),
    source_write_admission: NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(record.source_write_admission) ? record.source_write_admission : null,
    superseded_by_session_id: normalizeOptionalString(record.superseded_by_session_id),
    authority_locator_ref: normalizeOptionalString(record.authority_locator_ref),
    launch_operator_surface_kind: record.launch_operator_surface_kind ?? null,
    attached_projections_status: record.attached_projections_status ?? NARS_SESSION_ATTACHED_PROJECTIONS_STATUS.NOT_TRACKED,
  };
}

function normalizeAuthorityRuntimeHost(value, defaultValue) {
  if (NARS_AUTHORITY_RUNTIME_HOST_KINDS.includes(value)) return value;
  return defaultValue;
}

function normalizeAuthorityEpoch(value, defaultValue) {
  return Number.isInteger(value) && value >= 1 ? value : defaultValue;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeAuthorityTransitionState(value) {
  return NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES.includes(value) ? value : null;
}

function defaultAuthorityRuntimeId({ hostKind, sessionId }) {
  const safeHostKind = String(hostKind ?? 'unknown').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
  const safeSessionId = String(sessionId ?? 'unknown').replace(/[^A-Za-z0-9_]+/g, '_') || 'unknown';
  return `auth_${safeHostKind}_${safeSessionId}`;
}

function buildAggregateIndex({ siteRoot, sessions, generatedAt }) {
  return {
    schema: NARS_SESSION_INDEX_SCHEMA,
    site_root: siteRoot ?? null,
    generated_at: generatedAt,
    sessions,
  };
}

function inferSiteId({ siteRoot, agentId } = {}) {
  const rootBase = siteRoot ? basename(String(siteRoot)).toLowerCase() : '';
  if (rootBase.startsWith('narada.')) return rootBase.slice('narada.'.length);
  if (rootBase.startsWith('narada-')) return rootBase.slice('narada-'.length);
  if (agentId && String(agentId).includes('.')) return String(agentId).split('.')[0];
  return rootBase || null;
}

function isValidAggregate(value) {
  return value?.schema === NARS_SESSION_INDEX_SCHEMA && Array.isArray(value.sessions);
}

function aggregateCoversSessionRecords(aggregate, records) {
  const indexed = new Set(aggregate.sessions.map((entry) => entry?.session_id).filter(Boolean));
  return records.every((record) => indexed.has(record.session_id));
}

function overlayAggregateWithSessionRecords(aggregate, records) {
  const recordsBySessionId = new Map(records.map((record) => [record.session_id, record]));
  return {
    ...aggregate,
    sessions: aggregate.sessions
      .map((entry) => recordsBySessionId.has(entry?.session_id) ? toAggregateEntry(recordsBySessionId.get(entry.session_id)) : entry)
      .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? ''))),
  };
}

function withSessionIndexLock(sessionsRoot, fn) {
  if (!sessionsRoot) return fn();
  mkdirSync(sessionsRoot, { recursive: true });
  const lockDir = join(sessionsRoot, '.index.lock');
  const deadline = Date.now() + 2000;
  const staleAfterMs = 5000;
  while (true) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST' || Date.now() > deadline) throw error;
      try {
        const stats = statSync(lockDir);
        if (Date.now() - stats.mtimeMs > staleAfterMs) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {}
      sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function readJson(path) {
  try {
    if (!path || !existsSync(path) || !statSync(path).isFile()) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function heartbeatTimestampMs(heartbeat) {
  if (!heartbeat || typeof heartbeat !== 'object') return null;
  const timestamp = heartbeat.timestamp ?? heartbeat.heartbeat_at ?? heartbeat.last_seen_at ?? heartbeat.generated_at ?? heartbeat.started_at ?? null;
  if (!timestamp) return null;
  const ms = new Date(String(timestamp)).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeHealthStatus(health) {
  if (!health) return 'not_checked';
  if (health === 'healthy' || health === 'unhealthy' || health === 'unavailable') return health;
  if (typeof health !== 'object') return String(health);
  if (health.ok === true || health.status === 'healthy' || health.operational_posture === 'healthy') return 'healthy';
  if (health.ok === false || health.status === 'unhealthy') return 'unhealthy';
  if (health.status) return String(health.status);
  return 'unknown';
}

function stateClassification(displayState, reason, heartbeatFresh, heartbeatAgeMs, healthStatus) {
  return {
    display_state: displayState,
    reason,
    heartbeat_fresh: heartbeatFresh,
    heartbeat_age_ms: heartbeatAgeMs,
    health_status: healthStatus,
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
}
