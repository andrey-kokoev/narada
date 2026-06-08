import { CloudflareCarrierSession } from './cloudflare-carrier.mjs';
import { classifyCarrierInputAdmission, classifyToolEffectAdmission } from '../../carrier-protocol/src/carrier-protocol.mjs';
import { createCloudflareSiteRegistryAdapter } from '../../cloudflare-site-registry/src/cloudflare-site-registry.mjs';
import {
  SITE_AUTHORITY_ACTIONS,
  SITE_EMBODIMENT_KINDS,
  SITE_MUTATION_CLASSES,
  classifySiteAuthorityRequest,
  createCloudflareSiteAuthorityMap,
} from '../../site-authority-map/src/site-authority-map.mjs';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchangePacket,
  classifySiteContinuityExchange,
  createSiteContinuityExchangePacket,
  createSiteContinuityPacketId,
  createSiteContinuityBinding,
} from '../../site-continuity/src/site-continuity.mjs';

const SNAPSHOT_KEY = 'cloudflare_carrier_session_snapshot_v1';
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF = 'cloudflare-carrier:capability/runtime-metadata-read:v1';
const CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE = 'cloudflare-carrier/runtime-metadata:read-only';
const CLOUDFLARE_KV_GET_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-get:v1';
const CLOUDFLARE_KV_GET_EFFECT_SCOPE = 'cloudflare-kv:read-only:get';
const CLOUDFLARE_KV_PUT_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-put:v1';
const CLOUDFLARE_KV_PUT_EFFECT_SCOPE = 'cloudflare-kv:write:put';
const CLOUDFLARE_TASK_CREATE_CAPABILITY_REF = 'cloudflare-carrier:capability/task-create:v1';
const CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE = 'cloudflare-narada-task:write:create';
const CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF = 'cloudflare-carrier:capability/task-update:v1';
const CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE = 'cloudflare-narada-task:write:update';
const CLOUDFLARE_TASK_LIST_CAPABILITY_REF = 'cloudflare-carrier:capability/task-list:v1';
const CLOUDFLARE_TASK_LIST_EFFECT_SCOPE = 'cloudflare-narada-task:read:list';
const MICROSOFT_OIDC_ISSUER_BASE = 'https://login.microsoftonline.com';
const OPERATOR_SESSION_COOKIE = 'narada_operator_session';
const MICROSOFT_OIDC_PENDING_COOKIE = 'narada_microsoft_oidc_pending';
const DEFAULT_OPERATOR_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MICROSOFT_OIDC_PENDING_TTL_SECONDS = 5 * 60;
const CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_shadow_read.v1';
const CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_observation_primary_with_windows_fallback.v1';
const CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_remote_source_adapter.v1';
const CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_scheduled_source_read.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_direct_remote_metric_source.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_directive_dual_record.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_directive_primary_with_windows_fallback.v1';
const CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_resident_loop_shadow_read.v1';
const CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_resident_dispatch_primary_with_windows_fallback.v1';
const CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE = 'cloudflare_shadow_read';
const CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY = 'cloudflare_primary_observation_read';
const CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY = 'cloudflare_webhook_delay_remote_source_adapter';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_AUTHORITY = 'cloudflare_webhook_delay_direct_remote_metric_source_adapter';
const CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY = 'cloudflare_cron_trigger';
const WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY = 'windows_observation_read_fallback';
const CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY = 'cloudflare_directive_dual_recorded';
const CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY = 'cloudflare_primary_directive_delivery';
const CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY = 'cloudflare_primary_dispatcher';
const WINDOWS_PRIMARY_DISPATCH_AUTHORITY = 'windows_primary_dispatcher';
const WINDOWS_FALLBACK_DISPATCH_AUTHORITY = 'windows_fallback_dispatcher';
const DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES = 15;
const CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_runtime_metadata_read',
  access: 'read_only',
  substrate: 'cloudflare-worker-runtime',
});
const CLOUDFLARE_KV_PUT_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_kv_put',
  description: 'Write one value into the configured Narada Cloudflare KV namespace by key.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      key: Object.freeze({ type: 'string' }),
      value: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['key', 'value']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_CREATE_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_create',
  description: 'Create a Narada task in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      title: Object.freeze({ type: 'string' }),
      description: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['title']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_UPDATE_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_update',
  description: 'Update status or note for a Narada task in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      task_id: Object.freeze({ type: 'string' }),
      status: Object.freeze({ type: 'string' }),
      note: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['task_id']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_LIST_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_list',
  description: 'List Narada tasks in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_KV_GET_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_kv_get',
  access: 'read_only',
  substrate: 'cloudflare-kv',
});
const CLOUDFLARE_TASK_CREATE_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_create',
  access: 'write',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_TASK_UPDATE_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_update',
  access: 'write',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_TASK_LIST_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_LIST_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_LIST_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_list',
  access: 'read_only',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_KV_PUT_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_kv_put',
  access: 'write',
  substrate: 'cloudflare-kv',
});
const CLOUDFLARE_RUNTIME_METADATA_READ_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_runtime_metadata_read',
  description: 'Read non-secret Narada Cloudflare carrier runtime metadata for the active session.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_KV_GET_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_kv_get',
  description: 'Read one value from the configured Narada Cloudflare KV namespace by key.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      key: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['key']),
    additionalProperties: false,
  }),
});

export class CloudflareCarrierDurableObject {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
    this.session = null;
    this.lane = Promise.resolve();
  }

  async fetch(request) {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
    }
    const body = await request.json();
    const response = await this.handle(body);
    return jsonResponse(response, response.ok === false ? 400 : 200);
  }

  async handle(request) {
    const run = () => this.#handleInLane(request);
    const result = this.lane.then(run, run);
    this.lane = result.catch(() => {});
    return result;
  }

  async alarm() {
    const run = () => this.#alarmInLane();
    const result = this.lane.then(run, run);
    this.lane = result.catch(() => {});
    return result;
  }

  async #handleInLane(request) {
    const session = await this.#loadOrCreateSession(request);
    if (!session) return { ok: false, code: 'carrier_session_not_found' };
    const response = await session.handle(request);
    if (mutatesSession(request.operation)) {
      await this.#storeSnapshot(session);
      await this.#scheduleOperationHeartbeatAlarm(session);
    }
    return response;
  }

  async #alarmInLane() {
    const session = await this.#loadOrCreateSession({ operation: 'session.status' });
    if (!session || session.state.closed) return;
    await session.handle({
      operation: 'directive.heartbeat.emit',
      request_id: `request_operation_heartbeat_alarm_${Date.now()}`,
      carrier_session_id: session.state.carrier_session_id,
      principal: { principal_id: 'principal:service' },
      params: {
        operation_id: session.state.operation_id ?? null,
        reason: 'operation_continuity_heartbeat',
      },
    });
    await this.#storeSnapshot(session);
    await this.#scheduleOperationHeartbeatAlarm(session);
  }

  async #loadOrCreateSession(request) {
    if (this.session) return this.session;
    const snapshot = await this.state.storage.get(SNAPSHOT_KEY);
    const providerAdapter = createCloudflareAiProviderAdapter(this.env);
    const toolEffectAdapter = createCloudflareToolEffectAdapter(this.env);
    const taskStoreAdapter = createCloudflareD1TaskStoreAdapter(this.env);
    if (snapshot) {
      this.session = CloudflareCarrierSession.fromSnapshot(snapshot, { providerAdapter, toolEffectAdapter, taskStoreAdapter });
      return this.session;
    }
    if (request.operation !== 'session.start') return null;
    const params = request.params ?? {};
    this.session = new CloudflareCarrierSession({
      carrier_session_id: params.carrier_session_id ?? request.carrier_session_id,
      agent_id: params.agent_id,
      site_id: params.site_id,
      operation_id: params.operation_id ?? null,
      site_root: params.site_root ?? params.site_ref,
      site_ref: params.site_ref,
      providerAdapter,
      toolEffectAdapter,
      taskStoreAdapter,
    });
    return this.session;
  }

  async #storeSnapshot(session) {
    await this.state.storage.put(SNAPSHOT_KEY, session.snapshot());
  }

  async #scheduleOperationHeartbeatAlarm(session) {
    if (this.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_ENABLE === 'false') return;
    if (!session?.state?.operation_id || session.state.closed) return;
    if (typeof this.state.storage?.setAlarm !== 'function') return;
    const intervalMs = Number(this.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INTERVAL_MS ?? 60000);
    const boundedIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000;
    await this.state.storage.setAlarm(Date.now() + boundedIntervalMs);
  }
}

async function importCloudflareContinuityPacket(env = {}, packet, { imported_by_principal_id = 'unknown-principal' } = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  const decision = classifySiteContinuityExchangePacket(packet);
  if (decision.action === SITE_AUTHORITY_ACTIONS.REFUSE || decision.action === 'refuse') {
    return { ok: false, status: 'refused', site_continuity_packet_admission: decision };
  }
  if (!packet?.site_id) {
    return { ok: false, status: 'refused', site_continuity_packet_admission: { ...decision, action: 'refuse', reason: 'site_continuity_packet_site_id_missing' } };
  }
  await ensureCloudflareContinuityPacketSchema(db);
  const importedAt = new Date().toISOString();
  const packetId = packet.packet_id ?? createSiteContinuityPacketId(packet);
  await db.prepare(`INSERT INTO cloudflare_site_continuity_packets (
    packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(packet_id) DO UPDATE SET
    admission_action = excluded.admission_action,
    admission_reason = excluded.admission_reason,
    packet_json = excluded.packet_json,
    imported_by_principal_id = excluded.imported_by_principal_id,
    imported_at = excluded.imported_at`).bind(
    packetId,
    packet.site_id,
    packet.relation_id ?? null,
    packet.source_embodiment_kind,
    packet.target_embodiment_kind,
    decision.action,
    decision.reason,
    JSON.stringify(packet),
    imported_by_principal_id,
    importedAt,
  ).run();
  return {
    ok: true,
    status: 'imported',
    site_continuity_packet_admission: decision,
    packet_record: {
      packet_id: packetId,
      site_id: packet.site_id,
      relation_id: packet.relation_id ?? null,
      source_embodiment_kind: packet.source_embodiment_kind,
      target_embodiment_kind: packet.target_embodiment_kind,
      admission_action: decision.action,
      admission_reason: decision.reason,
      imported_at: importedAt,
    },
  };
}

function summarizeCloudflareSiteProductOverview(siteProductStatuses = []) {
  const statuses = Array.isArray(siteProductStatuses) ? siteProductStatuses : [];
  const healthCounts = { ready: 0, attention: 0, incomplete: 0, other: 0 };
  for (const status of statuses) {
    if (status?.health === 'ready') healthCounts.ready += 1;
    else if (status?.health === 'attention') healthCounts.attention += 1;
    else if (status?.health === 'incomplete') healthCounts.incomplete += 1;
    else healthCounts.other += 1;
  }
  const firstActionable = statuses.find((status) => status?.next_action && status.next_action !== 'monitor_site');
  return {
    schema: 'narada.cloudflare_site_product_overview.v1',
    site_count: statuses.length,
    health_counts: healthCounts,
    next_site_id: firstActionable?.site_id ?? null,
    next_action: firstActionable?.next_action ?? 'monitor_sites',
  };
}

async function listCloudflareContinuityPackets(env = {}, siteId, limit = 100) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareContinuityPacketSchema(db);
  const result = await db.prepare(`SELECT packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, imported_by_principal_id, imported_at
    FROM cloudflare_site_continuity_packets WHERE site_id = ? ORDER BY imported_at DESC LIMIT ?`).bind(siteId, boundedContinuityPacketReadLimit(limit)).all();
  return result.results ?? [];
}

function summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets = [], siteContinuity = null) {
  const packets = Array.isArray(continuityPackets) ? continuityPackets : [];
  const latestPacket = packets[0] ?? null;
  const directionCounts = {
    cloudflare_to_local_windows: 0,
    local_windows_to_cloudflare: 0,
    other: 0,
  };
  for (const packet of packets) {
    if (
      packet.source_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER
      && packet.target_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS
    ) {
      directionCounts.cloudflare_to_local_windows += 1;
    } else if (
      packet.source_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS
      && packet.target_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER
    ) {
      directionCounts.local_windows_to_cloudflare += 1;
    } else {
      directionCounts.other += 1;
    }
  }
  return {
    schema: 'narada.cloudflare_site_continuity_status.v1',
    site_id: siteId,
    state: packets.length > 0 ? 'packet_observed' : 'no_packet_observed',
    packet_count: packets.length,
    direction_counts: directionCounts,
    latest_packet_id: latestPacket?.packet_id ?? null,
    latest_imported_at: latestPacket?.imported_at ?? null,
    latest_admission_action: latestPacket?.admission_action ?? null,
    latest_admission_reason: latestPacket?.admission_reason ?? null,
    expected_exchange_packet_id: siteContinuity?.exchange_packet?.packet_id ?? null,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
  };
}

function summarizeCloudflareOperationLifecycleStatus({
  operation = null,
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  continuityStatus = null,
  residentLoopShadowRuns = [],
  residentDispatchDecisions = [],
  webhookDelayDirectiveRecords = [],
  webhookDelayDirectiveDeliveries = [],
} = {}) {
  const sessionCount = Array.isArray(sessions) ? sessions.length : 0;
  const taskList = Array.isArray(tasks) ? tasks : [];
  const openTaskCount = taskList.filter((task) => !['done', 'closed', 'cancelled'].includes(String(task.status ?? '').toLowerCase())).length;
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group.events) ? group.events.length : 0), 0);
  const continuityState = continuityStatus?.state ?? 'unknown';
  const residentLoopCount = Array.isArray(residentLoopShadowRuns) ? residentLoopShadowRuns.length : 0;
  const residentDispatchCount = Array.isArray(residentDispatchDecisions) ? residentDispatchDecisions.length : 0;
  const directiveRecordCount = Array.isArray(webhookDelayDirectiveRecords) ? webhookDelayDirectiveRecords.length : 0;
  const directiveDeliveryCount = Array.isArray(webhookDelayDirectiveDeliveries) ? webhookDelayDirectiveDeliveries.length : 0;
  const missing = [];
  if (sessionCount === 0) missing.push('session');
  if (evidenceEventCount === 0) missing.push('carrier_evidence');
  if (continuityState !== 'packet_observed') missing.push('continuity_packet');
  const attention = [];
  if (openTaskCount > 0) attention.push('open_tasks');
  if (directiveRecordCount > directiveDeliveryCount) attention.push('undelivered_directives');
  const phase = operation?.status === 'active'
    ? (sessionCount > 0 ? 'inhabited' : 'active_uninhabited')
    : String(operation?.status ?? 'unknown');
  const health = missing.length === 0 && attention.length === 0
    ? 'ready'
    : (sessionCount === 0 || evidenceEventCount === 0 ? 'incomplete' : 'attention');
  return {
    schema: 'narada.cloudflare_operation_lifecycle_status.v1',
    operation_id: operation?.operation_id ?? null,
    site_id: operation?.site_id ?? null,
    phase,
    health,
    missing,
    attention,
    session_count: sessionCount,
    open_task_count: openTaskCount,
    task_count: taskList.length,
    evidence_event_count: evidenceEventCount,
    continuity_state: continuityState,
    resident_loop_shadow_run_count: residentLoopCount,
    resident_dispatch_decision_count: residentDispatchCount,
    directive_record_count: directiveRecordCount,
    directive_delivery_count: directiveDeliveryCount,
    next_action: missing[0] ?? attention[0] ?? 'monitor_operation',
  };
}

function summarizeCloudflareSiteProductStatus({
  site = null,
  operations = [],
  memberships = [],
  authorityEvents = [],
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  continuityStatus = null,
} = {}) {
  const operationList = Array.isArray(operations) ? operations : [];
  const membershipList = Array.isArray(memberships) ? memberships : [];
  const authorityEventList = Array.isArray(authorityEvents) ? authorityEvents : [];
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const taskList = Array.isArray(tasks) ? tasks : [];
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group.events) ? group.events.length : 0), 0);
  const activeOperationCount = operationList.filter((operation) => String(operation.status ?? '').toLowerCase() === 'active').length;
  const activeMembershipCount = membershipList.filter((membership) => String(membership.status ?? '').toLowerCase() === 'active').length;
  const openTaskCount = taskList.filter((task) => !['done', 'closed', 'cancelled'].includes(String(task.status ?? '').toLowerCase())).length;
  const continuityState = continuityStatus?.state ?? 'unknown';
  const missing = [];
  if (activeMembershipCount === 0) missing.push('active_membership');
  if (operationList.length === 0) missing.push('operation');
  if (sessionList.length === 0) missing.push('session');
  if (evidenceEventCount === 0) missing.push('carrier_evidence');
  if (continuityState !== 'packet_observed') missing.push('continuity_packet');
  const attention = [];
  if (openTaskCount > 0) attention.push('open_tasks');
  const health = missing.length === 0 && attention.length === 0
    ? 'ready'
    : (activeMembershipCount === 0 || operationList.length === 0 || sessionList.length === 0 || evidenceEventCount === 0 ? 'incomplete' : 'attention');
  return {
    schema: 'narada.cloudflare_site_product_status.v1',
    site_id: site?.site_id ?? continuityStatus?.site_id ?? null,
    site_status: site?.status ?? 'unknown',
    health,
    missing,
    attention,
    operation_count: operationList.length,
    active_operation_count: activeOperationCount,
    membership_count: membershipList.length,
    active_membership_count: activeMembershipCount,
    session_count: sessionList.length,
    task_count: taskList.length,
    open_task_count: openTaskCount,
    carrier_evidence_group_count: evidenceGroups.length,
    carrier_evidence_event_count: evidenceEventCount,
    authority_event_count: authorityEventList.length,
    continuity_state: continuityState,
    continuity_packet_count: continuityStatus?.packet_count ?? 0,
    next_action: missing[0] ?? attention[0] ?? 'monitor_site',
  };
}

function boundedContinuityPacketReadLimit(value = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(1, Math.min(500, Math.trunc(numeric)));
}

async function ensureCloudflareContinuityPacketSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_packets (
    packet_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    relation_id TEXT,
    source_embodiment_kind TEXT NOT NULL,
    target_embodiment_kind TEXT NOT NULL,
    admission_action TEXT NOT NULL,
    admission_reason TEXT NOT NULL,
    packet_json TEXT NOT NULL,
    imported_by_principal_id TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_continuity_packets_site_idx ON cloudflare_site_continuity_packets(site_id, imported_at)').run();
}

async function validateCarrierSiteBindingForRequest(body, principal, env = {}) {
  if (body?.operation !== 'session.start') return null;
  const registry = createCloudflareSiteRegistryAdapter(env);
  if (!registry) return null;
  const params = body.params ?? {};
  return registry.validateCarrierSiteBinding({
    site_id: params.site_id,
    site_ref: params.site_ref ?? params.site_root,
    operation_id: params.operation_id,
    carrier_session_id: params.carrier_session_id ?? body.carrier_session_id,
    agent_id: params.agent_id,
    principal,
    request_id: body.request_id,
  });
}

function validateCarrierSessionAuthorityForRequest(body, env = {}) {
  if (!mutatesSession(body?.operation)) return null;
  const params = body.params ?? {};
  const siteId = params.site_id ?? body.site_id ?? 'unknown-site';
  return classifyCloudflareSiteAuthority(env, siteId, SITE_MUTATION_CLASSES.HOSTED_CARRIER_SESSION_EVENTS).decision;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/auth/')) {
      return handleOperatorAuthRequest(request, env);
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/console')) {
      return htmlResponse(renderCloudflareCarrierConsole());
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, carrier_kind: 'cloudflare-carrier', product_surface: 'web-console' });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
    }
    if (url.pathname !== '/' && url.pathname !== '/api/carrier' && url.pathname !== '/control') {
      return jsonResponse({ ok: false, code: 'not_found' }, 404);
    }
    return handleCarrierApiRequest(request, env);
  },
  async scheduled(controller, env, ctx) {
    const run = runCloudflareWebhookDelayScheduledSourceRead(env, {
      cron: controller?.cron ?? null,
      scheduled_time: controller?.scheduledTime ? new Date(controller.scheduledTime).toISOString() : new Date().toISOString(),
      trigger_kind: 'cloudflare_cron',
    });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(run);
    else await run;
  },
};

async function handleCarrierApiRequest(request, env) {
    const auth = await authenticateCarrierApiRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);

    const body = await request.clone().json();
    if (isSiteProductOperation(body.operation)) {
      const siteResponse = await handleSiteProductApiRequest(body, auth.principal, env);
      return jsonResponse(withPrincipalEvidence(siteResponse.body, body.operation, auth.principal), siteResponse.status);
    }
    const routed = await routeCarrierSessionRequest(request.url, body, auth.principal, env);
    return jsonResponse(withPrincipalEvidence(routed.body, body.operation, auth.principal), routed.status);
}

async function routeCarrierSessionRequest(requestUrl, body, principal, env) {
    const carrierSessionId = body.carrier_session_id ?? body.params?.carrier_session_id;
    if (!carrierSessionId) return { status: 400, body: { ok: false, code: 'missing_carrier_session_id' } };
    if (!env?.CLOUDFLARE_CARRIER_SESSIONS) {
      return { status: 500, body: { ok: false, code: 'missing_durable_object_binding' } };
    }
    const registryAdmission = await validateCarrierSiteBindingForRequest(body, principal, env);
    if (registryAdmission?.ok === false) {
      return { status: 403, body: {
        ok: false,
        code: 'carrier_site_binding_denied',
        site_registry_code: registryAdmission.code,
        site_registry_reason: registryAdmission.reason ?? registryAdmission.code,
      } };
    }
    const sessionAuthorityDecision = validateCarrierSessionAuthorityForRequest(body, env);
    if (sessionAuthorityDecision && sessionAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
      return { status: 403, body: {
        ok: false,
        code: 'site_authority_route_denied',
        operation: body.operation,
        site_authority_decision: sessionAuthorityDecision,
      } };
    }
    const routedBody = (registryAdmission?.evidence || sessionAuthorityDecision)
      ? {
          ...body,
          params: {
            ...(body.params ?? {}),
            ...(registryAdmission?.evidence ? { site_binding_evidence: registryAdmission.evidence } : {}),
            ...(sessionAuthorityDecision ? { site_authority_decision: sessionAuthorityDecision } : {}),
          },
        }
      : body;
    const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
    const authenticatedRequest = new Request(requestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...routedBody, principal }),
    });
    const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(authenticatedRequest);
    const responseBody = await durableResponse.json();
    return { status: durableResponse.status, body: responseBody };
}

function isSiteProductOperation(operation) {
  return [
    'site.create',
    'site.read',
    'site.list',
    'site.settings.put',
    'site.membership.put',
    'site.continuity.packet.put',
    'operation.create',
    'operation.read',
    'operation.list',
    'webhook_delay.shadow_read.record',
    'webhook_delay.shadow_read.list',
    'webhook_delay.observation.primary_with_fallback.record',
    'webhook_delay.observation.primary_with_fallback.list',
    'webhook_delay.remote_source.samples.put',
    'webhook_delay.remote_source.primary_with_fallback.read',
    'webhook_delay.remote_source.samples.list',
    'webhook_delay.remote_metric.direct_source.read',
    'webhook_delay.remote_source.scheduled_read.run',
    'webhook_delay.remote_source.scheduled_read.list',
    'webhook_delay.directive.dual_record.record',
    'webhook_delay.directive.dual_record.list',
    'webhook_delay.directive.primary_with_fallback.deliver',
    'webhook_delay.directive.primary_with_fallback.list',
    'resident_loop.shadow_read.record',
    'resident_loop.shadow_read.list',
    'resident_dispatch.primary_with_fallback.start',
    'resident_dispatch.primary_with_fallback.list',
  ].includes(operation);
}

function cloudflareSiteAuthorityMap(env = {}, siteId = 'unknown-site') {
  return createCloudflareSiteAuthorityMap({
    site_id: siteId,
    cloudflare_carrier_authority_locus: env.CLOUDFLARE_CARRIER_AUTHORITY_LOCUS ?? 'cloudflare-carrier',
    local_windows_authority_locus: env.NARADA_LOCAL_WINDOWS_AUTHORITY_LOCUS ?? 'local-windows-site-authority',
    task_artifact_authority_locus: env.CLOUDFLARE_CARRIER_TASK_AUTHORITY_LOCUS ?? 'cloudflare-carrier-task-store',
  });
}

function classifyCloudflareSiteAuthority(env = {}, siteId = 'unknown-site', mutationClass) {
  const map = cloudflareSiteAuthorityMap(env, siteId);
  const decision = classifySiteAuthorityRequest(map, {
    mutation_class: mutationClass,
    embodiment_kind: SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  });
  return { map, decision };
}

function cloudflareSiteAuthorityReadModel(env = {}, siteId = 'unknown-site') {
  const map = cloudflareSiteAuthorityMap(env, siteId);
  return {
    map,
    decisions: map.entries.map((entry) => classifySiteAuthorityRequest(map, {
      mutation_class: entry.mutation_class,
      embodiment_kind: SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    })),
  };
}

function cloudflareSiteContinuityReadModel(env = {}, siteId = 'unknown-site') {
  const binding = createSiteContinuityBinding({
    site_id: siteId,
    local_windows_site_ref: env.NARADA_LOCAL_WINDOWS_SITE_REF ?? 'local-windows-site',
    cloudflare_site_ref: env.CLOUDFLARE_SITE_REF ?? 'cloudflare-site',
    local_windows_authority_locus: env.NARADA_LOCAL_WINDOWS_AUTHORITY_LOCUS ?? 'local-windows-site-authority',
    cloudflare_authority_locus: env.CLOUDFLARE_CARRIER_AUTHORITY_LOCUS ?? 'cloudflare-carrier',
    authority_map_ref: env.CLOUDFLARE_SITE_AUTHORITY_MAP_REF ?? 'site-authority-map:v1',
  });
  const fromCloudflareToLocal = {
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    site_id: siteId,
  };
  const fromLocalToCloudflare = {
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    site_id: siteId,
  };
  const decisions = [
      classifySiteContinuityExchange(binding, {
        ...fromLocalToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.AUTHORITY_MAP_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromLocalToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION,
      }),
    ];
  const exchangePacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    decisions,
    projections: [{
      projection_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      source_cursor: 'cloudflare-site-read',
      summary: 'Cloudflare Site continuity read-model projection',
    }],
    evidence_refs: [],
  });
  return {
    binding,
    decisions,
    exchange_packet: exchangePacket,
    exchange_packet_admission: classifySiteContinuityExchangePacket(exchangePacket),
  };
}

function siteAuthorityDeniedBody(decision, operation) {
  return {
    ok: false,
    code: 'site_authority_route_denied',
    operation,
    site_authority_decision: decision,
  };
}

async function handleSiteProductApiRequest(body, principal, env = {}) {
  const registry = createCloudflareSiteRegistryAdapter(env);
  if (!registry) return { status: 500, body: { ok: false, code: 'missing_site_registry_binding' } };
  const params = body.params ?? {};
  const requestedSiteId = params.site_id ?? body.site_id ?? 'unknown-site';
  if (body.operation === 'resident_dispatch.primary_with_fallback.start') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await startCloudflareResidentDispatchWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_dispatch.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const dispatchDecisions = await listCloudflareResidentDispatchDecisions(env, requestedSiteId, params.resident_dispatch_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        dispatch_decisions: dispatchDecisions,
      },
    };
  }
  if (body.operation === 'webhook_delay.directive.dual_record.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayDirectiveDualRecord(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.directive.dual_record.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const directiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, requestedSiteId, params.webhook_delay_directive_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        directive_action: 'record_directive_emission_intent',
        directive_records: directiveRecords,
      },
    };
  }
  if (body.operation === 'webhook_delay.directive.primary_with_fallback.deliver') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await deliverCloudflareWebhookDelayDirectiveWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.directive.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const directiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, requestedSiteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        delivery_action: 'cloudflare_carrier_input_deliver',
        directive_deliveries: directiveDeliveries,
      },
    };
  }
  if (body.operation === 'resident_loop.shadow_read.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareResidentLoopShadowRun(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_loop.shadow_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const loopRuns = await listCloudflareResidentLoopShadowRuns(env, requestedSiteId, params.resident_loop_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
        dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        loop_runs: loopRuns,
      },
    };
  }
  if (body.operation === 'webhook_delay.shadow_read.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayShadowObservation(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.shadow_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const observations = await listCloudflareWebhookDelayShadowObservations(env, requestedSiteId, params.webhook_delay_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
        dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        observations,
      },
    };
  }
  if (body.operation === 'webhook_delay.observation.primary_with_fallback.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayObservationPrimaryRead(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.observation.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const observations = await listCloudflareWebhookDelayObservationPrimaryReads(env, requestedSiteId, params.webhook_delay_observation_primary_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
        fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
        fallback_status: 'available',
        dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        observations,
      },
    };
  }
  if (body.operation === 'webhook_delay.remote_source.samples.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await putCloudflareWebhookDelayRemoteSourceSamples(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.samples.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const samples = await listCloudflareWebhookDelayRemoteSourceSamples(env, requestedSiteId, params.source_adapter_id, params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
        samples,
      },
    };
  }
  if (body.operation === 'webhook_delay.remote_source.primary_with_fallback.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_metric.direct_source.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareWebhookDelayDirectRemoteMetricSource(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.scheduled_read.run') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await runCloudflareWebhookDelayScheduledSourceRead(env, { ...params, site_id: requestedSiteId }, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.scheduled_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const runs = await listCloudflareWebhookDelayScheduledSourceReads(env, requestedSiteId, params.limit);
    return { status: 200, body: {
      ok: true,
      schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
      status: 'ok',
      site_id: requestedSiteId,
      trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
      runs,
    } };
  }
  if (body.operation === 'site.continuity.packet.put') {
    const packet = params.packet ?? body.packet ?? null;
    const packetSiteId = packet?.site_id ?? requestedSiteId;
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: packetSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await importCloudflareContinuityPacket(env, packet, { imported_by_principal_id: principal?.principal_id ?? 'unknown-principal' });
    return { status: result.ok ? 200 : 403, body: result };
  }
  if (body.operation === 'site.membership.put') {
    const { decision } = classifyCloudflareSiteAuthority(env, requestedSiteId, SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP);
    if (decision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
      return { status: 403, body: siteAuthorityDeniedBody(decision, body.operation) };
    }
  }
  const response = await registry.handle({ ...body, principal });
  if (!response.ok) return { status: response.code === 'site_authority_denied' ? 403 : 400, body: response };
  if (body.operation === 'site.list') {
    const siteProductStatuses = [];
    for (const site of response.sites ?? []) {
      const siteRead = await registry.handle({
        operation: 'site.read',
        params: { site_id: site.site_id, limit: params.site_status_limit ?? params.limit },
        principal,
      });
      if (!siteRead.ok) continue;
      const projection = await buildCloudflareSiteProductProjection(env, principal, siteRead, params);
      siteProductStatuses.push(projection.site_product_status);
    }
    return {
      status: 200,
      body: {
        ...response,
        site_product_statuses: siteProductStatuses,
        site_product_overview: summarizeCloudflareSiteProductOverview(siteProductStatuses),
      },
    };
  }
  if (body.operation === 'operation.read') {
    const operation = response.operation;
    const siteId = operation?.site_id ?? params.site_id;
    const sessions = response.sessions ?? [];
    const tasks = await listOperationTasks(env, siteId, sessions);
    const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
    const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
    const webhookDelayObservationPrimaryReads = await listCloudflareWebhookDelayObservationPrimaryReads(env, siteId, params.webhook_delay_observation_primary_limit ?? params.limit);
    const webhookDelayScheduledSourceReads = await listCloudflareWebhookDelayScheduledSourceReads(env, siteId, params.webhook_delay_scheduled_source_read_limit ?? params.limit);
    const webhookDelayDirectiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, siteId, params.webhook_delay_directive_limit ?? params.limit);
    const webhookDelayDirectiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, siteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
    const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
    const residentDispatchDecisions = await listCloudflareResidentDispatchDecisions(env, siteId, params.resident_dispatch_limit ?? params.limit);
    const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, sessions, principal, params);
    const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
    const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
    const siteContinuityStatus = summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets, siteContinuity);
    const operationLifecycleStatus = summarizeCloudflareOperationLifecycleStatus({
      operation,
      sessions,
      tasks,
      carrierEvidence,
      continuityStatus: siteContinuityStatus,
      residentLoopShadowRuns,
      residentDispatchDecisions,
      webhookDelayDirectiveRecords,
      webhookDelayDirectiveDeliveries,
    });
    return {
      status: 200,
      body: {
        ...response,
        tasks,
        site_continuity_packets: continuityPackets,
        webhook_delay_shadow_observations: webhookDelayShadowObservations,
        webhook_delay_observation_primary_reads: webhookDelayObservationPrimaryReads,
        webhook_delay_scheduled_source_reads: webhookDelayScheduledSourceReads,
        webhook_delay_directive_records: webhookDelayDirectiveRecords,
        webhook_delay_directive_deliveries: webhookDelayDirectiveDeliveries,
        resident_loop_shadow_runs: residentLoopShadowRuns,
        resident_dispatch_decisions: residentDispatchDecisions,
        carrier_evidence: carrierEvidence,
        site_authority: siteAuthority,
        site_continuity: siteContinuity,
        site_continuity_status: siteContinuityStatus,
        operation_lifecycle_status: operationLifecycleStatus,
        operation_product_surface: {
          schema: 'narada.cloudflare_operation_product_surface.v1',
          operation_id: operation?.operation_id ?? null,
          site_id: siteId,
          session_count: sessions.length,
          task_count: tasks.length,
          carrier_evidence_count: carrierEvidence.length,
          continuity_packet_count: continuityPackets.length,
          continuity_status: siteContinuityStatus,
          lifecycle_status: operationLifecycleStatus,
          webhook_delay_shadow_observation_count: webhookDelayShadowObservations.length,
          webhook_delay_observation_primary_read_count: webhookDelayObservationPrimaryReads.length,
          webhook_delay_scheduled_source_read_count: webhookDelayScheduledSourceReads.length,
          webhook_delay_directive_record_count: webhookDelayDirectiveRecords.length,
          webhook_delay_directive_delivery_count: webhookDelayDirectiveDeliveries.length,
          resident_loop_shadow_run_count: residentLoopShadowRuns.length,
          resident_dispatch_decision_count: residentDispatchDecisions.length,
          dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        },
      },
    };
  }
  if (body.operation !== 'site.read') {
    if (body.operation === 'site.membership.put') {
      const siteId = response.site?.site_id ?? requestedSiteId;
      const { decision } = classifyCloudflareSiteAuthority(env, siteId, SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP);
      return { status: 200, body: { ...response, site_authority_decision: decision } };
    }
    return { status: 200, body: response };
  }
  const projection = await buildCloudflareSiteProductProjection(env, principal, response, params);
  return {
    status: 200,
    body: {
      ...response,
      ...projection,
    },
  };
}

async function buildCloudflareSiteProductProjection(env, principal, response, params = {}) {
  const siteId = response.site?.site_id ?? params.site_id;
  const tasks = await listSiteTasks(env, siteId);
  const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
  const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
  const webhookDelayObservationPrimaryReads = await listCloudflareWebhookDelayObservationPrimaryReads(env, siteId, params.webhook_delay_observation_primary_limit ?? params.limit);
  const webhookDelayScheduledSourceReads = await listCloudflareWebhookDelayScheduledSourceReads(env, siteId, params.webhook_delay_scheduled_source_read_limit ?? params.limit);
  const webhookDelayDirectiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, siteId, params.webhook_delay_directive_limit ?? params.limit);
  const webhookDelayDirectiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, siteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
  const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
  const residentDispatchDecisions = await listCloudflareResidentDispatchDecisions(env, siteId, params.resident_dispatch_limit ?? params.limit);
  const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, response.sessions ?? [], principal, params);
  const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
  const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
  const siteContinuityStatus = summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets, siteContinuity);
  const siteProductStatus = summarizeCloudflareSiteProductStatus({
    site: response.site,
    operations: response.operations,
    memberships: response.memberships ?? (response.membership ? [response.membership] : []),
    authorityEvents: response.authority_events,
    sessions: response.sessions,
    tasks,
    carrierEvidence,
    continuityStatus: siteContinuityStatus,
  });
  return {
    tasks,
    site_continuity_packets: continuityPackets,
    webhook_delay_shadow_observations: webhookDelayShadowObservations,
    webhook_delay_observation_primary_reads: webhookDelayObservationPrimaryReads,
    webhook_delay_scheduled_source_reads: webhookDelayScheduledSourceReads,
    webhook_delay_directive_records: webhookDelayDirectiveRecords,
    webhook_delay_directive_deliveries: webhookDelayDirectiveDeliveries,
    resident_loop_shadow_runs: residentLoopShadowRuns,
    resident_dispatch_decisions: residentDispatchDecisions,
    carrier_evidence: carrierEvidence,
    site_authority: siteAuthority,
    site_continuity: siteContinuity,
    site_continuity_status: siteContinuityStatus,
    site_product_status: siteProductStatus,
  };
}

async function startCloudflareResidentDispatchWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const dispatch = createResidentDispatchDecision(siteId, params, principal);
  const sessionStart = {
    operation: 'session.start',
    request_id: dispatch.dispatch_request_id,
    params: {
      carrier_session_id: dispatch.carrier_session_id,
      agent_id: dispatch.agent_id,
      site_id: siteId,
      site_root: dispatch.site_root,
      site_ref: dispatch.site_ref,
      operation_id: dispatch.operation_id,
    },
  };
  const routed = await routeCarrierSessionRequest('https://carrier.dispatch.local/api/carrier', sessionStart, principal, env);
  const cloudflareStarted = routed.status >= 200 && routed.status < 300 && routed.body?.ok !== false;
  const record = {
    ...dispatch,
    decision_state: cloudflareStarted ? 'cloudflare_primary_started' : 'cloudflare_primary_failed_windows_fallback_available',
    dispatch_action: 'cloudflare_session_start',
    fallback_status: 'available',
    session_start_status: routed.status,
    session_start_ok: routed.body?.ok === true,
    session_start_body: routed.body,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await recordCloudflareResidentDispatchDecision(env, record);
  return {
    ok: cloudflareStarted,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
    status: record.decision_state,
    site_id: siteId,
    operation_id: record.operation_id,
    carrier_session_id: record.carrier_session_id,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    dispatch_action: record.dispatch_action,
    decision: record,
    session_start: routed.body,
  };
}

function createResidentDispatchDecision(siteId, params = {}, principal = null) {
  const nowToken = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const operationId = params.operation_id ?? 'operation_narada_cloudflare_control';
  const carrierSessionId = params.carrier_session_id ?? `carrier_session_cloudflare_dispatch_${nowToken}`;
  return {
    dispatch_decision_id: params.dispatch_decision_id ?? `resident_dispatch_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(carrierSessionId)}`,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    dispatch_request_id: params.dispatch_request_id ?? `request_resident_dispatch_${nowToken}`,
    agent_id: params.agent_id ?? 'narada.cloudflare.dispatch',
    site_root: params.site_root ?? params.site_ref ?? `cloudflare://${siteId}`,
    site_ref: params.site_ref ?? `cloudflare://${siteId}`,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_ref: params.windows_fallback_ref ?? params.fallback_ref ?? 'windows_local_site_resident_loop',
    dispatch_scope: params.dispatch_scope ?? 'controlled_operation_session_start',
    requested_by_principal_id: principal?.principal_id ?? 'unknown-principal',
  };
}

async function recordCloudflareResidentDispatchDecision(env = {}, record) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareResidentDispatchDecisionSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_dispatch_decisions (
      dispatch_decision_id,
      site_id,
      operation_id,
      carrier_session_id,
      decision_state,
      dispatch_authority,
      fallback_authority,
      fallback_status,
      dispatch_action,
      dispatch_scope,
      session_start_status,
      session_start_ok,
      decision_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dispatch_decision_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      carrier_session_id = excluded.carrier_session_id,
      decision_state = excluded.decision_state,
      dispatch_authority = excluded.dispatch_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      dispatch_action = excluded.dispatch_action,
      dispatch_scope = excluded.dispatch_scope,
      session_start_status = excluded.session_start_status,
      session_start_ok = excluded.session_start_ok,
      decision_json = excluded.decision_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.dispatch_decision_id,
    record.site_id,
    record.operation_id,
    record.carrier_session_id,
    record.decision_state,
    record.dispatch_authority,
    record.fallback_authority,
    record.fallback_status,
    record.dispatch_action,
    record.dispatch_scope,
    record.session_start_status,
    record.session_start_ok ? 1 : 0,
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return { ok: true };
}

async function ensureCloudflareResidentDispatchDecisionSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_decisions (
      dispatch_decision_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT,
      decision_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      dispatch_scope TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      decision_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_decisions_site_recorded
    ON cloudflare_resident_dispatch_decisions(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentDispatchDecisions(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentDispatchDecisionSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_dispatch_decisions
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    dispatch_decision_id: row.dispatch_decision_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    carrier_session_id: row.carrier_session_id,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
    decision_state: row.decision_state,
    dispatch_authority: row.dispatch_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    dispatch_action: row.dispatch_action,
    dispatch_scope: row.dispatch_scope,
    session_start_status: Number(row.session_start_status),
    session_start_ok: Boolean(row.session_start_ok),
    decision: parseJsonObject(row.decision_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function recordCloudflareResidentLoopShadowRun(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const loopRun = createResidentLoopShadowRun(siteId, params);
  if (!loopRun.ok) return loopRun;
  const record = {
    loop_run_id: params.loop_run_id ?? residentLoopShadowRunId(siteId, loopRun.loop_run),
    site_id: siteId,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    source_locus: params.source_locus ?? 'windows_local_site',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    loop_run: loopRun.loop_run,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareResidentLoopShadowRunSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_loop_shadow_runs (
      loop_run_id,
      site_id,
      operation_id,
      source_locus,
      target_locus,
      run_started_at,
      run_finished_at,
      loop_status,
      step_count,
      operator_attention_count,
      dispatch_authority,
      shadow_mode,
      dispatch_action,
      loop_run_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(loop_run_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      run_started_at = excluded.run_started_at,
      run_finished_at = excluded.run_finished_at,
      loop_status = excluded.loop_status,
      step_count = excluded.step_count,
      operator_attention_count = excluded.operator_attention_count,
      dispatch_authority = excluded.dispatch_authority,
      shadow_mode = excluded.shadow_mode,
      dispatch_action = excluded.dispatch_action,
      loop_run_json = excluded.loop_run_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.loop_run_id,
    record.site_id,
    record.loop_run.operation_id,
    record.source_locus,
    record.target_locus,
    record.loop_run.run_started_at,
    record.loop_run.run_finished_at,
    record.loop_run.status,
    record.loop_run.step_count,
    record.loop_run.operator_attention_count,
    record.dispatch_authority,
    record.shadow_mode,
    record.dispatch_action,
    JSON.stringify(record.loop_run),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    loop_run: record.loop_run,
    record,
  };
}

async function ensureCloudflareResidentLoopShadowRunSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_loop_shadow_runs (
      loop_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      run_started_at TEXT NOT NULL,
      run_finished_at TEXT,
      loop_status TEXT NOT NULL,
      step_count INTEGER NOT NULL,
      operator_attention_count INTEGER NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      loop_run_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_loop_shadow_runs_site_recorded
    ON cloudflare_resident_loop_shadow_runs(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentLoopShadowRuns(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentLoopShadowRunSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_loop_shadow_runs
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    loop_run_id: row.loop_run_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    run_started_at: row.run_started_at,
    run_finished_at: row.run_finished_at,
    loop_status: row.loop_status,
    step_count: Number(row.step_count),
    operator_attention_count: Number(row.operator_attention_count),
    dispatch_authority: row.dispatch_authority,
    shadow_mode: row.shadow_mode,
    dispatch_action: row.dispatch_action,
    loop_run: parseJsonObject(row.loop_run_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createResidentLoopShadowRun(siteId, params = {}) {
  const source = params.loop_run ?? params.summary ?? {};
  const runStartedAt = String(params.run_started_at ?? source.run_started_at ?? source.started_at ?? new Date().toISOString());
  const status = String(params.status ?? source.status ?? 'observed');
  const steps = Array.isArray(params.steps) ? params.steps : Array.isArray(source.steps) ? source.steps : [];
  const operatorAttention = Array.isArray(params.operator_attention) ? params.operator_attention
    : Array.isArray(source.operator_attention) ? source.operator_attention
      : Array.isArray(source.operator_attention_events) ? source.operator_attention_events
        : [];
  return {
    ok: true,
    loop_run: {
      schema: 'narada.sonar.resident_loop_shadow_run.v1',
      site_id: siteId,
      operation_id: params.operation_id ?? source.operation_id ?? null,
      run_started_at: runStartedAt,
      run_finished_at: params.run_finished_at ?? source.run_finished_at ?? source.finished_at ?? null,
      status,
      step_count: clampInteger(params.step_count ?? source.step_count ?? steps.length, 0, 10000, steps.length),
      operator_attention_count: clampInteger(params.operator_attention_count ?? source.operator_attention_count ?? operatorAttention.length, 0, 10000, operatorAttention.length),
      steps,
      operator_attention: operatorAttention,
      source_summary_path: params.source_summary_path ?? params.summary_path ?? null,
      dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
      dispatch_action: 'none',
      shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    },
  };
}

function residentLoopShadowRunId(siteId, loopRun) {
  return `resident_loop_shadow_${safeIdToken(siteId)}_${safeIdToken(loopRun.operation_id)}_${safeIdToken(loopRun.run_started_at)}`;
}

async function recordCloudflareWebhookDelayShadowObservation(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  const record = {
    observation_id: params.observation_id ?? webhookDelayShadowObservationId(siteId, observation.observation),
    site_id: siteId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    source_locus: params.source_locus ?? 'windows_local_site',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    observation: observation.observation,
    classification,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareWebhookDelayShadowObservationSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_shadow_observations (
      observation_id,
      site_id,
      source_locus,
      target_locus,
      generated_at,
      latest_delay_minutes,
      critical_minutes,
      classification_state,
      dispatch_authority,
      shadow_mode,
      dispatch_action,
      observation_json,
      classification_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      generated_at = excluded.generated_at,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      classification_state = excluded.classification_state,
      dispatch_authority = excluded.dispatch_authority,
      shadow_mode = excluded.shadow_mode,
      dispatch_action = excluded.dispatch_action,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.observation_id,
    record.site_id,
    record.source_locus,
    record.target_locus,
    record.observation.generated_at,
    record.classification.latest_delay_minutes,
    record.classification.critical_minutes,
    record.classification.state,
    record.dispatch_authority,
    record.shadow_mode,
    record.dispatch_action,
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation: record.observation,
    classification,
    record,
  };
}

async function ensureCloudflareWebhookDelayShadowObservationSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_shadow_observations (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_shadow_observations_site_recorded
    ON cloudflare_webhook_delay_shadow_observations(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayShadowObservations(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayShadowObservationSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_shadow_observations
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    observation_id: row.observation_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    generated_at: row.generated_at,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    classification_state: row.classification_state,
    dispatch_authority: row.dispatch_authority,
    shadow_mode: row.shadow_mode,
    dispatch_action: row.dispatch_action,
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function recordCloudflareWebhookDelayObservationPrimaryRead(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayObservationPrimaryRead(observation.observation);
  const record = {
    observation_id: params.observation_id ?? webhookDelayObservationPrimaryReadId(siteId, observation.observation),
    site_id: siteId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    source_locus: params.source_locus ?? 'cloudflare_carrier_site',
    source_material_locus: params.source_material_locus ?? 'windows_local_site_summary',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
    fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: 'available',
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation: observation.observation,
    classification,
    retained_windows_authority: ['windows_observation_refresh_fallback', 'mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_observation_primary_reads (
      observation_id,
      site_id,
      source_locus,
      source_material_locus,
      target_locus,
      generated_at,
      latest_delay_minutes,
      critical_minutes,
      classification_state,
      observation_authority,
      fallback_authority,
      fallback_status,
      dispatch_authority,
      dispatch_action,
      observation_json,
      classification_json,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      source_material_locus = excluded.source_material_locus,
      target_locus = excluded.target_locus,
      generated_at = excluded.generated_at,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      classification_state = excluded.classification_state,
      observation_authority = excluded.observation_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      dispatch_authority = excluded.dispatch_authority,
      dispatch_action = excluded.dispatch_action,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.observation_id,
    record.site_id,
    record.source_locus,
    record.source_material_locus,
    record.target_locus,
    record.observation.generated_at,
    record.classification.latest_delay_minutes,
    record.classification.critical_minutes,
    record.classification.state,
    record.observation_authority,
    record.fallback_authority,
    record.fallback_status,
    record.dispatch_authority,
    record.dispatch_action,
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    status: 'cloudflare_primary_recorded',
    site_id: siteId,
    observation_authority: record.observation_authority,
    fallback_authority: record.fallback_authority,
    fallback_status: record.fallback_status,
    dispatch_authority: record.dispatch_authority,
    dispatch_action: record.dispatch_action,
    observation: record.observation,
    classification,
    record,
  };
}

async function ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_observation_primary_reads (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      source_material_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      observation_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_observation_primary_reads_site_recorded
    ON cloudflare_webhook_delay_observation_primary_reads(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayObservationPrimaryReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_observation_primary_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    observation_id: row.observation_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    source_locus: row.source_locus,
    source_material_locus: row.source_material_locus,
    target_locus: row.target_locus,
    generated_at: row.generated_at,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    classification_state: row.classification_state,
    observation_authority: row.observation_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    dispatch_authority: row.dispatch_authority,
    dispatch_action: row.dispatch_action,
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function putCloudflareWebhookDelayRemoteSourceSamples(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const sourceAdapterId = params.source_adapter_id ?? 'sonar_webhook_delay_d1_remote_source_v1';
  const rawSamples = Array.isArray(params.samples) ? params.samples : [params.sample ?? params].filter(Boolean);
  const samples = rawSamples.map((sample, index) => normalizeWebhookDelayRemoteSourceSample(siteId, sourceAdapterId, sample, index));
  if (samples.length === 0) return { ok: false, code: 'webhook_delay_remote_source_samples_missing' };
  if (samples.some((sample) => !sample.ok)) return samples.find((sample) => !sample.ok);
  await ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db);
  const recordedAt = new Date().toISOString();
  for (const { sample } of samples) {
    await db.prepare(`
      INSERT INTO cloudflare_webhook_delay_remote_source_samples (
        sample_id,
        site_id,
        source_adapter_id,
        sample_role,
        observed_at,
        observed_at_ct,
        elapsed_minutes,
        delay_minutes,
        sample_json,
        recorded_by_principal_id,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sample_id) DO UPDATE SET
        sample_role = excluded.sample_role,
        observed_at = excluded.observed_at,
        observed_at_ct = excluded.observed_at_ct,
        elapsed_minutes = excluded.elapsed_minutes,
        delay_minutes = excluded.delay_minutes,
        sample_json = excluded.sample_json,
        recorded_by_principal_id = excluded.recorded_by_principal_id,
        recorded_at = excluded.recorded_at
    `).bind(
      sample.sample_id,
      sample.site_id,
      sample.source_adapter_id,
      sample.sample_role,
      sample.observed_at,
      sample.observed_at_ct,
      sample.elapsed_minutes,
      sample.delay_minutes,
      JSON.stringify(sample),
      principal?.principal_id ?? 'unknown-principal',
      recordedAt,
    ).run();
  }
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
    status: 'samples_recorded',
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    sample_count: samples.length,
    samples: samples.map(({ sample }) => sample),
  };
}

async function readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const sourceAdapterId = params.source_adapter_id ?? 'sonar_webhook_delay_d1_remote_source_v1';
  const sourceMaterialLocus = params.source_material_locus ?? 'cloudflare_remote_source_adapter';
  const samples = await listCloudflareWebhookDelayRemoteSourceSamples(env, siteId, sourceAdapterId, params.sample_limit ?? 200);
  if (samples.length === 0) return { ok: false, code: 'webhook_delay_remote_source_samples_missing', source_adapter_id: sourceAdapterId };
  const summary = createWebhookDelaySummaryFromRemoteSourceSamples(siteId, samples, params);
  const result = await recordCloudflareWebhookDelayObservationPrimaryRead(env, siteId, {
    ...params,
    observation_id: params.observation_id ?? `webhook_delay_remote_source_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(summary.generated_at)}`,
    source_summary_path: null,
    source_locus: 'cloudflare_carrier_site',
    source_material_locus: sourceMaterialLocus,
    summary,
  }, principal);
  if (!result.ok) return result;
  return {
    ...result,
    schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    source_material_locus: sourceMaterialLocus,
    source_sample_count: samples.length,
    source_samples: samples,
  };
}

async function readCloudflareWebhookDelayDirectRemoteMetricSource(env = {}, siteId, params = {}, principal = null) {
  const sourceUrl = resolveDirectMetricSourceUrl(env, params);
  if (!sourceUrl) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_url_missing' };
  const sourceAdapterId = params.source_adapter_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_direct_remote_metric_source_v1';
  const sourceId = params.source_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ID ?? 'sonar_webhook_delay_direct_remote_metric_source';
  const fetched = await fetchWebhookDelayDirectMetricSource(env, sourceUrl, params);
  if (!fetched.ok) return fetched;
  const samples = createWebhookDelayDirectMetricSourceSamples(siteId, sourceAdapterId, sourceId, sourceUrl, fetched.body, params);
  if (!samples.ok) return samples;
  const put = await putCloudflareWebhookDelayRemoteSourceSamples(env, siteId, { source_adapter_id: sourceAdapterId, samples: samples.samples }, principal);
  if (!put.ok) return put;
  const read = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, siteId, {
    ...params,
    source_adapter_id: sourceAdapterId,
    source_material_locus: 'direct_remote_metric_source',
    observation_id: params.observation_id ?? `webhook_delay_direct_remote_metric_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(samples.generated_at)}`,
    generated_at: params.generated_at ?? samples.generated_at,
  }, principal);
  if (!read.ok) return read;
  return {
    ...read,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_SCHEMA,
    status: 'direct_remote_metric_source_recorded',
    source_id: sourceId,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_AUTHORITY,
    source_material_locus: 'direct_remote_metric_source',
    direct_source_url_host: safeUrlHost(sourceUrl),
    direct_source_sample_count: samples.samples.length,
    source_sample_count: samples.samples.length,
    put,
  };
}

function resolveDirectMetricSourceUrl(env = {}, params = {}) {
  if (env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_URL) return env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_URL;
  if (env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ALLOW_OPERATOR_URL === '1' && params.source_url) return params.source_url;
  return null;
}

async function fetchWebhookDelayDirectMetricSource(env = {}, sourceUrl, params = {}) {
  const headers = { accept: 'application/json' };
  const token = params.source_token ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_TOKEN ?? null;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(sourceUrl, { method: 'GET', headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_fetch_failed', http_status: response.status, body };
  if (!body || typeof body !== 'object') return { ok: false, code: 'webhook_delay_direct_remote_metric_source_invalid_json' };
  return { ok: true, body };
}

function createWebhookDelayDirectMetricSourceSamples(siteId, sourceAdapterId, sourceId, sourceUrl, body = {}, params = {}) {
  const rows = Array.isArray(body.samples) ? body.samples
    : Array.isArray(body.rows) ? body.rows
      : Array.isArray(body.observations) ? body.observations
        : [];
  if (rows.length === 0) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_rows_missing' };
  const generatedAt = params.generated_at ?? body.generated_at ?? new Date().toISOString();
  const sourceHost = safeUrlHost(sourceUrl);
  const samples = rows.map((row, index) => {
    const observedAt = row.observed_at ?? row.created_at ?? row.at ?? row.last_event_datetime_that_arrived ?? generatedAt;
    return {
      sample_id: row.sample_id ?? `webhook_delay_direct_metric_sample_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(observedAt)}_${index}`,
      sample_role: row.sample_role ?? row.role ?? (index === rows.length - 1 ? 'today_latest' : 'historical_source_row'),
      observed_at: observedAt,
      observed_at_ct: row.observed_at_ct ?? row.at_ct ?? null,
      elapsed_minutes: row.elapsed_minutes ?? null,
      delay_minutes: row.delay_minutes ?? row.delayMinutes ?? row.latest?.delay_minutes,
      source_record: {
        source_id: sourceId,
        source_schema: body.schema ?? null,
        direct_source_url_host: sourceHost,
        source_record_id: row.id ?? row.sample_id ?? null,
        last_event_datetime_that_arrived: row.last_event_datetime_that_arrived ?? null,
      },
    };
  });
  return { ok: true, generated_at: generatedAt, samples };
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'unknown-host';
  }
}

async function runCloudflareWebhookDelayScheduledSourceRead(env = {}, params = {}, principal = null) {
  if (env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_READ_ENABLED !== '1') {
    return { ok: true, schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA, status: 'disabled' };
  }
  const siteId = params.site_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SITE_ID ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const sourceAdapterId = params.source_adapter_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_windows_readonly_db_summary_feed_v1';
  const criticalMinutes = Number(params.critical_minutes ?? env.CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  const scheduledAt = params.scheduled_time ?? params.scheduled_at ?? new Date().toISOString();
  const runId = params.scheduled_run_id ?? `webhook_delay_scheduled_source_read_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(scheduledAt)}`;
  const observationId = params.observation_id ?? `webhook_delay_scheduled_source_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(scheduledAt)}`;
  const triggerKind = params.trigger_kind ?? 'operator_requested';
  const cron = params.cron ?? null;
  let read = null;
  let status = 'failed';
  let failureCode = null;
  try {
    read = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, siteId, {
      ...params,
      source_adapter_id: sourceAdapterId,
      observation_id: observationId,
      critical_minutes: criticalMinutes,
      generated_at: params.generated_at ?? scheduledAt,
    }, principal ?? { principal_id: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY });
    status = read.ok ? 'cloudflare_scheduled_read_recorded' : 'failed';
    failureCode = read.ok ? null : read.code ?? 'scheduled_remote_source_read_failed';
  } catch (error) {
    read = { ok: false, code: 'scheduled_remote_source_read_exception', error: error?.message ?? String(error) };
    failureCode = read.code;
  }
  const record = {
    schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
    scheduled_run_id: runId,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    observation_id: read?.observation?.observation_id ?? read?.record?.observation_id ?? observationId,
    trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
    trigger_kind: triggerKind,
    cron,
    scheduled_at: scheduledAt,
    status,
    failure_code: failureCode,
    source_material_locus: read?.source_material_locus ?? 'cloudflare_remote_source_adapter',
    source_authority: read?.source_authority ?? CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    source_sample_count: read?.source_sample_count ?? null,
    classification_state: read?.classification?.state ?? null,
    latest_delay_minutes: numberOrNull(read?.observation?.latest?.delay_minutes),
    critical_minutes: Number.isFinite(criticalMinutes) ? criticalMinutes : DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES,
    fallback_authority: read?.fallback_authority ?? WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: read?.fallback_status ?? 'available',
    read,
  };
  const persisted = await recordCloudflareWebhookDelayScheduledSourceRead(env, siteId, record, principal ?? { principal_id: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY });
  if (!persisted.ok) return persisted;
  return {
    ok: read?.ok === true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
    status,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    scheduled_run_id: runId,
    observation_id: record.observation_id,
    trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
    source_material_locus: record.source_material_locus,
    source_authority: record.source_authority,
    source_sample_count: record.source_sample_count,
    classification_state: record.classification_state,
    fallback_authority: record.fallback_authority,
    fallback_status: record.fallback_status,
    failure_code: failureCode,
    record,
  };
}

async function recordCloudflareWebhookDelayScheduledSourceRead(env = {}, siteId, record, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareWebhookDelayScheduledSourceReadSchema(db);
  const recordedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_scheduled_source_reads (
      scheduled_run_id,
      site_id,
      source_adapter_id,
      observation_id,
      trigger_authority,
      trigger_kind,
      cron,
      scheduled_at,
      run_status,
      failure_code,
      source_material_locus,
      source_authority,
      source_sample_count,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      fallback_authority,
      fallback_status,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scheduled_run_id) DO UPDATE SET
      run_status = excluded.run_status,
      failure_code = excluded.failure_code,
      source_sample_count = excluded.source_sample_count,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      fallback_status = excluded.fallback_status,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.scheduled_run_id,
    siteId,
    record.source_adapter_id,
    record.observation_id,
    record.trigger_authority,
    record.trigger_kind,
    record.cron,
    record.scheduled_at,
    record.status,
    record.failure_code,
    record.source_material_locus,
    record.source_authority,
    record.source_sample_count,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.fallback_authority,
    record.fallback_status,
    JSON.stringify(record),
    principal?.principal_id ?? 'unknown-principal',
    recordedAt,
  ).run();
  return { ok: true, record: { ...record, recorded_at: recordedAt } };
}

async function listCloudflareWebhookDelayScheduledSourceReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayScheduledSourceReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 500, 100);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_scheduled_source_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, scheduled_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    scheduled_run_id: row.scheduled_run_id,
    site_id: row.site_id,
    source_adapter_id: row.source_adapter_id,
    observation_id: row.observation_id,
    trigger_authority: row.trigger_authority,
    trigger_kind: row.trigger_kind,
    cron: row.cron,
    scheduled_at: row.scheduled_at,
    status: row.run_status,
    failure_code: row.failure_code,
    source_material_locus: row.source_material_locus,
    source_authority: row.source_authority,
    source_sample_count: numberOrNull(row.source_sample_count),
    classification_state: row.classification_state,
    latest_delay_minutes: numberOrNull(row.latest_delay_minutes),
    critical_minutes: numberOrNull(row.critical_minutes),
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function ensureCloudflareWebhookDelayScheduledSourceReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_scheduled_source_reads (
      scheduled_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      trigger_authority TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      cron TEXT,
      scheduled_at TEXT NOT NULL,
      run_status TEXT NOT NULL,
      failure_code TEXT,
      source_material_locus TEXT NOT NULL,
      source_authority TEXT NOT NULL,
      source_sample_count INTEGER,
      classification_state TEXT,
      latest_delay_minutes REAL,
      critical_minutes REAL NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_scheduled_source_reads_site_recorded
    ON cloudflare_webhook_delay_scheduled_source_reads(site_id, recorded_at)
  `).run();
}

async function ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_remote_source_samples (
      sample_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      sample_role TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      observed_at_ct TEXT,
      elapsed_minutes REAL,
      delay_minutes REAL NOT NULL,
      sample_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_remote_source_samples_site_adapter_observed
    ON cloudflare_webhook_delay_remote_source_samples(site_id, source_adapter_id, observed_at)
  `).run();
}

async function listCloudflareWebhookDelayRemoteSourceSamples(env = {}, siteId, sourceAdapterId = 'sonar_webhook_delay_d1_remote_source_v1', limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db);
  const boundedLimit = clampInteger(limit, 0, 500, 100);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_remote_source_samples
    WHERE site_id = ? AND source_adapter_id = ?
    ORDER BY observed_at DESC, recorded_at DESC
    LIMIT ?
  `).bind(siteId, sourceAdapterId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    sample_id: row.sample_id,
    site_id: row.site_id,
    source_adapter_id: row.source_adapter_id,
    sample_role: row.sample_role,
    observed_at: row.observed_at,
    observed_at_ct: row.observed_at_ct,
    elapsed_minutes: numberOrNull(row.elapsed_minutes),
    delay_minutes: Number(row.delay_minutes),
    sample: parseJsonObject(row.sample_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function normalizeWebhookDelayRemoteSourceSample(siteId, sourceAdapterId, input = {}, index = 0) {
  const delayMinutes = Number(input.delay_minutes ?? input.delayMinutes ?? input.latest?.delay_minutes);
  if (!Number.isFinite(delayMinutes)) return { ok: false, code: 'webhook_delay_remote_source_sample_delay_minutes_missing' };
  const observedAt = String(input.observed_at ?? input.at ?? input.latest?.at ?? new Date().toISOString());
  const sampleRole = input.sample_role ?? input.role ?? 'today_latest';
  const sample = {
    schema: 'narada.sonar.webhook_delay_remote_source_sample.v1',
    sample_id: input.sample_id ?? `webhook_delay_source_sample_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(observedAt)}_${index}`,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    sample_role: sampleRole,
    observed_at: observedAt,
    observed_at_ct: input.observed_at_ct ?? input.at_ct ?? input.latest?.at_ct ?? null,
    elapsed_minutes: numberOrNull(input.elapsed_minutes ?? input.latest?.elapsed_minutes),
    delay_minutes: delayMinutes,
    source_record: input.source_record ?? null,
  };
  return { ok: true, sample };
}

function createWebhookDelaySummaryFromRemoteSourceSamples(siteId, samples = [], params = {}) {
  const sorted = [...samples].sort((left, right) => String(right.observed_at).localeCompare(String(left.observed_at)));
  const latest = sorted.find((sample) => sample.sample_role === 'today_latest') ?? sorted[0];
  const comparison = sorted.find((sample) => sample.sample_role === 'yesterday_same_clock') ?? null;
  const latestDelay = Number(latest.delay_minutes);
  const comparisonDelay = comparison ? Number(comparison.delay_minutes) : null;
  return {
    schema: 'narada.sonar/webhook-delay-remote-source-adapter/v1',
    generated_at: params.generated_at ?? new Date().toISOString(),
    source_adapter: {
      adapter_id: latest.source_adapter_id,
      authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
      site_id: siteId,
      sample_count: samples.length,
    },
    rows72: samples.length,
    today: {
      rows: samples.filter((sample) => sample.sample_role === 'today_latest').length || null,
      latest: {
        at: latest.observed_at,
        at_ct: latest.observed_at_ct,
        elapsed_minutes: latest.elapsed_minutes,
        delay_minutes: latestDelay,
      },
    },
    yesterday_same_clock: comparison ? {
      rows: 1,
      at: comparison.observed_at,
      at_ct: comparison.observed_at_ct,
      elapsed_minutes: comparison.elapsed_minutes,
      delay_minutes: comparisonDelay,
      delta_minutes_today_minus_yesterday: Number.isFinite(comparisonDelay) ? latestDelay - comparisonDelay : null,
    } : null,
  };
}

function createWebhookDelayShadowObservation(siteId, params = {}) {
  const summary = params.summary ?? params.observation ?? {};
  const latest = summary.today?.latest ?? params.latest ?? {};
  const latestDelayMinutes = Number(params.latest_delay_minutes ?? latest.delay_minutes);
  if (!Number.isFinite(latestDelayMinutes)) return { ok: false, code: 'webhook_delay_latest_delay_minutes_missing' };
  const criticalMinutes = Number(params.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) return { ok: false, code: 'webhook_delay_critical_minutes_invalid' };
  const generatedAt = String(params.generated_at ?? summary.generated_at ?? new Date().toISOString());
  return {
    ok: true,
    observation: {
      schema: 'narada.sonar.webhook_delay_observation.v1',
      site_id: siteId,
      source_schema: summary.schema ?? null,
      source_summary_path: params.source_summary_path ?? params.summary_path ?? null,
      generated_at: generatedAt,
      rows72: numberOrNull(summary.rows72 ?? params.rows72),
      latest: {
        at: latest.at ?? params.latest_at ?? null,
        at_ct: latest.at_ct ?? params.latest_at_ct ?? null,
        elapsed_minutes: numberOrNull(latest.elapsed_minutes ?? params.latest_elapsed_minutes),
        delay_minutes: latestDelayMinutes,
      },
      yesterday_same_clock: summary.yesterday_same_clock ?? params.yesterday_same_clock ?? null,
      critical_minutes: criticalMinutes,
    },
  };
}

function classifyWebhookDelayShadowObservation(observation) {
  const latestDelayMinutes = Number(observation?.latest?.delay_minutes);
  const criticalMinutes = Number(observation?.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  const state = Number.isFinite(latestDelayMinutes) && latestDelayMinutes >= criticalMinutes ? 'critical' : 'ok';
  return {
    schema: 'narada.sonar.webhook_delay_classification.v1',
    state,
    reason: state === 'critical' ? 'webhook_delay_critical_threshold_crossed' : 'webhook_delay_below_critical_threshold',
    latest_delay_minutes: latestDelayMinutes,
    critical_minutes: criticalMinutes,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
  };
}

function classifyWebhookDelayObservationPrimaryRead(observation) {
  const classification = classifyWebhookDelayShadowObservation(observation);
  return {
    ...classification,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
    fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: 'available',
    read_mode: 'cloudflare_primary_with_windows_fallback',
  };
}

function webhookDelayShadowObservationId(siteId, observation) {
  return `webhook_delay_shadow_${safeIdToken(siteId)}_${safeIdToken(observation.generated_at)}_${safeIdToken(observation.latest.delay_minutes)}`;
}

function webhookDelayObservationPrimaryReadId(siteId, observation) {
  return `webhook_delay_observation_primary_${safeIdToken(siteId)}_${safeIdToken(observation.generated_at)}_${safeIdToken(observation.latest.delay_minutes)}`;
}

async function recordCloudflareWebhookDelayDirectiveDualRecord(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  if (classification.state !== 'critical') return { ok: false, code: 'webhook_delay_directive_requires_critical_classification', classification };

  const now = new Date().toISOString();
  const operationId = params.operation_id ?? null;
  const directiveRecordId = params.directive_record_id ?? webhookDelayDirectiveRecordId(siteId, operationId, observation.observation.generated_at);
  const directiveId = params.directive_id ?? `directive_webhook_delay_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const inputEventId = params.input_event_id ?? `input_webhook_delay_directive_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const thresholdPolicy = createWebhookDelayThresholdPolicy(params, classification);
  const directiveIntent = createWebhookDelayDirectiveIntent({
    siteId,
    operationId,
    directiveId,
    inputEventId,
    observation: observation.observation,
    classification,
    thresholdPolicy,
    createdAt: now,
    principal,
  });
  const carrierAdmission = classifyCarrierInputAdmission(directiveIntent.input_event, { activeTurn: false, observerMuted: false });
  const record = {
    directive_record_id: directiveRecordId,
    site_id: siteId,
    operation_id: operationId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    threshold_policy: thresholdPolicy,
    observation: observation.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    classification_state: classification.state,
    critical_minutes: classification.critical_minutes,
    latest_delay_minutes: classification.latest_delay_minutes,
    directive_action: 'record_directive_emission_intent',
    directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: 'available',
    migrated_authority: 'directive_emission_intent_only',
    retained_windows_authority: ['mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write', 'windows_fallback_dispatch'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_directive_dual_records (
      directive_record_id,
      site_id,
      operation_id,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      directive_action,
      directive_authority,
      fallback_authority,
      fallback_status,
      threshold_policy_json,
      observation_json,
      classification_json,
      directive_intent_json,
      carrier_admission_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(directive_record_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      directive_action = excluded.directive_action,
      directive_authority = excluded.directive_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      threshold_policy_json = excluded.threshold_policy_json,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      directive_intent_json = excluded.directive_intent_json,
      carrier_admission_json = excluded.carrier_admission_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.directive_record_id,
    record.site_id,
    record.operation_id,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.directive_action,
    record.directive_authority,
    record.fallback_authority,
    record.fallback_status,
    JSON.stringify(record.threshold_policy),
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record.directive_intent),
    JSON.stringify(record.carrier_admission),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    operation_id: operationId,
    directive_action: record.directive_action,
    directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    threshold_policy: thresholdPolicy,
    observation: record.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    record,
  };
}

async function ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_dual_records (
      directive_record_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_action TEXT NOT NULL,
      directive_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_directive_dual_records_site_recorded
    ON cloudflare_webhook_delay_directive_dual_records(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayDirectiveDualRecords(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_directive_dual_records
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    directive_record_id: row.directive_record_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    classification_state: row.classification_state,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    directive_action: row.directive_action,
    directive_authority: row.directive_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    threshold_policy: parseJsonObject(row.threshold_policy_json),
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    directive_intent: parseJsonObject(row.directive_intent_json),
    carrier_admission: parseJsonObject(row.carrier_admission_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function deliverCloudflareWebhookDelayDirectiveWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  if (classification.state !== 'critical') return { ok: false, code: 'webhook_delay_directive_delivery_requires_critical_classification', classification };

  const now = new Date().toISOString();
  const nowToken = now.replace(/[-:.TZ]/g, '').slice(0, 14);
  const operationId = params.operation_id ?? 'operation_narada_cloudflare_control';
  const carrierSessionId = params.carrier_session_id ?? `carrier_session_webhook_delay_directive_${nowToken}`;
  const deliveryId = params.delivery_id ?? `webhook_delay_directive_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(carrierSessionId)}`;
  const directiveRecordId = params.directive_record_id ?? webhookDelayDirectiveRecordId(siteId, operationId, observation.observation.generated_at);
  const directiveId = params.directive_id ?? `directive_webhook_delay_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const inputEventId = params.input_event_id ?? `input_webhook_delay_directive_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const thresholdPolicy = createWebhookDelayThresholdPolicy(params, classification);
  const directiveIntent = createWebhookDelayDirectiveIntent({
    siteId,
    operationId,
    directiveId,
    inputEventId,
    observation: observation.observation,
    classification,
    thresholdPolicy,
    createdAt: now,
    principal,
    directiveVisibility: params.directive_visibility ?? 'agent_visible',
    carrierInputOperation: 'carrier.input.deliver',
    deliverySemantics: 'cloudflare_primary_delivery',
    authorityRef: 'cloudflare-carrier:authority/webhook-delay-directive-primary-with-windows-fallback:v1',
  });
  const carrierAdmission = classifyCarrierInputAdmission(directiveIntent.input_event, { activeTurn: false, observerMuted: false });
  const sessionStart = {
    operation: 'session.start',
    request_id: params.session_start_request_id ?? `request_webhook_delay_directive_session_start_${nowToken}`,
    params: {
      carrier_session_id: carrierSessionId,
      agent_id: params.agent_id ?? 'narada.cloudflare.webhook_delay.directive',
      site_id: siteId,
      site_root: params.site_root ?? params.site_ref ?? `cloudflare://${siteId}`,
      site_ref: params.site_ref ?? `cloudflare://${siteId}`,
      operation_id: operationId,
    },
  };
  const sessionStartRouted = await routeCarrierSessionRequest('https://carrier.webhook-delay-directive.local/api/carrier', sessionStart, principal, env);
  const sessionStarted = sessionStartRouted.status >= 200 && sessionStartRouted.status < 300 && sessionStartRouted.body?.ok !== false;
  const deliveryRequest = {
    operation: 'carrier.input.deliver',
    request_id: params.delivery_request_id ?? `request_webhook_delay_directive_delivery_${nowToken}`,
    carrier_session_id: carrierSessionId,
    params: {
      site_id: siteId,
      operation_id: operationId,
      input: directiveIntent.input_event,
    },
  };
  const delivered = sessionStarted
    ? await routeCarrierSessionRequest('https://carrier.webhook-delay-directive.local/api/carrier', deliveryRequest, principal, env)
    : { status: 424, body: { ok: false, code: 'cloudflare_session_start_required_before_directive_delivery' } };
  const cloudflareDelivered = delivered.status >= 200 && delivered.status < 300 && delivered.body?.ok !== false && delivered.body?.admitted === true;
  const record = {
    delivery_id: deliveryId,
    directive_record_id: directiveRecordId,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    delivery_state: cloudflareDelivered ? 'cloudflare_primary_delivered' : 'cloudflare_primary_failed_windows_fallback_available',
    threshold_policy: thresholdPolicy,
    observation: observation.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    classification_state: classification.state,
    critical_minutes: classification.critical_minutes,
    latest_delay_minutes: classification.latest_delay_minutes,
    directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: 'available',
    delivery_action: 'cloudflare_carrier_input_deliver',
    session_start_status: sessionStartRouted.status,
    session_start_ok: sessionStartRouted.body?.ok === true,
    session_start_body: sessionStartRouted.body,
    delivery_status: delivered.status,
    delivery_ok: delivered.body?.ok === true,
    delivery_body: delivered.body,
    migrated_authority: 'webhook_delay_directive_delivery',
    retained_windows_authority: ['mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write', 'windows_fallback_dispatch'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await recordCloudflareWebhookDelayDirectiveDelivery(env, record);
  return {
    ok: cloudflareDelivered,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    status: record.delivery_state,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    delivery_action: record.delivery_action,
    threshold_policy: thresholdPolicy,
    observation: record.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    session_start: sessionStartRouted.body,
    delivery: delivered.body,
    record,
  };
}

async function recordCloudflareWebhookDelayDirectiveDelivery(env = {}, record) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareWebhookDelayDirectiveDeliverySchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_directive_deliveries (
      delivery_id,
      directive_record_id,
      site_id,
      operation_id,
      carrier_session_id,
      delivery_state,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      directive_authority,
      dispatch_authority,
      fallback_authority,
      fallback_status,
      delivery_action,
      session_start_status,
      session_start_ok,
      delivery_status,
      delivery_ok,
      threshold_policy_json,
      observation_json,
      classification_json,
      directive_intent_json,
      carrier_admission_json,
      session_start_json,
      delivery_json,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(delivery_id) DO UPDATE SET
      directive_record_id = excluded.directive_record_id,
      operation_id = excluded.operation_id,
      carrier_session_id = excluded.carrier_session_id,
      delivery_state = excluded.delivery_state,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      directive_authority = excluded.directive_authority,
      dispatch_authority = excluded.dispatch_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      delivery_action = excluded.delivery_action,
      session_start_status = excluded.session_start_status,
      session_start_ok = excluded.session_start_ok,
      delivery_status = excluded.delivery_status,
      delivery_ok = excluded.delivery_ok,
      threshold_policy_json = excluded.threshold_policy_json,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      directive_intent_json = excluded.directive_intent_json,
      carrier_admission_json = excluded.carrier_admission_json,
      session_start_json = excluded.session_start_json,
      delivery_json = excluded.delivery_json,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.delivery_id,
    record.directive_record_id,
    record.site_id,
    record.operation_id,
    record.carrier_session_id,
    record.delivery_state,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.directive_authority,
    record.dispatch_authority,
    record.fallback_authority,
    record.fallback_status,
    record.delivery_action,
    record.session_start_status,
    record.session_start_ok ? 1 : 0,
    record.delivery_status,
    record.delivery_ok ? 1 : 0,
    JSON.stringify(record.threshold_policy),
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record.directive_intent),
    JSON.stringify(record.carrier_admission),
    JSON.stringify(record.session_start_body),
    JSON.stringify(record.delivery_body),
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return { ok: true };
}

async function ensureCloudflareWebhookDelayDirectiveDeliverySchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_deliveries (
      delivery_id TEXT PRIMARY KEY,
      directive_record_id TEXT,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_authority TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      delivery_action TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      delivery_status INTEGER NOT NULL,
      delivery_ok INTEGER NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      session_start_json TEXT NOT NULL,
      delivery_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_directive_deliveries_site_recorded
    ON cloudflare_webhook_delay_directive_deliveries(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayDirectiveDeliveries(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayDirectiveDeliverySchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_directive_deliveries
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    delivery_id: row.delivery_id,
    directive_record_id: row.directive_record_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    carrier_session_id: row.carrier_session_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    delivery_state: row.delivery_state,
    classification_state: row.classification_state,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    directive_authority: row.directive_authority,
    dispatch_authority: row.dispatch_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    delivery_action: row.delivery_action,
    session_start_status: Number(row.session_start_status),
    session_start_ok: Boolean(row.session_start_ok),
    delivery_status: Number(row.delivery_status),
    delivery_ok: Boolean(row.delivery_ok),
    threshold_policy: parseJsonObject(row.threshold_policy_json),
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    directive_intent: parseJsonObject(row.directive_intent_json),
    carrier_admission: parseJsonObject(row.carrier_admission_json),
    session_start: parseJsonObject(row.session_start_json),
    delivery: parseJsonObject(row.delivery_json),
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createWebhookDelayThresholdPolicy(params = {}, classification = {}) {
  const criticalMinutes = Number(params.critical_minutes ?? classification.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  return {
    schema: 'narada.sonar.webhook_delay_threshold_policy.v1',
    policy_id: params.threshold_policy_id ?? 'webhook_delay_critical_threshold_policy',
    policy_source_ref: params.threshold_policy_source_ref ?? 'D:/code/narada.sonar/.narada/capabilities/operating-loop-policy.json',
    policy_authority: 'cloudflare_carrier_site_recorded_policy',
    critical_minutes: Number.isFinite(criticalMinutes) ? criticalMinutes : DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES,
    classification_reason: classification.reason ?? null,
  };
}

function createWebhookDelayDirectiveIntent({
  siteId,
  operationId,
  directiveId,
  inputEventId,
  observation,
  classification,
  thresholdPolicy,
  createdAt,
  principal,
  directiveVisibility = 'record_only',
  carrierInputOperation = 'carrier.input.record',
  deliverySemantics = 'record_only',
  authorityRef = 'cloudflare-carrier:authority/webhook-delay-directive-dual-record:v1',
}) {
  const directive = {
    schema: 'narada.directive.operation_update_request.v1',
    kind: 'webhook_delay_critical',
    visibility: directiveVisibility,
    target: { kind: 'operation', id: operationId },
    operation: 'Operation: Update on webhook delays',
    content_kind: 'operation_update_request',
    content: {
      kind: 'operation_update_request',
      operation_name: 'Operation: Update on webhook delays',
      reason: classification.reason,
      latest_delay_minutes: classification.latest_delay_minutes,
      critical_minutes: classification.critical_minutes,
      observation_generated_at: observation.generated_at,
    },
  };
  const inputEvent = {
    schema: 'narada.carrier.input_event.v1',
    event_id: inputEventId,
    source_kind: 'system',
    source_id: 'narada.sonar.cloudflare.webhook_delay_directive_emitter',
    source_display_name: 'Narada Sonar Webhook Delay Directive Emitter',
    transport: 'carrier_server_api',
    created_at: createdAt,
    content: 'Operation: Update on webhook delays',
    delivery_mode: 'admit_for_current_turn',
    hold_condition: null,
    authority_ref: authorityRef,
    directive_id: directiveId,
    metadata: {
      directive,
      directive_provenance: {
        kind: 'system_directive',
        source: 'webhook_delay_critical_threshold',
        site_id: siteId,
        operation_id: operationId,
        threshold_policy: thresholdPolicy,
        emitted_by_principal_id: principal?.principal_id ?? 'unknown-principal',
      },
    },
  };
  return {
    schema: 'narada.sonar.webhook_delay_directive_intent.v1',
    directive_id: directiveId,
    input_event_id: inputEventId,
    carrier_input_operation: carrierInputOperation,
    delivery_semantics: deliverySemantics,
    directive_kind: 'webhook_delay_critical',
    input_event: inputEvent,
  };
}

function webhookDelayDirectiveRecordId(siteId, operationId, generatedAt) {
  return `webhook_delay_directive_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(generatedAt)}`;
}

function safeIdToken(value) {
  return String(value ?? 'unknown').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unknown';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function listSiteTasks(env = {}, siteId) {
  const db = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  const store = createD1SessionTaskStore(db, { site_id: siteId });
  return store.list();
}

async function listOperationTasks(env = {}, siteId, sessions = []) {
  const sessionIds = new Set((sessions ?? []).map((session) => session.carrier_session_id).filter(Boolean));
  if (sessionIds.size === 0) return [];
  const tasks = await listSiteTasks(env, siteId);
  return tasks.filter((task) => sessionIds.has(task.carrier_session_id));
}

async function readCarrierEvidenceForSiteSessions(env = {}, sessions = [], principal = null, params = {}) {
  if (!env?.CLOUDFLARE_CARRIER_SESSIONS) return [];
  const boundedLimit = clampInteger(params.carrier_event_limit, 0, 100, 25);
  const evidence = [];
  for (const session of sessions.slice(0, clampInteger(params.session_limit, 0, 50, 25))) {
    const carrierSessionId = session.carrier_session_id;
    try {
      const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
      const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(new Request('https://carrier.site-read.local/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'session.events.read',
          carrier_session_id: carrierSessionId,
          principal,
          params: { after_sequence: 0, limit: boundedLimit },
        }),
      }));
      const body = await durableResponse.json();
      evidence.push({
        carrier_session_id: carrierSessionId,
        ok: body.ok === true,
        events: body.events ?? [],
        next_cursor: body.next_cursor ?? 0,
      });
    } catch (error) {
      evidence.push({
        carrier_session_id: carrierSessionId,
        ok: false,
        error: error?.message ?? 'carrier_evidence_read_failed',
        events: [],
        next_cursor: 0,
      });
    }
  }
  return evidence;
}

async function handleOperatorAuthRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/auth/microsoft/login') {
    return startMicrosoftLogin(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/microsoft/callback') {
    return completeMicrosoftLogin(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/operator/session-capture') {
    return captureOperatorSessionCookie(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/session') {
    const auth = await authenticateOperatorSessionRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);
    return jsonResponse({ ok: true, principal: auth.principal });
  }
  if ((request.method === 'POST' || request.method === 'GET') && url.pathname === '/auth/logout') {
    return operatorRedirectResponse('/console', 302, [
      clearCookie(OPERATOR_SESSION_COOKIE),
      clearCookie(MICROSOFT_OIDC_PENDING_COOKIE),
    ]);
  }
  return jsonResponse({ ok: false, code: 'not_found' }, 404);
}

async function startMicrosoftLogin(request, env = {}) {
  const config = microsoftOidcConfig(request, env);
  if (!config.ok) return jsonResponse({ ok: false, code: config.code }, config.status);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const pending = {
    state,
    nonce,
    code_verifier: codeVerifier,
    created_at: Date.now(),
    post_login_redirect: validatedOperatorPostLoginRedirect(new URL(request.url)),
  };
  const pendingCookie = await signedCookie(MICROSOFT_OIDC_PENDING_COOKIE, pending, env, {
    maxAge: MICROSOFT_OIDC_PENDING_TTL_SECONDS,
  });
  const authorize = new URL(config.authorize_endpoint);
  authorize.searchParams.set('client_id', config.client_id);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', config.redirect_uri);
  authorize.searchParams.set('response_mode', 'query');
  authorize.searchParams.set('scope', 'openid profile email');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge', codeChallenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  return operatorRedirectResponse(authorize.toString(), 302, [pendingCookie]);
}

async function completeMicrosoftLogin(request, env = {}) {
  const config = microsoftOidcConfig(request, env);
  if (!config.ok) return jsonResponse({ ok: false, code: config.code }, config.status);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return jsonResponse({ ok: false, code: 'missing_microsoft_oauth_code' }, 400);
  const pending = await readSignedCookie(request, MICROSOFT_OIDC_PENDING_COOKIE, env);
  if (!pending.ok) return jsonResponse({ ok: false, code: pending.code }, pending.status);
  if (pending.value.state !== state) return jsonResponse({ ok: false, code: 'microsoft_oauth_state_mismatch' }, 400);
  if (Date.now() - Number(pending.value.created_at ?? 0) > MICROSOFT_OIDC_PENDING_TTL_SECONDS * 1000) {
    return jsonResponse({ ok: false, code: 'microsoft_oauth_pending_expired' }, 400);
  }
  const tokenResponse = await exchangeMicrosoftCodeForTokens(code, pending.value.code_verifier, config, env);
  if (!tokenResponse.ok) return jsonResponse({ ok: false, code: tokenResponse.code, detail: tokenResponse.detail }, tokenResponse.status);
  const validation = await validateMicrosoftIdToken(tokenResponse.id_token, pending.value.nonce, config, env);
  if (!validation.ok) return jsonResponse({ ok: false, code: validation.code, detail: validation.detail }, validation.status);
  const session = await createOperatorSessionForMicrosoftPrincipal(validation.claims, env);
  if (!session.ok) return jsonResponse({ ok: false, code: session.code }, session.status);
  const cookie = await signedCookie(OPERATOR_SESSION_COOKIE, { operator_session_id: session.operator_session_id }, env, {
    maxAge: session.expires_in,
  });
  return operatorRedirectResponse(pending.value.post_login_redirect ?? '/console', 302, [cookie, clearCookie(MICROSOFT_OIDC_PENDING_COOKIE)]);
}

async function captureOperatorSessionCookie(request, env = {}) {
  const url = new URL(request.url);
  const returnTo = validateOperatorCaptureReturnTo(url.searchParams.get('return_to'));
  if (!returnTo.ok) return jsonResponse({ ok: false, code: returnTo.code }, returnTo.status);
  const auth = await authenticateOperatorSessionRequest(request, env);
  if (!auth.ok) {
    const loginUrl = new URL('/auth/microsoft/login', url.origin);
    loginUrl.searchParams.set('return_to', `${url.pathname}${url.search}`);
    return operatorRedirectResponse(loginUrl.toString(), 302);
  }
  const rawCookie = readCookie(request, OPERATOR_SESSION_COOKIE);
  if (!rawCookie) return jsonResponse({ ok: false, code: 'operator_session_cookie_missing' }, 401);
  const redirect = new URL(returnTo.value);
  redirect.searchParams.set('cookie', rawCookie);
  redirect.searchParams.set('principal_id', auth.principal.principal_id);
  if (auth.principal.email) redirect.searchParams.set('email', auth.principal.email);
  return operatorRedirectResponse(redirect.toString(), 302);
}

function microsoftOidcConfig(request, env = {}) {
  const tenantId = String(env.MICROSOFT_OIDC_TENANT_ID ?? '').trim();
  const clientId = String(env.MICROSOFT_OIDC_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.MICROSOFT_OIDC_CLIENT_SECRET ?? '').trim();
  if (!tenantId || !clientId || (!clientSecret && !env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD)) {
    return { ok: false, code: 'microsoft_oidc_not_configured', status: 500 };
  }
  const origin = new URL(request.url).origin;
  const redirectUri = String(env.MICROSOFT_OIDC_REDIRECT_URI ?? `${origin}/auth/microsoft/callback`).trim();
  const issuer = `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/v2.0`;
  return {
    ok: true,
    tenant_id: tenantId,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    issuer,
    authorize_endpoint: `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/oauth2/v2.0/authorize`,
    token_endpoint: String(env.MICROSOFT_OIDC_TOKEN_ENDPOINT ?? `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/oauth2/v2.0/token`),
    jwks_uri: String(env.MICROSOFT_OIDC_JWKS_URI ?? `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/discovery/v2.0/keys`),
  };
}

async function exchangeMicrosoftCodeForTokens(code, codeVerifier, config, env = {}) {
  if (env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD) return { ok: true, id_token: 'fake.microsoft.id_token' };
  const body = new URLSearchParams();
  body.set('client_id', config.client_id);
  body.set('client_secret', config.client_secret);
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', config.redirect_uri);
  body.set('code_verifier', codeVerifier);
  const response = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenBody = await response.json().catch(() => ({}));
  if (!response.ok || !tokenBody.id_token) {
    return { ok: false, code: 'microsoft_token_exchange_failed', status: 502, detail: tokenBody.error ?? response.statusText };
  }
  return { ok: true, id_token: tokenBody.id_token };
}

async function validateMicrosoftIdToken(idToken, nonce, config, env = {}) {
  if (env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD) {
    const claims = typeof env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD === 'string'
      ? JSON.parse(env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD)
      : env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD;
    return validateMicrosoftClaims({ ...claims, nonce: claims.nonce ?? nonce }, nonce, config);
  }
  const parts = String(idToken).split('.');
  if (parts.length !== 3) return { ok: false, code: 'invalid_microsoft_id_token', status: 400 };
  const header = parseJwtPart(parts[0]);
  const claims = parseJwtPart(parts[1]);
  const claimValidation = validateMicrosoftClaims(claims, nonce, config);
  if (!claimValidation.ok) return claimValidation;
  const jwksResponse = await fetch(config.jwks_uri);
  const jwks = await jwksResponse.json().catch(() => ({}));
  const key = (jwks.keys ?? []).find((entry) => entry.kid === header.kid);
  if (!key) return { ok: false, code: 'microsoft_jwks_key_not_found', status: 502 };
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) return { ok: false, code: 'microsoft_id_token_signature_invalid', status: 400 };
  return { ok: true, claims };
}

function validateMicrosoftClaims(claims, nonce, config) {
  if (claims.iss !== config.issuer) return { ok: false, code: 'microsoft_issuer_mismatch', status: 400 };
  if (claims.aud !== config.client_id) return { ok: false, code: 'microsoft_audience_mismatch', status: 400 };
  if (claims.tid !== config.tenant_id) return { ok: false, code: 'microsoft_tenant_mismatch', status: 400 };
  if (claims.nonce !== nonce) return { ok: false, code: 'microsoft_nonce_mismatch', status: 400 };
  if (!claims.oid) return { ok: false, code: 'microsoft_oid_missing', status: 400 };
  if (Number(claims.exp ?? 0) * 1000 <= Date.now()) return { ok: false, code: 'microsoft_id_token_expired', status: 400 };
  return { ok: true, claims };
}

async function createOperatorSessionForMicrosoftPrincipal(claims, env = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_operator_session_db', status: 500 };
  await ensureOperatorSessionSchema(db);
  const sessionId = `operator_session_${randomBase64Url(24)}`;
  const now = new Date();
  const ttl = clampInteger(env.NARADA_OPERATOR_SESSION_TTL_SECONDS, 300, 7 * 24 * 60 * 60, DEFAULT_OPERATOR_SESSION_TTL_SECONDS);
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const principalId = microsoftPrincipalId(claims);
  await db.prepare(`INSERT INTO cloudflare_operator_sessions (
    operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    sessionId,
    principalId,
    'microsoft_oidc',
    claims.iss,
    claims.tid,
    claims.sub ?? null,
    claims.oid,
    claims.preferred_username ?? claims.email ?? null,
    claims.name ?? null,
    now.toISOString(),
    expiresAt,
    null,
  ).run();
  return { ok: true, operator_session_id: sessionId, principal_id: principalId, expires_in: ttl };
}

async function authenticateCarrierApiRequest(request, env = {}) {
  const bearer = authenticateCarrierRequest(request, env);
  if (bearer.ok) return bearer;
  const operator = await authenticateOperatorSessionRequest(request, env);
  if (operator.ok) return operator;
  if (bearer.code === 'auth_not_configured' && operator.code !== 'unauthorized') return operator;
  return bearer.code === 'auth_not_configured' ? bearer : operator;
}

async function authenticateOperatorSessionRequest(request, env = {}) {
  const cookie = await readSignedCookie(request, OPERATOR_SESSION_COOKIE, env);
  if (!cookie.ok) return { ok: false, code: 'unauthorized', status: 401 };
  const sessionId = String(cookie.value.operator_session_id ?? '').trim();
  if (!sessionId) return { ok: false, code: 'unauthorized', status: 401 };
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_operator_session_db', status: 500 };
  await ensureOperatorSessionSchema(db);
  const row = await db.prepare(`SELECT * FROM cloudflare_operator_sessions
    WHERE operator_session_id = ? AND revoked_at IS NULL AND expires_at > ?`).bind(sessionId, new Date().toISOString()).first();
  if (!row) return { ok: false, code: 'unauthorized', status: 401 };
  return {
    ok: true,
    principal: {
      auth_type: row.auth_type,
      principal_id: row.principal_id,
      issuer: row.issuer,
      tenant_id: row.tenant_id,
      subject: row.subject,
      object_id: row.object_id,
      email: row.email,
      name: row.display_name,
      operator_session_id: row.operator_session_id,
      controlled_actions: [],
    },
  };
}

async function ensureOperatorSessionSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_operator_sessions (
    operator_session_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    issuer TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    subject TEXT,
    object_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_operator_sessions_principal_idx ON cloudflare_operator_sessions(principal_id, expires_at)').run();
}

function microsoftPrincipalId(claims = {}) {
  return `microsoft:${claims.tid}:${claims.oid}`;
}

function validatedOperatorPostLoginRedirect(url) {
  const value = url.searchParams.get('return_to');
  if (!value) return null;
  try {
    const redirect = new URL(value, url.origin);
    if (redirect.origin !== url.origin) return null;
    if (redirect.pathname !== '/auth/operator/session-capture') return null;
    if (!validateOperatorCaptureReturnTo(redirect.searchParams.get('return_to')).ok) return null;
    return `${redirect.pathname}${redirect.search}`;
  } catch {
    return null;
  }
}

function validateOperatorCaptureReturnTo(value) {
  if (!value) return { ok: false, code: 'operator_capture_requires_return_to', status: 400 };
  try {
    const url = new URL(value);
    const loopbackHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
    if (url.protocol !== 'http:' || !loopbackHost) return { ok: false, code: 'operator_capture_return_to_must_be_loopback_http', status: 400 };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, code: 'operator_capture_return_to_invalid', status: 400 };
  }
}

export function createCloudflareAiProviderAdapter(env = {}) {
  if (!env.AI || typeof env.AI.run !== 'function') return null;
  const model = env.CLOUDFLARE_CARRIER_AI_MODEL ?? env.AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;
  const timeoutMs = clampInteger(env.CLOUDFLARE_CARRIER_AI_TIMEOUT_MS, 1000, 30000, 15000);
  const maxRetries = clampInteger(env.CLOUDFLARE_CARRIER_AI_MAX_RETRIES, 0, 3, 1);
  const toolEffectConfig = cloudflareToolEffectConfig(env);
  return {
    posture: 'cloudflare-workers-ai',
    adapter_kind: 'cloudflare-workers-ai',
    provider: 'cloudflare-workers-ai',
    model,
    async run({ input, tool_results = [] }) {
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const request = tool_results.length > 0
            ? { messages: createWorkersAiToolResultMessages(input, tool_results) }
            : {
                messages: createWorkersAiInitialMessages(input),
                tools: toolEffectConfig.tool_definitions.map((tool) => ({ ...tool })),
              };
          const result = await withTimeout(env.AI.run(model, request), timeoutMs);
          return {
            text: extractWorkersAiText(result),
            tool_calls: extractWorkersAiToolCalls(result),
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error('cloudflare_workers_ai_provider_failed');
    },
  };
}

function createWorkersAiInitialMessages(input) {
  return [
    {
      role: 'system',
      content: 'You are Narada running inside a Cloudflare carrier. Answer the operator input concisely. Use available tools only when needed; tool effects are carrier-admitted and may be denied.',
    },
    {
      role: 'user',
      content: input.content,
    },
  ];
}

function createWorkersAiToolResultMessages(input, toolResults) {
  return [
    ...createWorkersAiInitialMessages(input),
    {
      role: 'assistant',
      content: 'Tool calls were evaluated by the Cloudflare carrier boundary.',
    },
    {
      role: 'user',
      content: `Carrier tool results:\n${JSON.stringify(toolResults.map((result) => ({
        tool_name: result.tool_name,
        status: result.status,
        admission_action: result.admission_action,
        admission_reason: result.admission_reason,
        capability_ref: result.capability_ref,
        effect_scope: result.effect_scope,
        result_summary: result.result_summary,
        authority_ref: result.authority_ref,
      })))}`,
    },
  ];
}

function cloudflareToolEffectConfig(env = {}) {
  const runtimeReadsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS === true;
  const kvReadsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS === true;
  const kvWritesEnabled = env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES === true;
  const taskToolsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS === true;
  const kvBinding = env.CLOUDFLARE_CARRIER_KV ?? env.NARADA_CARRIER_KV ?? null;
  const taskDb = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  const d1TasksConfigured = taskToolsEnabled && taskDb && typeof taskDb.prepare === 'function';
  const tools = [];
  const capabilities = [];
  const toolDefinitions = [];
  if (runtimeReadsEnabled) {
    tools.push('cloudflare_carrier_runtime_metadata_read');
    capabilities.push({ ...CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_RUNTIME_METADATA_READ_TOOL_DEFINITION);
  }
  if (kvReadsEnabled && kvBinding && typeof kvBinding.get === 'function') {
    tools.push('cloudflare_carrier_kv_get');
    capabilities.push({ ...CLOUDFLARE_KV_GET_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_KV_GET_TOOL_DEFINITION);
  }
  if (kvWritesEnabled && kvBinding && typeof kvBinding.put === 'function') {
    tools.push('cloudflare_carrier_kv_put');
    capabilities.push({ ...CLOUDFLARE_KV_PUT_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_KV_PUT_TOOL_DEFINITION);
  }
  if (d1TasksConfigured) {
    tools.push('cloudflare_carrier_task_create', 'cloudflare_carrier_task_update', 'cloudflare_carrier_task_list');
    capabilities.push(
      { ...CLOUDFLARE_TASK_CREATE_CAPABILITY },
      { ...CLOUDFLARE_TASK_UPDATE_CAPABILITY },
      { ...CLOUDFLARE_TASK_LIST_CAPABILITY },
    );
    toolDefinitions.push(
      CLOUDFLARE_TASK_CREATE_TOOL_DEFINITION,
      CLOUDFLARE_TASK_UPDATE_TOOL_DEFINITION,
      CLOUDFLARE_TASK_LIST_TOOL_DEFINITION,
    );
  }
  return {
    configured: tools.length > 0,
    runtimeReadsEnabled,
    kvReadsEnabled: kvReadsEnabled && Boolean(kvBinding && typeof kvBinding.get === 'function'),
    kvWritesEnabled: kvWritesEnabled && Boolean(kvBinding && typeof kvBinding.put === 'function'),
    taskToolsEnabled: d1TasksConfigured,
    taskDb,
    kvBinding,
    supported_tools: tools,
    capabilities,
    tool_definitions: toolDefinitions,
  };
}

export function createCloudflareToolEffectAdapter(env = {}) {
  const config = cloudflareToolEffectConfig(env);
  if (!config.configured) return null;
  return {
    posture: 'configured',
    adapter_kind: 'cloudflare-tool-effect-boundary',
    supported_tools: [...config.supported_tools],
    capabilities: config.capabilities.map((capability) => ({ ...capability })),
    async execute({ toolCall, context }) {
      const admission = classifyCloudflareToolEffectAdmission(toolCall, config);
      if (admission.action !== 'admit') {
        return {
          status: 'denied',
          admission_action: admission.action,
          admission_reason: admission.reason,
          result_summary: admission.reason,
          result_ref: null,
        };
      }
      const authority = classifyToolEffectAuthority(context.principal, admission.tool_name);
      if (!authority.ok) {
        return {
          status: 'denied',
          admission_action: 'deny',
          admission_reason: 'tool_effect_authority_denied',
          result_summary: 'tool_effect_authority_denied',
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_kv_put') {
        const args = parseToolArguments(toolCall.arguments_summary);
        const key = typeof args.key === 'string' ? args.key.trim() : '';
        const value = typeof args.value === 'string' ? args.value : '';
        if (!key) {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_kv_put_requires_key',
            result_ref: null,
          };
        }
        await config.kvBinding.put(key, value);
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({
            key,
            bytes_written: value.length,
          }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_create') {
        const { decision: siteAuthorityDecision } = classifyCloudflareSiteAuthority(config, context.site_id, SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION);
        if (siteAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
          return {
            status: 'denied',
            admission_action: 'deny',
            admission_reason: 'tool_effect_authority_denied',
            result_summary: JSON.stringify({ reason: 'site_authority_route_denied', site_authority_decision: siteAuthorityDecision }),
            result_ref: null,
          };
        }
        if (!context.taskStore || typeof context.taskStore.create !== 'function') {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_task_store_unavailable',
            result_ref: null,
          };
        }
        const args = parseToolArguments(toolCall.arguments_summary);
        const task = await context.taskStore.create({
          title: args.title,
          description: args.description,
          source: 'cloudflare-carrier-task-effect',
        });
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ task, task_count: (await context.taskStore?.list?.())?.length ?? null, site_authority_decision: siteAuthorityDecision }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_update') {
        const { decision: siteAuthorityDecision } = classifyCloudflareSiteAuthority(config, context.site_id, SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION);
        if (siteAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
          return {
            status: 'denied',
            admission_action: 'deny',
            admission_reason: 'tool_effect_authority_denied',
            result_summary: JSON.stringify({ reason: 'site_authority_route_denied', site_authority_decision: siteAuthorityDecision }),
            result_ref: null,
          };
        }
        if (!context.taskStore || typeof context.taskStore.update !== 'function') {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_task_store_unavailable',
            result_ref: null,
          };
        }
        const args = parseToolArguments(toolCall.arguments_summary);
        const task = await context.taskStore.update({
          task_id: args.task_id,
          status: args.status,
          note: args.note,
        });
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ task, task_count: (await context.taskStore?.list?.())?.length ?? null, site_authority_decision: siteAuthorityDecision }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_list') {
        const tasks = await context.taskStore?.list?.() ?? [];
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_LIST_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_LIST_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ tasks, task_count: tasks.length }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_kv_get') {
        const args = parseToolArguments(toolCall.arguments_summary);
        const key = typeof args.key === 'string' ? args.key.trim() : '';
        if (!key) {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_kv_get_requires_key',
            result_ref: null,
          };
        }
        const value = await config.kvBinding.get(key);
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({
            key,
            found: value !== null && value !== undefined,
            value_preview: value === null || value === undefined ? null : String(value).slice(0, 240),
          }),
          result_ref: null,
        };
      }
      return {
        status: 'ok',
        admission_action: admission.action,
        admission_reason: admission.reason,
        capability_ref: CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF,
        effect_scope: CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE,
        authority_ref: authority.authority_ref,
        result_summary: JSON.stringify({
          carrier_session_id: context.carrier_session_id,
          agent_id: context.agent_id,
          site_id: context.site_id,
          turn_id: context.turn_id,
          worker_runtime: 'cloudflare-workers',
        }),
        result_ref: null,
      };
    },
  };
}

export function createCloudflareD1TaskStoreAdapter(env = {}) {
  const db = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return null;
  return {
    posture: 'cloudflare-d1',
    adapter_kind: 'cloudflare-d1-task-store',
    forSession(context = {}) {
      return createD1SessionTaskStore(db, context);
    },
  };
}

function createD1SessionTaskStore(db, context = {}) {
  const siteId = String(context.site_id ?? 'unknown-site');
  const siteRoot = context.site_root ?? `cloudflare://${siteId}`;
  const now = typeof context.now === 'function' ? context.now : () => new Date().toISOString();
  let initialized = false;
  async function ensureSchema() {
    if (initialized) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS narada_tasks (
      site_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      carrier_session_id TEXT,
      agent_id TEXT,
      site_root TEXT,
      PRIMARY KEY (site_id, task_id)
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS narada_tasks_site_number_idx ON narada_tasks(site_id, task_number)').run();
    initialized = true;
  }
  async function nextTaskNumber() {
    await ensureSchema();
    const row = await db.prepare('SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number FROM narada_tasks WHERE site_id = ?')
      .bind(siteId)
      .first();
    return Number(row?.next_task_number ?? 1);
  }
  return {
    async create({ title, description = null, status = 'open', source = 'carrier' }) {
      const trimmedTitle = String(title ?? '').trim();
      if (!trimmedTitle) throw new Error('cloudflare_task_create_requires_title');
      const taskNumber = await nextTaskNumber();
      const timestamp = now();
      const task = {
        site_id: siteId,
        task_id: `cloudflare-task-${taskNumber}`,
        task_number: taskNumber,
        title: trimmedTitle,
        description: description ? String(description) : null,
        status: String(status ?? 'open'),
        source: String(source ?? 'carrier'),
        note: null,
        created_at: timestamp,
        updated_at: timestamp,
        carrier_session_id: context.carrier_session_id ?? null,
        agent_id: context.agent_id ?? null,
        site_root: siteRoot,
      };
      await ensureSchema();
      await db.prepare(`INSERT INTO narada_tasks (
        site_id, task_id, task_number, title, description, status, source, note,
        created_at, updated_at, carrier_session_id, agent_id, site_root
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        task.site_id,
        task.task_id,
        task.task_number,
        task.title,
        task.description,
        task.status,
        task.source,
        task.note,
        task.created_at,
        task.updated_at,
        task.carrier_session_id,
        task.agent_id,
        task.site_root,
      ).run();
      return publicTask(task);
    },
    async update({ task_id, status = null, note = null }) {
      await ensureSchema();
      const taskId = String(task_id ?? '').trim();
      const existing = await findTask(db, siteId, taskId);
      if (!existing) throw new Error('cloudflare_task_not_found');
      const updated = {
        ...existing,
        status: status ? String(status) : existing.status,
        note: note ? String(note) : existing.note,
        updated_at: now(),
      };
      await db.prepare('UPDATE narada_tasks SET status = ?, note = ?, updated_at = ? WHERE site_id = ? AND task_id = ?')
        .bind(updated.status, updated.note, updated.updated_at, siteId, updated.task_id)
        .run();
      return publicTask(updated);
    },
    async list() {
      await ensureSchema();
      const result = await db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? ORDER BY task_number ASC')
        .bind(siteId)
        .all();
      return (result.results ?? []).map(publicTask);
    },
  };
}

async function findTask(db, siteId, taskIdOrNumber) {
  const byId = await db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_id = ?')
    .bind(siteId, taskIdOrNumber)
    .first();
  if (byId) return byId;
  const numeric = Number(taskIdOrNumber);
  if (!Number.isInteger(numeric)) return null;
  return db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_number = ?')
    .bind(siteId, numeric)
    .first();
}

function publicTask(task) {
  return {
    task_id: String(task.task_id),
    task_number: Number(task.task_number),
    title: String(task.title),
    description: task.description ?? null,
    status: String(task.status),
    source: String(task.source),
    created_at: String(task.created_at),
    updated_at: String(task.updated_at),
    note: task.note ?? null,
    site_id: task.site_id ?? null,
    carrier_session_id: task.carrier_session_id ?? null,
    agent_id: task.agent_id ?? null,
    site_root: task.site_root ?? null,
  };
}

function classifyToolEffectAuthority(principal, toolName) {
  const principalId = String(principal?.principal_id ?? principal?.user_id ?? 'anonymous');
  const controlledActions = Array.isArray(principal?.controlled_actions) ? principal.controlled_actions.map(String) : [];
  const capability = capabilityForTool(toolName);
  const allowed = controlledActions.includes('*')
    || controlledActions.includes(toolName)
    || controlledActions.includes(capability?.capability_ref)
    || controlledActions.includes(capability?.effect_scope);
  return {
    ok: allowed,
    authority_ref: allowed ? `principal:${principalId}` : null,
  };
}

function capabilityForTool(toolName) {
  if (toolName === 'cloudflare_carrier_runtime_metadata_read') return CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY;
  if (toolName === 'cloudflare_carrier_kv_get') return CLOUDFLARE_KV_GET_CAPABILITY;
  if (toolName === 'cloudflare_carrier_kv_put') return CLOUDFLARE_KV_PUT_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_create') return CLOUDFLARE_TASK_CREATE_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_update') return CLOUDFLARE_TASK_UPDATE_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_list') return CLOUDFLARE_TASK_LIST_CAPABILITY;
  return null;
}

export function classifyCloudflareToolEffectAdmission(toolCall = {}, state = {}) {
  const toolName = String(toolCall?.tool_name ?? toolCall?.name ?? '').trim();
  const supportedTools = Array.isArray(state.supportedTools)
    ? state.supportedTools
    : Array.isArray(state.supported_tools)
    ? state.supported_tools
    : state.runtimeReadsEnabled
      ? ['cloudflare_carrier_runtime_metadata_read']
      : [];
  const writesTask = toolName === 'cloudflare_carrier_task_create' || toolName === 'cloudflare_carrier_task_update';
  const writesKv = toolName === 'cloudflare_carrier_kv_put';
  return classifyToolEffectAdmission(toolCall, {
    adapterConfigured: state.adapterConfigured ?? state.configured ?? state.runtimeReadsEnabled ?? false,
    admissionRequired: state.admissionRequired === true,
    supportedTools,
    admitReason: writesKv || writesTask ? 'write_tool_effect_admitted' : 'read_only_tool_effect_admitted',
  });
}

function parseToolArguments(argumentsSummary) {
  if (typeof argumentsSummary !== 'string') return {};
  try {
    const parsed = JSON.parse(argumentsSummary);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function authenticateCarrierRequest(request, env = {}) {
  const configured = Boolean(env.SERVICE_TOKEN || env.ADMIN_BEARER_TOKEN || env.CLOUDFLARE_CARRIER_SERVICE_TOKEN || env.CLOUDFLARE_CARRIER_ADMIN_TOKEN);
  if (!configured) return { ok: false, code: 'auth_not_configured', status: 500 };

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, code: 'unauthorized', status: 401 };

  if (token === (env.CLOUDFLARE_CARRIER_SERVICE_TOKEN ?? env.SERVICE_TOKEN)) {
    return {
      ok: true,
      principal: {
        auth_type: 'service',
        principal_id: 'service',
        controlled_actions: ['*'],
      },
    };
  }

  if (token === (env.CLOUDFLARE_CARRIER_ADMIN_TOKEN ?? env.ADMIN_BEARER_TOKEN)) {
    return {
      ok: true,
      principal: {
        auth_type: 'user',
        principal_id: 'admin',
        user_id: 'admin',
        email: 'admin@system',
        name: 'Administrator',
        roles: [1],
        controlled_actions: ['*'],
      },
    };
  }

  return { ok: false, code: 'unauthorized', status: 401 };
}

export function classifyCloudflareOperationCommandState(input = {}) {
  const operationId = String(input.operation_id || '').trim();
  const isActive = input.is_active === true || input.active === 'yes';
  const scopeLoaded = input.scope_loaded === true || input.scope_loaded === 'yes';
  const sessionCount = Number(input.session_count ?? input.sessions ?? 0) || 0;
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const pathAction = String(input.operation_path_next_action || input.command_action || 'read_operation_scope');
  const commandState = pathAction === 'inspect_attention' ? 'attention_required'
    : pathAction === 'inspect_open_task' ? 'task_work_open'
    : pathAction === 'inspect_operation_evidence' ? 'evidence_ready'
    : pathAction === 'read_operation_evidence' ? 'evidence_needed'
    : pathAction === 'start_or_select_session' ? 'session_needed'
    : pathAction === 'read_operation_scope' ? 'scope_needed'
    : 'operation_focus_needed';
  const nextAction = !operationId ? 'select_or_create_operation'
    : !isActive ? 'use_focused_operation'
    : !scopeLoaded ? 'read_operation_scope'
    : sessionCount === 0 ? 'start_or_select_session'
    : evidenceLoaded ? 'inspect_operation_evidence' : 'read_operation_evidence';
  return {
    command_state: commandState,
    command_action: pathAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareAuthorityCommandState(input = {}) {
  const decisionCount = Number(input.decision_count ?? input.decisions ?? 0) || 0;
  const refusalCount = Number(input.refusal_count ?? input.refusals ?? 0) || 0;
  const unresolvedLocusCount = Number(input.unresolved_locus_count ?? input.unresolved_locus ?? 0) || 0;
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const nextAction = decisionCount === 0 ? 'read_site_authority'
    : refusalCount > 0 ? 'inspect_refused_authority'
    : unresolvedLocusCount > 0 ? 'resolve_authority_locus'
    : evidenceLoaded ? 'monitor_authority_admissions' : 'focus_authority_evidence';
  const commandState = nextAction === 'read_site_authority' ? 'authority_needed'
    : nextAction === 'inspect_refused_authority' ? 'refusal_requires_review'
    : nextAction === 'resolve_authority_locus' ? 'locus_unresolved'
    : nextAction === 'focus_authority_evidence' ? 'evidence_needed'
    : 'admissions_monitoring';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareSessionCommandState(input = {}) {
  const sessionId = String(input.session_id || '').trim();
  const isActive = input.is_active === true || input.active === 'yes';
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const nextAction = !sessionId ? 'select_or_start_session'
    : !isActive ? 'use_focused_session'
    : evidenceLoaded ? 'inspect_session_evidence' : 'read_session_evidence';
  const commandState = nextAction === 'select_or_start_session' ? 'session_needed'
    : nextAction === 'use_focused_session' ? 'session_focus_needed'
    : nextAction === 'read_session_evidence' ? 'evidence_needed'
    : 'evidence_ready';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareTaskCommandState(input = {}) {
  const taskId = String(input.task_id || '').trim();
  const status = String(input.status || input.lifecycle || '').toLowerCase();
  const lifecycle = ['open', 'todo', 'pending'].includes(status) ? 'open'
    : ['done', 'resolved', 'closed'].includes(status) ? 'closed'
    : status || 'unknown';
  const evidenceCount = Number(input.evidence_count ?? input.evidence_events ?? 0) || 0;
  const nextAction = !taskId ? 'select_task'
    : lifecycle === 'open' ? 'mark_done_or_update'
    : lifecycle === 'closed' ? 'reopen_or_inspect_evidence'
    : 'normalize_status_or_update';
  const commandState = nextAction === 'select_task' ? 'task_needed'
    : nextAction === 'mark_done_or_update' ? 'task_work_open'
    : nextAction === 'reopen_or_inspect_evidence' ? (evidenceCount > 0 ? 'evidence_ready' : 'evidence_needed')
    : 'status_needs_normalization';
  return {
    lifecycle,
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareEvidenceCommandState(event = {}, options = {}) {
  const kind = event.event_kind || '';
  const payload = event.payload || {};
  const siteAuthority = payload.site_authority_decision || {};
  const parsedTaskId = options.parsed_task_id || null;
  const taskId = payload.task_id || payload.task?.task_id || parsedTaskId || null;
  const lane = kind.includes('failed') || kind.includes('rejected') || payload.status === 'failed' || payload.admission_action === 'deny' || payload.action === 'refuse' ? 'failures'
    : kind.startsWith('directive_') || payload.directive_kind || payload.directive_id ? 'directives'
    : kind.includes('authority') || payload.site_authority_decision || payload.authority_ref ? 'authority'
    : kind.includes('tool') || payload.tool_name || payload.capability_ref || payload.effect_scope ? 'tools'
    : kind.startsWith('provider_') || kind.startsWith('turn_') || payload.provider || payload.provider_adapter_kind ? 'provider'
    : kind.includes('input') || kind === 'carrier_command_executed' || kind === 'carrier_session_started' ? 'input'
    : 'other';
  const targetType = taskId ? 'task'
    : payload.directive_id ? 'attention'
    : siteAuthority.action || payload.authority_ref ? 'authority'
    : payload.tool_name || payload.capability_ref ? 'tool_effect'
    : event.carrier_session_id ? 'session'
    : 'evidence';
  const targetRef = taskId
    || payload.directive_id
    || siteAuthority.mutation_class
    || payload.tool_name
    || event.carrier_session_id
    || event.event_kind
    || 'none';
  const nextAction = lane === 'failures' ? 'inspect_failure_and_retry_or_escalate'
    : lane === 'authority' ? 'inspect_authority_locus'
    : lane === 'tools' ? (payload.status === 'failed' ? 'inspect_tool_failure' : 'inspect_tool_effect')
    : lane === 'directives' ? 'resolve_or_acknowledge_directive'
    : lane === 'provider' ? 'inspect_provider_turn'
    : lane === 'input' ? 'trace_input_lifecycle'
    : 'inspect_evidence_payload';
  const commandState = lane === 'failures' ? 'failure_requires_review'
    : lane === 'authority' ? 'authority_locus_review'
    : lane === 'tools' ? (payload.status === 'failed' ? 'tool_failure_review' : 'tool_effect_review')
    : lane === 'directives' ? 'directive_requires_resolution'
    : lane === 'provider' ? 'provider_turn_review'
    : lane === 'input' ? 'input_lifecycle_trace'
    : 'payload_review';
  return {
    lane,
    target_type: targetType,
    target_ref: targetRef,
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareSiteCommandState(input = {}) {
  const siteId = String(input.site_id || '').trim();
  const scopeLoaded = input.scope_loaded === true || input.scope_loaded === 'yes';
  const membershipCount = Number(input.membership_count ?? input.memberships ?? 0) || 0;
  const operationCount = Number(input.operation_count ?? input.operations ?? 0) || 0;
  const authorityCount = Number(input.authority_count ?? input.authority_items ?? 0) || 0;
  const nextAction = !siteId ? 'select_site'
    : !scopeLoaded ? 'read_site_scope'
    : membershipCount === 0 ? 'load_or_create_membership'
    : operationCount === 0 ? 'create_or_select_operation'
    : authorityCount === 0 ? 'read_site_authority'
    : 'inspect_site_operations';
  const commandState = nextAction === 'select_site' ? 'site_needed'
    : nextAction === 'read_site_scope' ? 'scope_needed'
    : nextAction === 'load_or_create_membership' ? 'membership_needed'
    : nextAction === 'create_or_select_operation' ? 'operation_needed'
    : nextAction === 'read_site_authority' ? 'authority_needed'
    : 'site_operations_ready';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareMembershipCommandState(input = {}) {
  const principal = String(input.principal || input.principal_id || input.email || '').trim();
  const siteLoaded = input.site_loaded === true || input.site_loaded === 'yes';
  const known = input.known === true || input.known_membership === true || input.known_membership === 'yes';
  const status = String(input.status || 'unknown').toLowerCase();
  const authorityLoaded = input.authority_loaded === true || input.authority_loaded === 'yes';
  const nextAction = !principal ? 'enter_principal'
    : !siteLoaded ? 'read_membership_site'
    : !known ? 'put_membership'
    : status !== 'active' ? 'inspect_inactive_membership'
    : !authorityLoaded ? 'focus_membership_authority'
    : 'monitor_membership_authority';
  const commandState = nextAction === 'enter_principal' ? 'principal_needed'
    : nextAction === 'read_membership_site' ? 'site_scope_needed'
    : nextAction === 'put_membership' ? 'membership_write_needed'
    : nextAction === 'inspect_inactive_membership' ? 'membership_inactive'
    : nextAction === 'focus_membership_authority' ? 'authority_needed'
    : 'membership_authority_monitoring';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

function mutatesSession(operation) {
  return [
    'session.start',
    'directive.emit',
    'directive.heartbeat.emit',
    'carrier.input.deliver',
    'carrier.command.execute',
    'carrier.interrupt',
    'session.close',
  ].includes(operation);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function operatorRedirectResponse(location, status = 302, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const cookie of cookies.filter(Boolean)) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

async function signedCookie(name, value, env = {}, { maxAge = 300 } = {}) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await hmacBase64Url(payload, operatorSessionSecret(env));
  return `${name}=${payload}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function readSignedCookie(request, name, env = {}) {
  const raw = readCookie(request, name);
  if (!raw) return { ok: false, code: 'missing_signed_cookie', status: 401 };
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return { ok: false, code: 'invalid_signed_cookie', status: 401 };
  const secret = optionalOperatorSessionSecret(env);
  if (!secret) return { ok: false, code: 'operator_session_secret_not_configured', status: 500 };
  const expected = await hmacBase64Url(payload, secret);
  if (!timingSafeEqual(signature, expected)) return { ok: false, code: 'invalid_signed_cookie_signature', status: 401 };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) };
  } catch {
    return { ok: false, code: 'invalid_signed_cookie_payload', status: 401 };
  }
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function operatorSessionSecret(env = {}) {
  const secret = optionalOperatorSessionSecret(env);
  if (!secret) throw new Error('operator_session_secret_not_configured');
  return secret;
}

function optionalOperatorSessionSecret(env = {}) {
  return String(env.NARADA_OPERATOR_SESSION_SECRET ?? env.SERVICE_TOKEN ?? env.ADMIN_BEARER_TOKEN ?? '').trim();
}

async function hmacBase64Url(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function parseJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

function base64UrlToBytes(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function renderCloudflareCarrierConsole() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Cloudflare Carrier</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f5ef; color: #1e2024; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #fbfaf6 0%, #eef2f1 100%); }
    header { padding: 24px clamp(16px, 4vw, 48px) 12px; border-bottom: 1px solid #d7d7ce; background: rgba(255,255,255,.74); backdrop-filter: blur(10px); }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    header p { margin: 6px 0 0; color: #5c626b; font-size: 14px; }
    main { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; padding: 16px clamp(16px, 4vw, 48px) 32px; }
    section, aside { background: rgba(255,255,255,.86); border: 1px solid #d7d7ce; border-radius: 8px; }
    aside { padding: 16px; align-self: start; }
    section { min-height: calc(100vh - 150px); display: grid; grid-template-rows: auto minmax(220px, 1fr) auto; overflow: hidden; }
    label { display: block; margin: 0 0 12px; font-size: 12px; font-weight: 700; color: #343941; }
    input, select, textarea { width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid #c5c7bf; border-radius: 6px; background: #fff; color: #1e2024; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 8px 12px; border: 1px solid #1f6f62; border-radius: 6px; background: #1f6f62; color: #fff; font-weight: 700; cursor: pointer; }
    button.secondary { background: #fff; color: #1f6f62; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .status { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
    .metric { border: 1px solid #d7d7ce; border-radius: 6px; padding: 10px; background: #faf9f4; min-width: 0; }
    .metric b { display: block; font-size: 11px; color: #686d75; }
    .metric span { display: block; margin-top: 4px; overflow-wrap: anywhere; }
    .control-room { margin-top: 16px; border: 1px solid #cfd7d2; border-radius: 8px; padding: 12px; background: #f5faf7; }
    .control-room h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; color: #1f4e48; }
    .control-room-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .control-room-item { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 8px; background: #fff; }
    .control-room-item b { display: block; font-size: 11px; color: #686d75; }
    .control-room-item span { display: block; margin-top: 4px; font-size: 12px; color: #1e2024; overflow-wrap: anywhere; }
    .attention-items { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .attention-item, .authority-decision, .operation-item, .session-item, .membership-item, .continuity-item, .shadow-read-item { border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .attention-item strong, .authority-decision strong, .operation-item strong, .session-item strong, .membership-item strong, .continuity-item strong, .shadow-read-item strong { display: block; font-size: 13px; color: #1f4e48; overflow-wrap: anywhere; }
    .attention-item span, .authority-decision span, .operation-item span, .session-item span, .membership-item span, .continuity-item span, .shadow-read-item span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .authority-decision.refuse strong { color: #9b3b22; }
    .authority-decision.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .operation-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .session-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .attention-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .membership-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .continuity-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .shadow-read-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .task-panel { margin-top: 16px; border-top: 1px solid #d7d7ce; padding-top: 14px; }
    .task-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .tasks { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .task { border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .task.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .task strong { display: block; font-size: 13px; color: #1f4e48; overflow-wrap: anywhere; }
    .task span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .product-panel { margin-top: 16px; border-top: 1px solid #d7d7ce; padding-top: 14px; }
    .product-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #faf9f4; }
    .overview-block { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 10px; background: #fff; }
    .overview-block h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0; color: #1f4e48; }
    .overview-block ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .overview-block li { font-size: 12px; color: #343941; overflow-wrap: anywhere; }
    .overview-block b { color: #686d75; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; }
    .toolbar h2 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .event-filters { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr); gap: 8px; width: min(420px, 100%); }
    .event-filters label { margin: 0; }
    .evidence-lanes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #faf9f4; }
    .evidence-lane { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .evidence-lane.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .evidence-lane strong { display: block; font-size: 12px; color: #1f4e48; overflow-wrap: anywhere; }
    .evidence-lane span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .events { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
    .evidence-focus { padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #fff; }
    .evidence-focus h3 { margin: 0 0 6px; font-size: 13px; color: #1f4e48; letter-spacing: 0; }
    .evidence-focus span { display: block; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .evidence-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .evidence-field { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 8px; background: #faf9f4; }
    .evidence-field b { display: block; font-size: 11px; color: #686d75; }
    .evidence-field span { margin-top: 4px; color: #1e2024; }
    .evidence-focus pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: #343941; }
    .event { border: 1px solid #d9dcd3; border-radius: 8px; padding: 10px; background: #fff; cursor: pointer; }
    .event.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .event strong { display: block; color: #1f4e48; font-size: 13px; overflow-wrap: anywhere; }
    .event span { display: block; margin-top: 4px; color: #686d75; font-size: 12px; overflow-wrap: anywhere; }
    .event pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: #343941; }
    .composer { padding: 12px 14px; border-top: 1px solid #d7d7ce; }
    .error { margin-top: 12px; color: #a5361f; font-size: 13px; overflow-wrap: anywhere; }
    .empty { color: #686d75; font-size: 14px; padding: 24px 4px; }
    @media (max-width: 840px) { main { grid-template-columns: 1fr; } section { min-height: 560px; } .evidence-lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <header>
    <h1>Narada Cloudflare Carrier</h1>
    <p>Authenticated operator console for Worker-hosted Operations, sessions, tasks, evidence, and authority decisions.</p>
  </header>
  <main>
    <aside>
      <label>Service token<input id="token" type="password" autocomplete="current-password" placeholder="Optional when signed in"></label>
      <label>Session ID<input id="sessionId" value="narada-cloudflare-console"></label>
      <label>Operation Sessions<select id="operationSessionSelect"><option value="">No operation sessions loaded</option></select></label>
      <label>Agent ID<input id="agentId" value="narada.cloudflare.agent"></label>
      <label>Site ID<input id="siteId" value="site_narada_cloudflare"></label>
      <label>Operation ID<input id="operationId" value="operation_narada_cloudflare_control"></label>
      <div class="actions">
        <button id="signInMicrosoft" class="secondary">Sign in with Microsoft</button>
        <button id="useSelectedSession" class="secondary">Use Session</button>
        <button id="readSessionEvidence" class="secondary">Read Session Evidence</button>
        <button id="start">Start / Resume</button>
        <button id="refresh" class="secondary">Refresh</button>
        <button id="readOperation" class="secondary">Read Operation</button>
        <button id="readSite" class="secondary">Read Site</button>
        <button id="autoRefreshOperation" class="secondary" aria-pressed="false">Auto Refresh</button>
      </div>
      <div class="status">
        <div class="metric"><b>Site</b><span id="siteStatus">unknown</span></div>
        <div class="metric"><b>Operation</b><span id="operationStatus">unknown</span></div>
        <div class="metric"><b>Active Session</b><span id="activeSession">none</span></div>
        <div class="metric"><b>Role</b><span id="membershipRole">unknown</span></div>
        <div class="metric"><b>Sessions</b><span id="sessionCount">0</span></div>
        <div class="metric"><b>Tasks</b><span id="taskCount">0</span></div>
        <div class="metric"><b>Evidence</b><span id="evidenceCount">0</span></div>
        <div class="metric"><b>Authority</b><span id="authorityCount">0</span></div>
        <div class="metric"><b>Continuity</b><span id="continuityCount">0</span></div>
        <div class="metric"><b>Provider</b><span id="provider">unknown</span></div>
        <div class="metric"><b>Effects</b><span id="effects">unknown</span></div>
        <div class="metric"><b>Events</b><span id="eventCount">0</span></div>
        <div class="metric"><b>Cursor</b><span id="cursor">0</span></div>
      </div>
      <div class="product-panel">
        <h2>Active Session Detail</h2>
        <div id="activeSessionDetail" class="evidence-summary"><div class="empty">No active session loaded.</div></div>
      </div>
      <div class="control-room">
        <h2>Control Room</h2>
        <div class="control-room-grid">
          <div class="control-room-item"><b>Operation</b><span id="controlOperation">none</span></div>
          <div class="control-room-item"><b>Product Scope</b><span id="controlProductScope">not loaded</span></div>
          <div class="control-room-item"><b>Operation Focus</b><span id="controlOperationFocus">none</span></div>
          <div class="control-room-item"><b>Selected Session</b><span id="controlSession">none</span></div>
          <div class="control-room-item"><b>Session Focus</b><span id="controlSessionFocus">none</span></div>
          <div class="control-room-item"><b>Authority Locus</b><span id="controlAuthorityLocus">unknown</span></div>
          <div class="control-room-item"><b>Authority Focus</b><span id="controlAuthorityFocus">none</span></div>
          <div class="control-room-item"><b>Operator</b><span id="controlOperator">anonymous</span></div>
          <div class="control-room-item"><b>Task Focus</b><span id="controlTaskFocus">none</span></div>
          <div class="control-room-item"><b>Attention</b><span id="controlAttention">0 open</span></div>
          <div class="control-room-item"><b>Evidence Focus</b><span id="controlEvidenceFocus">none</span></div>
          <div class="control-room-item"><b>Evidence Window</b><span id="controlEvidenceWindow">0 events</span></div>
          <div class="control-room-item"><b>Continuity</b><span id="controlContinuity">unknown</span></div>
          <div class="control-room-item"><b>Workbench Readiness</b><span id="controlWorkbenchReadiness">not loaded</span></div>
        </div>
        <h3>Control Room Action</h3>
        <div id="controlRoomActionSummary" class="evidence-summary"><div class="empty">No control room action loaded.</div></div>
        <div class="actions"><button id="controlRoomNextAction" class="secondary">Apply Control Room Next Action</button></div>
      </div>
      <div class="product-panel">
        <h2>Operator Route</h2>
        <div class="actions"><button id="operatorRouteNextAction" class="secondary">Focus Route Next Action</button></div>
        <div id="operatorRoute" class="attention-items"><div class="empty">No operator route loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Workbench Readiness Gate</h2>
        <div class="actions"><button id="workbenchReadinessNextAction" class="secondary">Focus Readiness Gap</button></div>
        <div id="workbenchReadinessGate" class="attention-items"><div class="empty">No workbench readiness loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Product Scope</h2>
        <div id="productScopeDetail" class="evidence-summary"><div class="empty">No product scope loaded.</div></div>
        <div class="actions">
          <button id="readOperationScope" class="secondary">Read Operation Scope</button>
          <button id="readSiteScope" class="secondary">Read Site Scope</button>
        </div>
      </div>
      <div class="product-panel">
        <h2>Operation Flight Deck</h2>
        <div id="operationFlightDeck" class="evidence-summary"><div class="empty">No operation product loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Continuity Workflow</h2>
        <div class="actions"><button id="continuityWorkflowNextAction" class="secondary">Focus Next Workflow Step</button></div>
        <div id="continuityWorkflow" class="attention-items"><div class="empty">No continuity workflow loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Runtime Posture</h2>
        <div id="runtimePostureDetail" class="evidence-summary"><div class="empty">No runtime status loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operator Identity</h2>
        <div id="operatorIdentity" class="evidence-summary"><div class="empty">No operator session loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operation Navigator</h2>
        <label>Create Operation ID
          <input id="newOperationId" value="operation_control" autocomplete="off">
        </label>
        <label>Create Operation Display Name
          <input id="newOperationDisplayName" value="Control Operation" autocomplete="off">
        </label>
        <label>Create Operation Kind
          <input id="newOperationKind" value="cloudflare_control" autocomplete="off">
        </label>
        <div class="actions"><button id="createOperation" class="secondary">Create Operation</button></div>
        <div id="operationNavigator" class="attention-items"><div class="empty">No site operations loaded.</div></div>
        <h3>Operation Work Queue</h3>
        <div id="operationWorkQueue" class="attention-items"><div class="empty">No operation work loaded.</div></div>
        <h3>Operation Action</h3>
        <div id="operationActionSummary" class="evidence-summary"><div class="empty">No operation action loaded.</div></div>
        <div class="actions">
          <button id="operationActionUseOperation" class="secondary">Use Focused Operation</button>
          <button id="operationActionReadOperation" class="secondary">Read Focused Operation</button>
          <button id="operationActionFocusSession" class="secondary">Focus Operation Session</button>
        </div>
        <h3>Operation Focus Detail</h3>
        <div id="operationFocusDetail" class="evidence-summary"><div class="empty">No operation selected.</div></div>
        <h3>Operation Path</h3>
        <div class="actions">
          <button id="focusOperationPathSession" class="secondary">Focus Session</button>
          <button id="focusOperationPathTask" class="secondary">Focus Task</button>
          <button id="focusOperationPathAttention" class="secondary">Focus Attention</button>
          <button id="focusOperationPathAuthority" class="secondary">Focus Authority</button>
          <button id="focusOperationPathEvidence" class="secondary">Focus Evidence</button>
        </div>
        <div id="operationPath" class="evidence-summary"><div class="empty">No operation path loaded.</div></div>
        <h3>Operation Surface</h3>
        <div id="operationSurfaceDetail" class="evidence-summary"><div class="empty">No operation surface loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Session Navigator</h2>
        <div id="sessionNavigator" class="attention-items"><div class="empty">No operation sessions loaded.</div></div>
        <h3>Session Work Queue</h3>
        <div id="sessionWorkQueue" class="attention-items"><div class="empty">No session work loaded.</div></div>
        <h3>Session Action</h3>
        <div id="sessionActionSummary" class="evidence-summary"><div class="empty">No session action loaded.</div></div>
        <div class="actions">
          <button id="sessionActionUseSession" class="secondary">Use Focused Session</button>
          <button id="sessionActionReadEvidence" class="secondary">Read Focused Evidence</button>
          <button id="sessionActionFocusEvidence" class="secondary">Focus Session Evidence</button>
        </div>
        <h3>Session Focus Detail</h3>
        <div id="sessionFocusDetail" class="evidence-summary"><div class="empty">No session selected.</div></div>
        <h3>Session Evidence Path</h3>
        <div class="actions">
          <button id="focusSessionPathEvidence" class="secondary">Focus Evidence</button>
          <button id="focusSessionPathTask" class="secondary">Focus Task</button>
          <button id="focusSessionPathDelivery" class="secondary">Focus Delivery</button>
          <button id="focusSessionPathChain" class="secondary">Focus Chain</button>
        </div>
        <div id="sessionEvidencePath" class="evidence-summary"><div class="empty">No session evidence path loaded.</div></div>
        <h3>Session Evidence Control</h3>
        <div id="sessionEvidenceControl" class="evidence-summary"><div class="empty">No session evidence control loaded.</div></div>
        <div class="actions">
          <button id="sessionEvidenceApplyAction" class="secondary">Apply Session Evidence Action</button>
          <button id="sessionEvidenceFocusAction" class="secondary">Focus Session Evidence</button>
          <button id="sessionEvidenceTaskAction" class="secondary">Focus Session Task</button>
        </div>
      </div>
      <div class="product-panel">
        <div class="actions">
          <button id="raiseAttention" class="secondary">Raise Attention</button>
          <button id="taskFromAttention" class="secondary">Task From Attention</button>
          <button id="resolveAttention" class="secondary">Resolve Attention</button>
        </div>
        <h3>Attention Focus Detail</h3>
        <div id="attentionFocusDetail" class="evidence-summary"><div class="empty">No attention item selected.</div></div>
        <div id="attentionQueue" class="attention-items"><div class="empty">No operation attention loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Last Authority</h2>
        <div id="lastAuthority" class="task"><strong>No authority action loaded.</strong><span>Read Site or Put Membership to inspect evidence.</span></div>
      </div>
      <div class="product-panel">
        <h2>Authority State</h2>
        <div id="authorityPostureSummary" class="evidence-summary"><div class="empty">No authority posture loaded.</div></div>
        <h3>Authority Action</h3>
        <div id="authorityActionSummary" class="evidence-summary"><div class="empty">No authority action loaded.</div></div>
        <div class="actions">
          <button id="authorityNextAction" class="secondary">Apply Authority Next Action</button>
          <button id="authorityReadSiteAction" class="secondary">Read Site Authority</button>
          <button id="authorityActionEvidenceAction" class="secondary">Focus Authority Evidence</button>
        </div>
        <h3>Authority Path</h3>
        <div class="actions">
          <button id="authorityPathFocusDecision" class="secondary">Focus Decision</button>
          <button id="authorityPathFocusEvidence" class="secondary">Focus Authority Evidence</button>
          <button id="authorityPathRefresh" class="secondary">Refresh Authority</button>
        </div>
        <div id="authorityPath" class="evidence-summary"><div class="empty">No authority path loaded.</div></div>
        <h3>Authority Decision Control</h3>
        <div id="authorityDecisionControl" class="evidence-summary"><div class="empty">No authority decision control loaded.</div></div>
        <div class="actions">
          <button id="authorityDecisionApplyAction" class="secondary">Apply Decision Review</button>
          <button id="authorityDecisionEvidenceAction" class="secondary">Focus Decision Evidence</button>
          <button id="authorityDecisionRefreshAction" class="secondary">Refresh Decision Authority</button>
        </div>
        <h3>Authority Decision Queue</h3>
        <div id="authorityDecisionQueue" class="attention-items"><div class="empty">No authority decisions loaded.</div></div>
        <div id="authorityState" class="attention-items"><div class="empty">No authority state loaded.</div></div>
        <div id="authorityFocusDetail" class="evidence-summary"><div class="empty">No authority decision selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Site Product</h2>
        <h3>Sites Overview</h3>
        <div id="sitesOverview" class="evidence-summary"><div class="empty">No sites loaded.</div></div>
        <div id="sitesStatusList" class="attention-items"><div class="empty">No site statuses loaded.</div></div>
        <div class="actions">
          <button id="readSites" class="secondary">Read Sites</button>
          <button id="sitesOverviewNextAction" class="secondary">Focus Next Site</button>
        </div>
        <h3>Site Action</h3>
        <div id="siteActionSummary" class="evidence-summary"><div class="empty">No site action loaded.</div></div>
        <div class="actions">
          <button id="siteActionReadSite" class="secondary">Read Site Scope</button>
          <button id="siteActionFocusOperation" class="secondary">Focus Site Operation</button>
          <button id="siteActionFocusMembership" class="secondary">Focus Membership</button>
        </div>
        <h3>Site Focus Detail</h3>
        <div id="siteFocusDetail" class="evidence-summary"><div class="empty">No site loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Site Continuity</h2>
        <div id="continuityNavigator" class="attention-items"><div class="empty">No continuity loaded.</div></div>
        <h3>Continuity Focus Detail</h3>
        <div id="continuityFocusDetail" class="evidence-summary"><div class="empty">No continuity item selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Shadow Read</h2>
        <div id="webhookDelayShadowNavigator" class="attention-items"><div class="empty">No webhook delay shadow reads loaded.</div></div>
        <h3>Shadow Read Focus Detail</h3>
        <div id="webhookDelayShadowFocusDetail" class="evidence-summary"><div class="empty">No webhook delay shadow read selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Directive Intent</h2>
        <div class="actions"><button id="taskFromDirectiveIntent" class="secondary">Task From Directive Intent</button></div>
        <div id="webhookDelayDirectiveNavigator" class="attention-items"><div class="empty">No webhook delay directive records loaded.</div></div>
        <h3>Directive Intent Focus Detail</h3>
        <div id="webhookDelayDirectiveFocusDetail" class="evidence-summary"><div class="empty">No webhook delay directive record selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Directive Delivery</h2>
        <div id="webhookDelayDirectiveDeliveryNavigator" class="attention-items"><div class="empty">No webhook delay directive deliveries loaded.</div></div>
        <h3>Directive Delivery Focus Detail</h3>
        <div id="webhookDelayDirectiveDeliveryFocusDetail" class="evidence-summary"><div class="empty">No webhook delay directive delivery selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Evidence Chain</h2>
        <div class="actions">
          <button id="focusWebhookDelayChainObservation" class="secondary">Focus Observation</button>
          <button id="focusWebhookDelayChainIntent" class="secondary">Focus Intent</button>
          <button id="focusWebhookDelayChainDelivery" class="secondary">Focus Delivery</button>
          <button id="focusWebhookDelayChainSession" class="secondary">Focus Session</button>
          <button id="focusWebhookDelayChainTask" class="secondary">Focus Task</button>
        </div>
        <div id="webhookDelayEvidenceChain" class="evidence-summary"><div class="empty">No webhook delay evidence chain loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Resident Loop Shadow Read</h2>
        <div id="residentLoopShadowNavigator" class="attention-items"><div class="empty">No resident loop shadow reads loaded.</div></div>
        <h3>Resident Loop Focus Detail</h3>
        <div id="residentLoopShadowFocusDetail" class="evidence-summary"><div class="empty">No resident loop shadow read selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Resident Dispatch</h2>
        <div class="actions"><button id="startResidentDispatch" class="secondary">Start Resident Dispatch</button></div>
        <div id="residentDispatchNavigator" class="attention-items"><div class="empty">No resident dispatch decisions loaded.</div></div>
        <h3>Resident Dispatch Focus Detail</h3>
        <div id="residentDispatchFocusDetail" class="evidence-summary"><div class="empty">No resident dispatch decision selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Site Membership</h2>
        <label>Principal ID<input id="memberPrincipalId" placeholder="microsoft:tenant:object-id"></label>
        <label>Role<input id="memberRole" value="viewer"></label>
        <div class="actions"><button id="putMembership" class="secondary">Put Membership</button></div>
        <h3>Membership Action</h3>
        <div id="membershipActionSummary" class="evidence-summary"><div class="empty">No membership action loaded.</div></div>
        <div class="actions">
          <button id="membershipActionPut" class="secondary">Put Focused Membership</button>
          <button id="membershipActionReadSite" class="secondary">Read Membership Site</button>
          <button id="membershipActionFocusAuthority" class="secondary">Focus Membership Authority</button>
        </div>
        <h3>Membership Navigator</h3>
        <div id="membershipNavigator" class="attention-items"><div class="empty">No memberships loaded.</div></div>
        <h3>Membership Focus Detail</h3>
        <div id="membershipFocusDetail" class="evidence-summary"><div class="empty">No membership selected.</div></div>
      </div>
      <div class="task-panel">
        <h2>Task State</h2>
        <label>New task<input id="taskTitle" placeholder="Task title"></label>
        <div class="actions"><button id="createTask" class="secondary">Create Task</button></div>
        <label>Task ID<input id="updateTaskId" placeholder="cloudflare-task-1"></label>
        <label>Status<input id="updateTaskStatus" value="done"></label>
        <label>Note<input id="updateTaskNote" placeholder="Update note"></label>
        <h3>Task Command Preview</h3>
        <div id="taskCommandPreview" class="evidence-summary"><div class="empty">No task command prepared.</div></div>
        <div class="actions">
          <button id="focusTaskEvidence" class="secondary">Focus Task Evidence</button>
          <button id="markTaskOpen" class="secondary">Mark Open</button>
          <button id="markTaskDone" class="secondary">Mark Done</button>
          <button id="updateTask" class="secondary">Update Task</button>
        </div>
        <h3>Task Lifecycle Summary</h3>
        <div id="taskLifecycleSummary" class="evidence-summary"><div class="empty">No task lifecycle loaded.</div></div>
        <h3>Task Lifecycle Control</h3>
        <div id="taskLifecycleControl" class="evidence-summary"><div class="empty">No task lifecycle control loaded.</div></div>
        <div class="actions">
          <button id="taskLifecycleApplyAction" class="secondary">Apply Lifecycle Action</button>
          <button id="taskLifecycleEvidenceAction" class="secondary">Focus Lifecycle Evidence</button>
          <button id="taskLifecycleSessionAction" class="secondary">Focus Lifecycle Session</button>
        </div>
        <h3>Task Evidence Path</h3>
        <div class="actions">
          <button id="focusTaskPathSession" class="secondary">Focus Task Session</button>
          <button id="focusTaskPathEvidence" class="secondary">Focus Task Evidence</button>
          <button id="focusTaskPathDirective" class="secondary">Focus Task Directive</button>
          <button id="focusTaskPathDelivery" class="secondary">Focus Task Delivery</button>
          <button id="focusTaskPathChain" class="secondary">Focus Chain</button>
        </div>
        <div id="taskEvidencePath" class="evidence-summary"><div class="empty">No task evidence path loaded.</div></div>
        <h3>Task Focus Detail</h3>
        <div id="taskFocusDetail" class="evidence-summary"><div class="empty">No task selected.</div></div>
        <h3>Task Work Queue</h3>
        <div id="taskWorkQueue" class="attention-items"><div class="empty">No task work loaded.</div></div>
        <div id="tasks" class="tasks"><div class="empty">No tasks loaded.</div></div>
      </div>
      <div id="error" class="error" role="status"></div>
    </aside>
    <section>
      <div class="toolbar">
        <h2>Session Events</h2>
        <div class="event-filters">
          <label>Evidence Filter<select id="eventKindFilter"><option value="">All event kinds</option></select></label>
          <label>Session Filter<select id="eventSessionFilter"><option value="active">Active session</option><option value="all">All loaded sessions</option></select></label>
        </div>
        <button id="read" class="secondary">Read Events</button>
      </div>
      <div id="operationControlBoard" class="overview">
        <div class="overview-block"><h3>Operation Control Board</h3><ul><li class="empty">No control board loaded.</li></ul></div>
      </div>
      <div class="evidence-focus">
        <h3>Focused Control Target</h3>
        <div id="operationControlTarget" class="evidence-summary"><div class="empty">No control target loaded.</div></div>
        <div class="actions">
          <button id="operationControlTargetNextAction" class="secondary">Apply Target Action</button>
          <button id="operationControlTargetEvidenceAction" class="secondary">Focus Target Evidence</button>
          <button id="operationControlTargetReadinessAction" class="secondary">Focus Target Readiness</button>
        </div>
      </div>
      <div class="evidence-focus">
        <h3>Control Board Actions</h3>
        <div class="actions">
          <button id="operationControlBoardNextAction" class="secondary">Apply Board Next Action</button>
          <button id="operationControlBoardReadinessAction" class="secondary">Focus Board Readiness Gap</button>
          <button id="operationControlBoardEvidenceAction" class="secondary">Focus Board Evidence</button>
        </div>
      </div>
      <div id="productOverview" class="overview">
        <div class="overview-block"><h3>Operation</h3><ul><li class="empty">No operation loaded.</li></ul></div>
        <div class="overview-block"><h3>Site</h3><ul><li class="empty">No site loaded.</li></ul></div>
        <div class="overview-block"><h3>Memberships</h3><ul><li class="empty">No memberships loaded.</li></ul></div>
        <div class="overview-block"><h3>Sessions</h3><ul><li class="empty">No sessions loaded.</li></ul></div>
        <div class="overview-block"><h3>Tasks</h3><ul><li class="empty">No tasks loaded.</li></ul></div>
        <div class="overview-block"><h3>Authority Events</h3><ul><li class="empty">No authority events loaded.</li></ul></div>
        <div class="overview-block"><h3>Authority Routing</h3><ul><li class="empty">No authority routing loaded.</li></ul></div>
        <div class="overview-block"><h3>Continuity Packets</h3><ul><li class="empty">No continuity packets loaded.</li></ul></div>
        <div class="overview-block"><h3>Carrier Evidence</h3><ul><li class="empty">No carrier evidence loaded.</li></ul></div>
      </div>
      <div id="evidenceFocus" class="evidence-focus"><h3>Evidence Focus</h3><span>No event selected.</span></div>
      <div id="evidenceActionSummary" class="evidence-focus"><h3>Evidence Action</h3><span>No evidence action selected.</span></div>
      <div id="evidenceLanes" class="evidence-lanes"><div class="empty">No evidence lanes loaded.</div></div>
      <div class="evidence-focus"><h3>Evidence Review Queue</h3><span>Prioritized review path for loaded carrier events.</span></div>
      <div id="evidenceReviewQueue" class="attention-items"><div class="empty">No evidence review loaded.</div></div>
      <div id="events" class="events"><div class="empty">Start or resume a session to read carrier events.</div></div>
      <div class="composer">
        <label>Input<textarea id="input" placeholder="Send an operator input to the Cloudflare carrier"></textarea></label>
        <div class="actions"><button id="send">Send Input</button></div>
      </div>
    </section>
  </main>
  <script type="module">
    const WORKBENCH_STORAGE_KEY = 'narada.cloudflare.operationWorkbench.v1';
    const classifyCloudflareOperationCommandState = ${classifyCloudflareOperationCommandState.toString()};
    const classifyCloudflareAuthorityCommandState = ${classifyCloudflareAuthorityCommandState.toString()};
    const classifyCloudflareSessionCommandState = ${classifyCloudflareSessionCommandState.toString()};
    const classifyCloudflareTaskCommandState = ${classifyCloudflareTaskCommandState.toString()};
    const classifyCloudflareEvidenceCommandState = ${classifyCloudflareEvidenceCommandState.toString()};
    const classifyCloudflareSiteCommandState = ${classifyCloudflareSiteCommandState.toString()};
    const classifyCloudflareMembershipCommandState = ${classifyCloudflareMembershipCommandState.toString()};
    const state = { events: [], afterSequence: 0, autoRefreshTimer: null, operationProduct: null, productScope: 'none', operations: [], siteList: [], siteProductStatuses: [], siteProductOverview: null, consoleSequence: 0, operatorPrincipal: null, runtimeStatus: null, siteFocus: null, taskFocus: null, attentionItems: [], attentionFocus: null, evidenceFocus: null, evidenceLane: '', authorityFocus: null, operationFocus: null, sessionFocus: null, membershipFocus: null, continuityFocus: null, webhookDelayShadowFocus: null, webhookDelayDirectiveFocus: null, webhookDelayDirectiveDeliveryFocus: null, residentLoopShadowFocus: null, residentDispatchFocus: null };
    const el = (id) => document.getElementById(id);
    const api = {
      async request(operation, params = {}, extra = {}) {
        const carrierSessionId = el('sessionId').value.trim();
        const token = el('token').value.trim();
        const headers = { 'content-type': 'application/json' };
        if (token) headers.authorization = 'Bearer ' + token;
        const response = await fetch('/api/carrier', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify({ operation, carrier_session_id: carrierSessionId, params, ...extra }),
        });
        const body = await response.json();
        if (!response.ok || body.ok === false) {
          const error = new Error(body.code || body.error || response.statusText);
          error.details = { operation, http_status: response.status, body };
          throw error;
        }
        return body;
      },
      async session() {
        const response = await fetch('/auth/session', { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!response.ok) return null;
        return response.json();
      },
      start() {
        const carrierSessionId = el('sessionId').value.trim();
        const operationId = el('operationId').value.trim();
        return this.request('session.start', {
          carrier_session_id: carrierSessionId,
          agent_id: el('agentId').value.trim(),
          site_id: el('siteId').value.trim(),
          operation_id: operationId || null,
          site_root: 'cloudflare://' + el('siteId').value.trim(),
          site_ref: 'site://' + el('siteId').value.trim(),
        }, { request_id: 'console_start_' + carrierSessionId });
      },
      status() { return this.request('session.status'); },
      readSite() { return this.request('site.read', { site_id: el('siteId').value.trim(), carrier_event_limit: 20, session_limit: 10 }); },
      readSites() { return this.request('site.list', { limit: 20, site_status_limit: 20 }); },
      readOperation() {
        return this.request('operation.read', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          carrier_event_limit: 20,
          session_limit: 10,
        });
      },
      startResidentDispatch() {
        const siteId = el('siteId').value.trim();
        const operationId = el('operationId').value.trim() || 'operation_narada_cloudflare_control';
        const suffix = Date.now();
        const carrierSessionId = 'carrier_session_cloudflare_dispatch_' + suffix;
        return this.request('resident_dispatch.primary_with_fallback.start', {
          site_id: siteId,
          operation_id: operationId,
          carrier_session_id: carrierSessionId,
          agent_id: el('agentId').value.trim() || 'narada.cloudflare.dispatch',
          site_root: 'cloudflare://' + siteId,
          site_ref: 'site://' + siteId,
          windows_fallback_ref: 'windows_local_site_resident_loop',
        }, { request_id: 'console_resident_dispatch_' + suffix });
      },
      createOperation(operationId, displayName, operationKind) {
        return this.request('operation.create', {
          site_id: el('siteId').value.trim(),
          operation_id: operationId,
          display_name: displayName,
          operation_kind: operationKind,
          status: 'active',
        }, { request_id: 'console_operation_create_' + Date.now() });
      },
      putMembership(memberPrincipalId, role) {
        return this.request('site.membership.put', {
          site_id: el('siteId').value.trim(),
          member_principal_id: memberPrincipalId,
          role,
          status: 'active',
        }, { request_id: 'console_membership_put_' + Date.now() });
      },
      readEvents() { return this.request('session.events.read', { after_sequence: state.afterSequence }); },
      readSessionEvidence() { return this.request('session.events.read', { after_sequence: 0 }); },
      command(command, args = []) { return this.request('carrier.command.execute', { command, args }, { request_id: 'console_command_' + Date.now() }); },
      createTask(title) { return this.command('/task', ['create', ...String(title || '').split(/\s+/).filter(Boolean)]); },
      updateTask(taskId, status, note) { return this.command('/task', ['update', taskId, status, ...String(note || '').split(/\s+/).filter(Boolean)]); },
      emitAttention() {
        const operationId = el('operationId').value.trim();
        return this.request('directive.emit', {
          directive_kind: 'operation_attention',
          operation_id: operationId,
          target: { kind: 'operation', id: operationId },
          reason: 'operator_requested_attention',
        }, { request_id: 'console_attention_' + Date.now() });
      },
      deliver(content) {
        const eventId = 'console_input_' + Date.now();
        return this.request('carrier.input.deliver', { input: { event_id: eventId, input_id: eventId, input_kind: 'operator_message', source: 'operator', visibility: 'operator_visible', content } }, { request_id: 'request_' + eventId });
      },
    };
    window.naradaCloudflareCarrierClient = api;
    function loadWorkbenchState() {
      try {
        const saved = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) || '{}');
        if (saved.site_id) el('siteId').value = saved.site_id;
        if (saved.operation_id) el('operationId').value = saved.operation_id;
        if (saved.carrier_session_id) el('sessionId').value = saved.carrier_session_id;
      } catch {}
      renderActiveSession();
    }
    function saveWorkbenchState() {
      localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({
        site_id: el('siteId').value.trim(),
        operation_id: el('operationId').value.trim(),
        carrier_session_id: el('sessionId').value.trim(),
      }));
      renderActiveSession();
    }
    function renderActiveSession() {
      el('activeSession').textContent = el('sessionId').value.trim() || 'none';
      renderActiveSessionDetail();
      updateControlRoom();
    }
    function setCurrentOperation(operationId) {
      const next = String(operationId || '').trim();
      if (!next) return;
      el('operationId').value = next;
      state.operationFocus = state.operations.find((operation) => operation.operation_id === next) || null;
      saveWorkbenchState();
      state.events = [];
      state.afterSequence = 0;
      renderEvents();
      renderOperationNavigator(state.operations || []);
      updateControlRoom();
    }
    function setCurrentSession(carrierSessionId) {
      const next = String(carrierSessionId || '').trim();
      if (!next) return;
      el('sessionId').value = next;
      el('operationSessionSelect').value = next;
      state.sessionFocus = (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === next) || null;
      saveWorkbenchState();
      state.events = [];
      state.afterSequence = 0;
      renderEvents();
      renderSessionNavigator(state.operationProduct?.sessions || []);
      updateControlRoom();
    }
    function appendConsoleEvidence(eventKind, payload = {}) {
      state.consoleSequence += 1;
      appendEvents([{
        carrier_session_id: el('sessionId').value.trim() || 'console',
        sequence: state.afterSequence + state.consoleSequence / 1000,
        event_kind: eventKind,
        payload,
      }]);
    }
    function eventKey(event) {
      return (event.carrier_session_id || el('sessionId').value.trim()) + ':' + event.sequence;
    }
    function eventTitle(event) {
      return (event.carrier_session_id ? event.carrier_session_id + ' ' : '') + '#' + event.sequence + ' ' + event.event_kind;
    }
    function appendEvents(events = []) {
      for (const event of events) {
        if (state.events.some((existing) => eventKey(existing) === eventKey(event))) continue;
        state.events.push(event);
        const sequence = Number(event.sequence || 0);
        if (Number.isInteger(sequence)) state.afterSequence = Math.max(state.afterSequence, sequence);
      }
      refreshEventKindFilter();
      renderEvidenceLanes();
      renderEvents();
      renderAttentionQueue(extractOperationAttention(state.operationProduct || {}));
    }
    function extractOperationAttention(product = {}) {
      const tasks = product.tasks || [];
      const events = [
        ...state.events,
        ...(product.carrier_evidence || []).flatMap((entry) => entry.events || []),
      ];
      const seen = new Set();
      return events
        .filter((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_kind === 'operation_attention')
        .map((event) => {
          const payload = event.payload || {};
          const key = payload.directive_id || payload.input_event_id || [event.carrier_session_id, event.sequence].filter(Boolean).join(':');
          if (seen.has(key)) return null;
          seen.add(key);
          const resolvedByTask = tasks.find((task) => {
            const note = String(task.note || '');
            const status = String(task.status || '').toLowerCase();
            const resolutionStatus = status === 'done' || status === 'resolved' || status === 'closed';
            const inputEventId = String(payload.input_event_id || '');
            return resolutionStatus && (note.includes(key) || (inputEventId && note.includes(inputEventId)));
          }) || null;
          return {
            key,
            directive_id: payload.directive_id || key,
            input_event_id: payload.input_event_id || null,
            carrier_session_id: event.carrier_session_id || payload.carrier_session_id || null,
            operation_id: payload.operation_id || payload.target?.id || product.operation?.operation_id || null,
            reason: payload.reason || 'operation_requires_attention',
            visibility: payload.visibility || 'operator_visible',
            target: payload.target || null,
            sequence: event.sequence || null,
            status: resolvedByTask ? 'resolved' : 'open',
            resolving_task_id: resolvedByTask?.task_id || null,
          };
        })
        .filter(Boolean);
    }
    function updateControlRoom() {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      const activeSession = el('sessionId').value.trim();
      const activeDecision = (product.site_authority?.decisions || []).find((decision) => decision.mutation_class === 'cloudflare_carrier_session')
        || (product.site_authority?.decisions || [])[0]
        || null;
      el('controlOperation').textContent = product.operation?.operation_id || el('operationId').value.trim() || 'none';
      el('controlProductScope').textContent = productScopeSummary(product);
      el('controlOperationFocus').textContent = state.operationFocus ? [state.operationFocus.operation_id, state.operationFocus.status || state.operationFocus.operation_kind].filter(Boolean).join(' / ') : 'none';
      el('controlSession').textContent = activeSession || 'none';
      el('controlSessionFocus').textContent = state.sessionFocus ? [state.sessionFocus.carrier_session_id, state.sessionFocus.binding_status || state.sessionFocus.agent_id].filter(Boolean).join(' / ') : 'none';
      el('controlAuthorityLocus').textContent = activeDecision ? [activeDecision.authority_locus || 'unresolved', activeDecision.action || 'unknown'].join(' / ') : 'unknown';
      el('controlAuthorityFocus').textContent = state.authorityFocus ? [state.authorityFocus.mutation_class || state.authorityFocus.event_kind || 'authority', state.authorityFocus.action || 'unknown'].join(' / ') : 'none';
      el('controlOperator').textContent = operatorPrincipalLabel(state.operatorPrincipal);
      el('controlTaskFocus').textContent = state.taskFocus ? [state.taskFocus.task_id, state.taskFocus.status].filter(Boolean).join(' / ') : 'none';
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved').length;
      el('controlAttention').textContent = String(openAttention) + ' open / ' + state.attentionItems.length + ' total' + (state.attentionFocus ? ' / ' + state.attentionFocus.directive_id : '');
      el('controlEvidenceFocus').textContent = state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none';
      el('controlEvidenceWindow').textContent = String(surface.carrier_evidence_count ?? state.events.length) + ' evidence groups / ' + state.events.length + ' loaded events';
      const continuityStatus = surface.continuity_status || product.site_continuity_status || {};
      el('controlContinuity').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0) + ' packets / ' + String(continuityStatus.state || 'no_status') + ' / ' + String(surface.webhook_delay_directive_record_count ?? (product.webhook_delay_directive_records || []).length ?? 0) + ' directive intents';
      const lifecycleStatus = surface.lifecycle_status || product.operation_lifecycle_status || {};
      el('controlWorkbenchReadiness').textContent = operationWorkbenchReadiness(product) + ' / ' + String(lifecycleStatus.health || 'no_lifecycle_status');
      renderControlRoomActionSummary(product);
      renderOperatorRoute(product);
      renderWorkbenchReadinessGate(product);
      renderOperationControlBoard(product);
      renderSiteActionSummary();
      renderMembershipActionSummary();
      renderOperationActionSummary();
      renderOperationPath();
      renderSessionActionSummary();
      renderTaskCommandPreview();
      renderAuthorityActionSummary(product);
      renderContinuityWorkflow(product);
    }
    function productScopeSummary(product = state.operationProduct || {}) {
      if (state.productScope === 'site') return ['site', product.site?.site_id || el('siteId').value.trim(), String((product.operations || []).length) + ' operations'].filter(Boolean).join(' / ');
      if (state.productScope === 'operation') return ['operation', product.operation?.operation_id || el('operationId').value.trim(), String((product.sessions || []).length) + ' sessions'].filter(Boolean).join(' / ');
      return 'not loaded';
    }
    function productScopeContext(product = state.operationProduct || {}) {
      const surface = product.operation_product_surface || {};
      const scope = state.productScope || 'none';
      const followUp = scope === 'operation'
        ? 'read_site_scope_for_membership_and_operations'
        : scope === 'site'
          ? (el('operationId').value.trim() ? 'read_operation_scope_for_active_operation' : 'select_operation')
          : 'read_operation_or_site_scope';
      return [
        ['Scope', scope],
        ['Site', product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Sessions', String(surface.session_count ?? (product.sessions || []).length)],
        ['Tasks', String(surface.task_count ?? (product.tasks || []).length)],
        ['Authority Events', String((product.authority_events || []).length)],
        ['Evidence Groups', String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length)],
        ['Follow Up', followUp],
      ];
    }
    function renderProductScopeDetail(product = state.operationProduct || {}) {
      if (!product || state.productScope === 'none') {
        el('productScopeDetail').innerHTML = '<div class="empty">No product scope loaded.</div>';
        return;
      }
      el('productScopeDetail').replaceChildren(...productScopeContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function operationWorkbenchReadiness(product = {}) {
      const surface = product.operation_product_surface || {};
      const missing = [];
      if (!product.operation && !el('operationId').value.trim()) missing.push('operation');
      if ((product.sessions || []).length === 0 && !el('sessionId').value.trim()) missing.push('session');
      if ((product.carrier_evidence || []).length === 0 && state.events.length === 0) missing.push('evidence');
      if ((product.site_authority?.decisions || []).length === 0 && (product.authority_events || []).length === 0) missing.push('authority');
      if ((product.tasks || []).length === 0) missing.push('tasks');
      if ((product.site_continuity_packets || []).length === 0 && (product.site_continuity?.decisions || []).length === 0) missing.push('continuity');
      if ('webhook_delay_shadow_observations' in product || 'webhook_delay_shadow_observation_count' in surface) {
        if ((product.webhook_delay_shadow_observations || []).length === 0) missing.push('shadow-read');
      }
      if ('webhook_delay_directive_records' in product || 'webhook_delay_directive_record_count' in surface) {
        if ((product.webhook_delay_directive_records || []).length === 0) missing.push('webhook-delay-directive-intent');
      }
      if ('resident_loop_shadow_runs' in product || 'resident_loop_shadow_run_count' in surface) {
        if ((product.resident_loop_shadow_runs || []).length === 0) missing.push('resident-loop-shadow-read');
      }
      if ('resident_dispatch_decisions' in product || 'resident_dispatch_decision_count' in surface) {
        if ((product.resident_dispatch_decisions || []).length === 0) missing.push('resident-dispatch');
      }
      return missing.length === 0 ? 'ready' : 'missing ' + missing.join(', ');
    }
    function workbenchReadinessGateItems(product = state.operationProduct || {}) {
      const surface = product.operation_product_surface || {};
      const principal = state.operatorPrincipal || product.reader_principal || null;
      const membership = focusedMembership();
      const activeSession = el('sessionId').value.trim();
      const sessions = product.sessions || [];
      const evidenceEvents = state.events.length + (product.carrier_evidence || []).reduce((count, entry) => count + (entry.events || []).length, 0);
      const activeTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const authorityEvidence = (product.site_authority?.decisions || []).length + (product.authority_events || []).length;
      const continuityEvidence = Number(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0);
      const nextAction = String(contextValue(controlRoomActionContext(product), 'Action')) || 'monitor_operation_evidence';
      return [
        {
          key: 'operator_identity_ready',
          label: 'Operator Identity',
          status: principal ? 'ready' : 'needs_attention',
          detail: principal ? operatorPrincipalLabel(principal) : 'no signed operator principal',
          action_label: principal ? 'Review Identity' : 'Sign In',
          action: () => { if (principal) renderOperatorIdentity(principal); else window.location.href = '/auth/microsoft/login'; },
        },
        {
          key: 'membership_authority_ready',
          label: 'Membership Authority',
          status: membership && membership.status === 'active' ? 'ready' : 'needs_attention',
          detail: membership ? [membership.role || 'role unknown', membership.status || 'status unknown'].join(' / ') : 'no active membership focus',
          action_label: membership ? 'Focus Membership' : 'Read Site Scope',
          action: () => { if (membership) selectMembership(membership); else run(refreshSiteProduct); },
        },
        {
          key: 'operation_scope_ready',
          label: 'Operation Scope',
          status: product.operation || el('operationId').value.trim() ? 'ready' : 'needs_attention',
          detail: product.operation?.operation_id || el('operationId').value.trim() || 'no operation loaded',
          action_label: product.operation ? 'Read Operation' : 'Read Scope',
          action: () => run(refreshOperation),
        },
        {
          key: 'session_navigation_ready',
          label: 'Session Navigation',
          status: activeSession || sessions.length > 0 ? 'ready' : 'needs_attention',
          detail: (activeSession || 'no active session') + ' / ' + sessions.length + ' listed',
          action_label: sessions.length > 0 ? 'Focus Session' : 'Start Session',
          action: () => { if (sessions.length > 0) focusOperationSession(); else run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }); },
        },
        {
          key: 'evidence_inspection_ready',
          label: 'Evidence Inspection',
          status: evidenceEvents > 0 ? 'ready' : 'needs_attention',
          detail: String(evidenceEvents) + ' loaded events',
          action_label: evidenceEvents > 0 ? 'Focus Evidence' : 'Read Evidence',
          action: () => { if (evidenceEvents > 0) focusFlightDeckEvidence(); else run(readSelectedSessionEvidence); },
        },
        {
          key: 'task_lifecycle_ready',
          label: 'Task Lifecycle',
          status: activeTasks.length === 0 && (product.tasks || []).length > 0 ? 'ready' : 'needs_attention',
          detail: String(activeTasks.length) + ' open / ' + (product.tasks || []).length + ' total',
          action_label: activeTasks.length > 0 ? 'Focus Task' : 'Review Tasks',
          action: () => { if (activeTasks.length > 0) selectTask(activeTasks[0]); else renderTaskWorkQueue(); },
        },
        {
          key: 'authority_state_ready',
          label: 'Authority State',
          status: authorityEvidence > 0 ? 'ready' : 'needs_attention',
          detail: String(authorityEvidence) + ' authority records',
          action_label: authorityEvidence > 0 ? 'Focus Authority' : 'Read Authority',
          action: () => { if (authorityEvidence > 0) focusAuthorityPathDecision(); else run(refreshSiteProduct); },
        },
        {
          key: 'continuity_posture_ready',
          label: 'Continuity Posture',
          status: continuityEvidence > 0 ? 'ready' : 'needs_attention',
          detail: String(continuityEvidence) + ' continuity packets',
          action_label: continuityEvidence > 0 ? 'Focus Continuity' : 'Review Workflow',
          action: () => { if ((product.site_continuity_packets || []).length > 0) selectContinuity(product.site_continuity_packets[0]); else applyContinuityWorkflowNextStep(); },
        },
        {
          key: 'next_control_action_ready',
          label: 'Next Control Action',
          status: nextAction === 'monitor_operation_evidence' ? 'ready' : 'needs_attention',
          detail: nextAction,
          action_label: 'Apply Next Action',
          action: applyControlRoomNextAction,
        },
      ];
    }
    function applyWorkbenchReadinessNextAction() {
      const item = workbenchReadinessGateItems().find((entry) => entry.status !== 'ready');
      if (item?.action) item.action();
    }
    function workbenchReadinessActionButton(item) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = item.action_label || 'Focus';
      button.addEventListener('click', item.action);
      return button;
    }
    function renderWorkbenchReadinessGate(product = state.operationProduct || {}) {
      const items = workbenchReadinessGateItems(product);
      el('workbenchReadinessGate').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.status !== 'ready' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(workbenchReadinessActionButton(item)));
        return node;
      }));
    }
    function operationControlBoardContext(product = state.operationProduct || {}) {
      const control = controlRoomActionContext(product);
      const readinessItems = workbenchReadinessGateItems(product);
      const readinessGaps = readinessItems.filter((item) => item.status !== 'ready');
      const operationQueue = operationWorkQueueItems(state.operations || [], product);
      const sessionQueue = sessionWorkQueueItems(product.sessions || [], product);
      const authorityQueue = authorityDecisionQueueItems(product.site_authority?.decisions || [], product);
      const evidenceQueue = evidenceReviewQueueItems();
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const operationFocus = state.operationFocus || product.operation || null;
      const sessionFocus = state.sessionFocus || activeSessionDetail();
      const authorityFocus = state.authorityFocus || (product.site_authority?.decisions || [])[0] || null;
      const taskFocus = state.taskFocus || openTasks[0] || null;
      const evidenceFocus = state.evidenceFocus || evidenceQueue[0]?.event || null;
      const sessionPath = sessionEvidencePathContext(sessionFocus, product);
      const authoritySummary = authorityPostureSummary(product.site_authority?.decisions || []);
      const authorityEvidenceCount = authorityEvidenceEvents(product).length;
      const taskSummary = taskLifecycleSummary(product.tasks || []);
      const controlDomain = contextValue(control, 'Domain') || 'none';
      const controlAction = contextValue(control, 'Action') || 'none';
      const controlTarget = contextValue(control, 'Target') || 'none';
      const controlReason = contextValue(control, 'Reason') || 'none';
      return {
        command: [
          listItem('domain', controlDomain),
          listItem('action', controlAction),
          listItem('target', controlTarget),
          listItem('reason', controlReason),
        ],
        target: [
          listItem('control_domain', controlDomain),
          listItem('control_action', controlAction),
          listItem('control_target', controlTarget),
          listItem('control_reason', controlReason),
          listItem('operation_focus', operationFocus?.operation_id || el('operationId').value.trim() || 'none'),
          listItem('session_focus', sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'),
          listItem('task_focus', taskFocus ? [taskFocus.task_id, taskFocus.status].filter(Boolean).join(' / ') : 'none'),
          listItem('authority_focus', authorityFocus ? [authorityFocus.mutation_class || authorityFocus.event_kind || 'authority', authorityFocus.action || authorityFocus.authority_locus || 'unknown'].join(' / ') : 'none'),
          listItem('evidence_focus', evidenceFocus ? eventTitle(evidenceFocus) : 'none'),
        ],
        posture: [
          listItem('readiness', contextValue(control, 'Readiness') || operationWorkbenchReadiness(product)),
          listItem('scope', productScopeSummary(product)),
          listItem('operator', operatorPrincipalLabel(state.operatorPrincipal || product.reader_principal)),
          listItem('authority_locus', (product.site_authority?.decisions || [])[0]?.authority_locus || 'unknown'),
        ],
        queues: [
          listItem('operations_needing_action', operationQueue.filter((item) => item.status !== 'ready').length + ' / ' + operationQueue.length),
          listItem('sessions_needing_action', sessionQueue.filter((item) => item.status !== 'ready').length + ' / ' + sessionQueue.length),
          listItem('open_tasks', openTasks.length + ' / ' + (product.tasks || []).length),
          listItem('authority_needing_action', authorityQueue.filter((item) => item.status !== 'ready').length + ' / ' + authorityQueue.length),
        ],
        evidence: [
          listItem('events_loaded', String(state.events.length)),
          listItem('review_items', String(evidenceQueue.length)),
          listItem('focused_evidence', state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none'),
          listItem('active_lane', state.evidenceLane || 'all'),
        ],
        path: [
          listItem('operation', operationFocus?.operation_id || el('operationId').value.trim() || 'none'),
          listItem('session', sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'),
          listItem('task', state.taskFocus ? [state.taskFocus.task_id, state.taskFocus.status].filter(Boolean).join(' / ') : 'none'),
          listItem('authority', authorityFocus ? [authorityFocus.mutation_class || authorityFocus.event_kind || 'authority', authorityFocus.action || authorityFocus.authority_locus || 'unknown'].join(' / ') : 'none'),
          listItem('evidence', state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none'),
        ],
        sessionEvidence: [
          listItem('session', contextValue(sessionPath, 'Session') || 'none'),
          listItem('events', contextValue(sessionPath, 'Events') || '0'),
          listItem('provider_events', contextValue(sessionPath, 'Provider Events') || '0'),
          listItem('tool_events', contextValue(sessionPath, 'Tool Events') || '0'),
          listItem('failure_events', contextValue(sessionPath, 'Failure Events') || '0'),
          listItem('session_next_action', contextValue(sessionPath, 'Next Action') || 'select_or_start_session'),
        ],
        authority: [
          listItem('admitted', contextValue(authoritySummary, 'Admitted') || '0'),
          listItem('refused', contextValue(authoritySummary, 'Refused') || '0'),
          listItem('unresolved_locus', contextValue(authoritySummary, 'Unresolved Locus') || '0'),
          listItem('dominant_locus', contextValue(authoritySummary, 'Dominant Locus') || 'none'),
          listItem('controlled_action', authorityFocus?.controlled_action || 'none'),
          listItem('authority_evidence', String(authorityEvidenceCount)),
        ],
        taskLifecycle: [
          listItem('open', contextValue(taskSummary, 'Open') || '0'),
          listItem('closed', contextValue(taskSummary, 'Closed') || '0'),
          listItem('focused_status', contextValue(taskSummary, 'Focused Status') || 'none'),
          listItem('next_task', contextValue(taskSummary, 'Next Task') || 'none'),
          listItem('command_state', contextValue(taskSummary, 'Command State') || 'unknown'),
          listItem('next_action', contextValue(taskSummary, 'Next Action') || 'none'),
        ],
        readiness: readinessGaps.length > 0
          ? readinessGaps.slice(0, 4).map((item) => listItem(item.label, item.detail || item.action_label || item.status))
          : [listItem('ready', 'all readiness gates satisfied')],
      };
    }
    function renderOperationControlBoard(product = state.operationProduct || {}) {
      const board = operationControlBoardContext(product);
      el('operationControlTarget').replaceChildren(...board.target.map((item) => evidenceField(item.label, item.value)));
      el('operationControlBoard').replaceChildren(
        renderListBlock('Control Command', board.command),
        renderListBlock('Focused Control Target', board.target),
        renderListBlock('Control Posture', board.posture),
        renderListBlock('Active Work Path', board.path),
        renderListBlock('Session Evidence Posture', board.sessionEvidence),
        renderListBlock('Authority Posture', board.authority),
        renderListBlock('Task Lifecycle Posture', board.taskLifecycle),
        renderListBlock('Work Queues', board.queues),
        renderListBlock('Evidence Review', board.evidence),
        renderListBlock('Readiness Gaps', board.readiness),
      );
    }
    function contextValue(context, label) {
      return (context || []).find(([key]) => key === label)?.[1] || '';
    }
    function controlRoomActionContext(product = state.operationProduct || {}) {
      const siteId = product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || '';
      const operationId = product.operation?.operation_id || el('operationId').value.trim() || '';
      const sessionId = el('sessionId').value.trim();
      const siteAction = String(contextValue(siteActionContext(), 'Next Action'));
      const membershipAction = String(contextValue(membershipActionContext(), 'Next Action'));
      const operationAction = String(contextValue(operationActionContext(), 'Next Action'));
      const sessionAction = String(contextValue(sessionActionContext(), 'Next Action'));
      const authorityAction = String(contextValue(authorityActionContext(product), 'Next Action'));
      const operationPathAction = String(contextValue(operationPathContext(focusedOperation(), product), 'Next Action'));
      const sessionPathAction = String(contextValue(sessionEvidencePathContext(focusedSession(), product), 'Next Action'));
      const taskPathAction = String(contextValue(taskEvidencePathContext(state.taskFocus, product), 'Next Action'));
      const authorityPathAction = String(contextValue(authorityPathContext(product), 'Next Action'));
      const targets = operationFlightDeckTargets(product);
      const surface = product.operation_product_surface || {};
      const lifecycleStatus = surface.lifecycle_status || product.operation_lifecycle_status || {};
      const webhookDelayDirectiveRecords = product.webhook_delay_directive_records || [];
      const webhookDelayDirectiveDeliveries = product.webhook_delay_directive_deliveries || [];
      const webhookDelayDirectiveSurfacePresent = 'webhook_delay_directive_records' in product || 'webhook_delay_directive_record_count' in surface;
      const dispatchDecisions = product.resident_dispatch_decisions || [];
      const dispatchSurfacePresent = 'resident_dispatch_decisions' in product || 'resident_dispatch_decision_count' in surface;
      const next = (() => {
        if (!siteId && !operationId) return { domain: 'site', action: 'select_site_or_operation', target: 'none', reason: 'no_site_or_operation_loaded' };
        if (state.productScope === 'none') {
          return operationId
            ? { domain: 'product_scope', action: 'read_operation_scope', target: operationId, reason: 'operation_scope_not_loaded' }
            : { domain: 'product_scope', action: 'read_site_scope', target: siteId, reason: 'site_scope_not_loaded' };
        }
        if (siteAction === 'create_or_select_operation') {
          return { domain: 'site', action: 'focus_site_operation', target: siteId, reason: 'site_has_no_active_operation_focus' };
        }
        if (siteAction === 'read_site_authority') {
          return { domain: 'authority', action: 'read_site_authority', target: siteId, reason: 'site_authority_not_loaded' };
        }
        if (membershipAction && !['enter_principal', 'monitor_membership_authority'].includes(membershipAction)) {
          return { domain: 'membership', action: membershipAction, target: contextValue(membershipActionContext(), 'Principal') || 'none', reason: 'membership_authority_bridge_needs_attention' };
        }
        if (operationAction && !['inspect_operation_evidence'].includes(operationAction)) {
          return { domain: 'operation', action: operationAction, target: operationId || 'none', reason: 'operation_focus_or_scope_needs_attention' };
        }
        if (sessionAction && !['inspect_session_evidence'].includes(sessionAction)) {
          return { domain: 'session', action: sessionAction, target: sessionId || contextValue(sessionActionContext(), 'Session') || 'none', reason: 'session_focus_or_evidence_needs_attention' };
        }
        if (authorityAction && !['monitor_authority_admissions'].includes(authorityAction)) {
          return { domain: 'authority', action: authorityAction, target: contextValue(authorityActionContext(product), 'Focused Decision') || 'authority', reason: 'authority_state_needs_attention' };
        }
        if (lifecycleStatus.next_action === 'session') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_start_session', target: operationId || 'operation', reason: 'operation_lifecycle_missing_session' };
        }
        if (lifecycleStatus.next_action === 'carrier_evidence') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_read_evidence', target: sessionId || operationId || 'operation', reason: 'operation_lifecycle_missing_carrier_evidence' };
        }
        if (lifecycleStatus.next_action === 'continuity_packet') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_continuity', target: operationId || siteId || 'operation', reason: 'operation_lifecycle_missing_continuity_packet' };
        }
        if (lifecycleStatus.next_action === 'open_tasks') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_open_task', target: (targets.task?.task_id || 'task'), reason: 'operation_lifecycle_open_tasks' };
        }
        if (lifecycleStatus.next_action === 'undelivered_directives') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_directive_delivery', target: (webhookDelayDirectiveRecords[0]?.directive_record_id || 'directive'), reason: 'operation_lifecycle_undelivered_directives' };
        }
        if (operationPathAction === 'inspect_attention') {
          return { domain: 'operation_path', action: 'focus_operation_path_attention', target: contextValue(operationPathContext(focusedOperation(), product), 'Operation') || operationId || 'operation', reason: 'operation_path_has_open_attention' };
        }
        if (operationPathAction === 'inspect_open_task') {
          return { domain: 'operation_path', action: 'focus_operation_path_task', target: contextValue(operationPathContext(focusedOperation(), product), 'Operation') || operationId || 'operation', reason: 'operation_path_has_open_task' };
        }
        if (sessionPathAction === 'inspect_session_failures') {
          return { domain: 'session_path', action: 'focus_session_path_evidence', target: contextValue(sessionEvidencePathContext(focusedSession(), product), 'Session') || sessionId || 'session', reason: 'session_path_has_failures' };
        }
        if (sessionPathAction === 'inspect_open_task') {
          return { domain: 'session_path', action: 'focus_session_path_task', target: contextValue(sessionEvidencePathContext(focusedSession(), product), 'Session') || sessionId || 'session', reason: 'session_path_has_open_task' };
        }
        if (taskPathAction === 'inspect_evidence_or_reopen') {
          return { domain: 'task_path', action: 'focus_task_path_evidence', target: contextValue(taskEvidencePathContext(state.taskFocus, product), 'Task') || 'task', reason: 'task_path_closed_needs_evidence_review' };
        }
        if (authorityPathAction && !['monitor_authority_admissions'].includes(authorityPathAction)) {
          return { domain: 'authority_path', action: 'focus_authority_path_evidence', target: contextValue(authorityPathContext(product), 'Focused Decision') || 'authority', reason: 'authority_path_needs_evidence_or_locus_attention' };
        }
        if (webhookDelayDirectiveRecords.length > 0 && !state.webhookDelayDirectiveFocus) {
          return { domain: 'webhook_delay_directive', action: 'focus_webhook_delay_directive_intent', target: webhookDelayDirectiveRecords[0].directive_record_id || 'directive_intent', reason: 'directive_intent_record_needs_operator_focus' };
        }
        if (state.webhookDelayDirectiveFocus && !taskForDirectiveIntent(state.webhookDelayDirectiveFocus, product)) {
          return { domain: 'task', action: 'create_task_from_directive_intent', target: state.webhookDelayDirectiveFocus.directive_record_id || 'directive_intent', reason: 'directive_intent_has_no_task' };
        }
        if (webhookDelayDirectiveDeliveries.length > 0 && !state.webhookDelayDirectiveDeliveryFocus) {
          return { domain: 'webhook_delay_directive_delivery', action: 'focus_webhook_delay_directive_delivery', target: webhookDelayDirectiveDeliveries[0].delivery_id || webhookDelayDirectiveDeliveries[0].directive_delivery_id || 'directive_delivery', reason: 'directive_delivery_needs_operator_focus' };
        }
        if (webhookDelayDirectiveSurfacePresent && webhookDelayDirectiveRecords.length === 0 && (product.webhook_delay_shadow_observations || []).length > 0) {
          return { domain: 'webhook_delay_directive', action: 'focus_webhook_delay_shadow_read', target: (product.webhook_delay_shadow_observations || [])[0].observation_id || 'shadow_read', reason: 'directive_intent_not_recorded_from_shadow_read' };
        }
        if (dispatchSurfacePresent && dispatchDecisions.length === 0 && operationId) {
          return { domain: 'resident_dispatch', action: 'start_resident_dispatch', target: operationId, reason: 'cloudflare_primary_dispatch_not_recorded' };
        }
        if (targets.attention && targets.attention.status !== 'resolved') {
          return { domain: 'attention', action: 'focus_open_attention', target: targets.attention.directive_id || 'attention', reason: 'open_operation_attention' };
        }
        if (targets.task && !['done', 'closed', 'resolved'].includes(String(targets.task.status || '').toLowerCase())) {
          return { domain: 'task', action: 'focus_open_task', target: targets.task.task_id || 'task', reason: 'open_task_lifecycle' };
        }
        return { domain: 'evidence', action: 'monitor_operation_evidence', target: sessionId || operationId || siteId || 'control_room', reason: 'workbench_ready_for_monitoring' };
      })();
      return [
        ['Domain', next.domain],
        ['Action', next.action],
        ['Target', next.target],
        ['Reason', next.reason],
        ['Readiness', operationWorkbenchReadiness(product)],
      ];
    }
    function renderControlRoomActionSummary(product = state.operationProduct || {}) {
      el('controlRoomActionSummary').replaceChildren(...controlRoomActionContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function applyControlRoomNextAction() {
      const product = state.operationProduct || {};
      const action = String(contextValue(controlRoomActionContext(product), 'Action'));
      if (action === 'read_site_scope' || action === 'read_membership_site') { run(refreshSiteProduct); return; }
      if (action === 'read_operation_scope') { run(refreshOperation); return; }
      if (action === 'focus_site_operation') { focusSiteOperation(); return; }
      if (action === 'put_membership') { run(putFocusedMembership); return; }
      if (action === 'focus_membership_authority' || action === 'inspect_inactive_membership') { focusMembershipAuthority(); return; }
      if (action === 'use_focused_operation') { useFocusedOperation(); return; }
      if (action === 'read_operation_evidence') { run(refreshOperation); return; }
      if (action === 'focus_operation_session' || action === 'start_or_select_session') { focusOperationSession(); return; }
      if (action === 'use_focused_session') { useFocusedSession(); return; }
      if (action === 'read_session_evidence') { run(readSelectedSessionEvidence); return; }
      if (action === 'focus_authority_evidence' || action === 'inspect_refused_authority' || action === 'resolve_authority_locus' || action === 'read_site_authority') { applyAuthorityNextAction(); return; }
      if (action === 'focus_lifecycle_start_session') { focusOperationSession(); return; }
      if (action === 'focus_lifecycle_read_evidence') { run(refreshOperation); return; }
      if (action === 'focus_lifecycle_continuity') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'focus_lifecycle_open_task') { applyFlightDeckNextAction(); return; }
      if (action === 'focus_lifecycle_directive_delivery') { focusWebhookDelayDirectiveDelivery(); return; }
      if (action === 'focus_operation_path_attention') { focusOperationPathAttention(); return; }
      if (action === 'focus_operation_path_task') { focusOperationPathTask(); return; }
      if (action === 'focus_session_path_evidence') { focusSessionPathEvidence(); return; }
      if (action === 'focus_session_path_task') { focusSessionPathTask(); return; }
      if (action === 'focus_task_path_evidence') { focusTaskPathEvidence(); return; }
      if (action === 'focus_authority_path_evidence') { focusAuthorityEvidence(); return; }
      if (action === 'focus_webhook_delay_directive_intent') { focusWebhookDelayDirective(); return; }
      if (action === 'create_task_from_directive_intent') { run(createTaskFromFocusedDirectiveIntent); return; }
      if (action === 'focus_webhook_delay_directive_delivery') { focusWebhookDelayDirectiveDelivery(); return; }
      if (action === 'focus_webhook_delay_shadow_read') { focusWebhookDelayShadow(); return; }
      if (action === 'start_resident_dispatch') { run(startResidentDispatchFromWorkbench); return; }
      if (action === 'focus_open_attention' || action === 'focus_open_task' || action === 'monitor_operation_evidence') { applyFlightDeckNextAction(); return; }
      applyFlightDeckNextAction();
    }
    function operatorRouteStage(domain, context, readyActions, targetLabel, action) {
      const nextAction = String(contextValue(context, 'Next Action') || 'none');
      const commandState = String(contextValue(context, 'Command State') || 'not_classified');
      const commandAction = String(contextValue(context, 'Command Action') || nextAction);
      const target = String(contextValue(context, targetLabel) || contextValue(context, 'Target Ref') || contextValue(context, 'Focused Decision') || 'none');
      const ready = readyActions.includes(nextAction) || readyActions.includes(commandState);
      return { domain, command_state: commandState, command_action: commandAction, next_action: nextAction, target, status: ready ? 'ready' : 'needs_attention', action };
    }
    function taskRouteStage(product = state.operationProduct || {}) {
      const targets = operationFlightDeckTargets(product);
      const selected = targets.task || selectedTaskFromWorkbench();
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      if (!selected && openTasks.length === 0) {
        return { domain: 'task', command_state: 'no_open_tasks', command_action: 'monitor_task_lifecycle', next_action: 'monitor_task_lifecycle', target: 'none', status: 'ready', action: applyFlightDeckNextAction };
      }
      const evidenceEvents = state.events.filter((event) => selected?.task_id && JSON.stringify(event.payload || {}).includes(selected.task_id));
      const command = classifyCloudflareTaskCommandState({
        task_id: selected?.task_id || '',
        status: selected?.status || '',
        evidence_count: evidenceEvents.length,
      });
      const ready = ['evidence_ready'].includes(command.command_state) || (openTasks.length === 0 && command.lifecycle === 'closed');
      return {
        domain: 'task',
        command_state: command.command_state,
        command_action: command.command_action,
        next_action: command.next_action,
        target: selected?.task_id || 'none',
        status: ready ? 'ready' : 'needs_attention',
        action: () => { if (selected) selectTask(selected); else applyFlightDeckNextAction(); },
      };
    }
    function operatorRouteStages(product = state.operationProduct || {}) {
      const evidenceContext = evidenceActionSummaryContext(state.evidenceFocus);
      const evidenceStage = evidenceContext.length > 0
        ? operatorRouteStage('evidence', evidenceContext, ['payload_review'], 'Target Ref', focusFlightDeckEvidence)
        : { domain: 'evidence', command_state: 'evidence_focus_needed', command_action: 'focus_evidence', next_action: 'focus_evidence', target: el('sessionId').value.trim() || product.operation?.operation_id || product.site?.site_id || 'none', status: 'needs_attention', action: focusFlightDeckEvidence };
      return [
        operatorRouteStage('site', siteActionContext(), ['inspect_site_operations', 'site_operations_ready'], 'Site', () => {
          const action = String(contextValue(siteActionContext(), 'Next Action'));
          if (action === 'read_site_scope' || action === 'read_site_authority') run(refreshSiteProduct);
          else if (action === 'load_or_create_membership') focusSiteMembership();
          else focusSiteOperation();
        }),
        operatorRouteStage('membership', membershipActionContext(), ['monitor_membership_authority', 'membership_authority_monitoring'], 'Principal', () => {
          const action = String(contextValue(membershipActionContext(), 'Next Action'));
          if (action === 'read_membership_site') run(refreshSiteProduct);
          else if (action === 'put_membership') run(putFocusedMembership);
          else focusMembershipAuthority();
        }),
        operatorRouteStage('operation', operationActionContext(), ['inspect_operation_evidence', 'evidence_ready'], 'Operation', () => {
          const action = String(contextValue(operationActionContext(), 'Next Action'));
          if (action === 'read_operation_scope' || action === 'read_operation_evidence') run(refreshOperation);
          else if (action === 'use_focused_operation') useFocusedOperation();
          else focusOperationSession();
        }),
        operatorRouteStage('session', sessionActionContext(), ['inspect_session_evidence', 'evidence_ready'], 'Session', () => {
          const action = String(contextValue(sessionActionContext(), 'Next Action'));
          if (action === 'read_session_evidence') run(readSelectedSessionEvidence);
          else if (action === 'use_focused_session') useFocusedSession();
          else focusFocusedSessionEvidence();
        }),
        taskRouteStage(product),
        operatorRouteStage('authority', authorityActionContext(product), ['monitor_authority_admissions', 'admissions_monitoring'], 'Focused Decision', applyAuthorityNextAction),
        evidenceStage,
      ];
    }
    function applyOperatorRouteNextAction() {
      const stage = operatorRouteStages().find((item) => item.status !== 'ready') || operatorRouteStages()[0];
      if (stage?.action) stage.action();
    }
    function operatorRouteActionButton(stage) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = stage.status === 'ready' ? 'Focus' : 'Act';
      button.addEventListener('click', stage.action);
      return button;
    }
    function renderOperatorRoute(product = state.operationProduct || {}) {
      const stages = operatorRouteStages(product);
      if (stages.length === 0) {
        el('operatorRoute').innerHTML = '<div class="empty">No operator route loaded.</div>';
        return;
      }
      const firstAttention = stages.find((stage) => stage.status !== 'ready');
      el('operatorRoute').replaceChildren(...stages.map((stage) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (stage === firstAttention ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = stage.domain + ' | ' + stage.command_state;
        const meta = document.createElement('span');
        meta.textContent = [stage.status, stage.next_action, stage.target].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(operatorRouteActionButton(stage)));
        return node;
      }));
    }
    function operationFlightDeckContext(product = {}) {
      const surface = product.operation_product_surface || {};
      const activeSession = el('sessionId').value.trim();
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const unresolvedAuthority = (product.site_authority?.decisions || []).filter((decision) => decision.action !== 'admit');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const directiveDeliveries = product.webhook_delay_directive_deliveries || [];
      const nextAction = openAttention[0]
        ? 'resolve attention ' + openAttention[0].directive_id
        : openTasks[0]
          ? 'advance task ' + openTasks[0].task_id
          : !activeSession
            ? 'select or start session'
            : unresolvedAuthority[0]
              ? 'inspect authority ' + (unresolvedAuthority[0].mutation_class || unresolvedAuthority[0].reason || 'decision')
              : 'monitor operation';
      return [
        ['Operation', product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Selected Session', activeSession || 'none'],
        ['Session Focus', state.sessionFocus?.carrier_session_id || 'none'],
        ['Open Attention', String(openAttention.length) + ' / ' + state.attentionItems.length],
        ['Open Tasks', String(openTasks.length) + ' / ' + (product.tasks || []).length],
        ['Directive Deliveries', String(directiveDeliveries.length)],
        ['Evidence Loaded', String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length) + ' groups / ' + state.events.length + ' events'],
        ['Authority Posture', unresolvedAuthority.length === 0 ? 'no unresolved decisions' : String(unresolvedAuthority.length) + ' unresolved'],
        ['Next Action', nextAction],
      ];
    }
    function operationFlightDeckTargets(product = state.operationProduct || {}) {
      const activeSession = el('sessionId').value.trim();
      const sessions = product.sessions || [];
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const unresolvedAuthority = (product.site_authority?.decisions || []).filter((decision) => decision.action !== 'admit');
      const directiveIntent = state.webhookDelayDirectiveFocus || (product.webhook_delay_directive_records || [])[0] || null;
      const directiveDelivery = state.webhookDelayDirectiveDeliveryFocus || (product.webhook_delay_directive_deliveries || [])[0] || null;
      return {
        session: sessions.find((session) => session.carrier_session_id === activeSession) || state.sessionFocus || sessions[0] || null,
        attention: openAttention[0] || state.attentionFocus || state.attentionItems[0] || null,
        task: openTasks[0] || state.taskFocus || (product.tasks || [])[0] || null,
        authority: unresolvedAuthority[0] || state.authorityFocus || (product.site_authority?.decisions || [])[0] || null,
        directiveIntent,
        directiveDelivery,
      };
    }
    function setEvidenceLane(key) {
      state.evidenceLane = key;
      const first = visibleEvents()[0] || null;
      if (first) focusEvidence(first);
      else { state.evidenceFocus = null; renderEvidenceFocus(); }
      renderEvidenceLanes();
      renderEvidenceReviewQueue();
      renderEvents();
      updateControlRoom();
    }
    function focusFlightDeckEvidence() {
      setEvidenceLane('');
      const activeSession = el('sessionId').value.trim();
      focusEvidenceFor((event) => activeSession && event.carrier_session_id === activeSession);
    }
    function focusFlightDeckEvidenceChain() {
      const targets = operationFlightDeckTargets();
      if (targets.directiveDelivery) { selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); return; }
      if (targets.directiveIntent) { selectWebhookDelayDirective(targets.directiveIntent); return; }
      focusWebhookDelayChainObservation();
    }
    function applyFlightDeckNextAction() {
      const targets = operationFlightDeckTargets();
      if (targets.attention && targets.attention.status !== 'resolved') { selectAttentionItem(targets.attention); return; }
      if (targets.task && !['done', 'closed', 'resolved'].includes(String(targets.task.status || '').toLowerCase())) { selectTask(targets.task); return; }
      if (targets.session && !el('sessionId').value.trim()) { selectOperationSession(targets.session); return; }
      if (targets.authority && targets.authority.action !== 'admit') { selectAuthorityDecision(targets.authority); return; }
      if (targets.directiveDelivery) { selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); return; }
      if (targets.directiveIntent) { selectWebhookDelayDirective(targets.directiveIntent); return; }
      focusFlightDeckEvidence();
    }
    function operationFlightDeckButton(id, label, action) {
      const button = document.createElement('button');
      button.id = id;
      button.className = 'secondary';
      button.textContent = label;
      button.addEventListener('click', action);
      return button;
    }
    function renderOperationFlightDeck(product = state.operationProduct || {}) {
      if (!product.operation && !el('operationId').value.trim()) {
        el('operationFlightDeck').innerHTML = '<div class="empty">No operation product loaded.</div>';
        return;
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.style.gridColumn = '1 / -1';
      const targets = operationFlightDeckTargets(product);
      actions.append(
        operationFlightDeckButton('flightDeckNextAction', 'Focus Next Action', applyFlightDeckNextAction),
        operationFlightDeckButton('flightDeckFocusSession', 'Focus Session', () => { if (targets.session) selectOperationSession(targets.session); }),
        operationFlightDeckButton('flightDeckFocusAttention', 'Focus Attention', () => { if (targets.attention) selectAttentionItem(targets.attention); }),
        operationFlightDeckButton('flightDeckFocusTask', 'Focus Task', () => { if (targets.task) selectTask(targets.task); }),
        operationFlightDeckButton('flightDeckFocusAuthority', 'Focus Authority', () => { if (targets.authority) selectAuthorityDecision(targets.authority); }),
        operationFlightDeckButton('flightDeckFocusDirectiveIntent', 'Focus Directive Intent', () => { if (targets.directiveIntent) selectWebhookDelayDirective(targets.directiveIntent); }),
        operationFlightDeckButton('flightDeckFocusDirectiveDelivery', 'Focus Directive Delivery', () => { if (targets.directiveDelivery) selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); }),
        operationFlightDeckButton('flightDeckFocusEvidenceChain', 'Focus Evidence Chain', focusFlightDeckEvidenceChain),
        operationFlightDeckButton('flightDeckFocusEvidence', 'Focus Evidence', focusFlightDeckEvidence),
      );
      el('operationFlightDeck').replaceChildren(...operationFlightDeckContext(product).map(([label, value]) => evidenceField(label, value)), actions);
    }
    function continuityWorkflowSteps(product = state.operationProduct || {}) {
      const activeSession = el('sessionId').value.trim();
      const targets = operationFlightDeckTargets(product);
      const sessionEvidenceLoaded = activeSession && (state.events.some((event) => event.carrier_session_id === activeSession)
        || (product.carrier_evidence || []).some((entry) => entry.carrier_session_id === activeSession && (entry.events || []).length > 0));
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const authorityLoaded = (product.site_authority?.decisions || []).length > 0 || (product.authority_events || []).length > 0;
      return [
        {
          key: 'operation_scope_loaded',
          label: 'Operation Scope',
          status: state.productScope === 'operation' && (product.operation || el('operationId').value.trim()) ? 'complete' : 'needs_attention',
          detail: product.operation?.operation_id || el('operationId').value.trim() || 'no operation loaded',
          action_label: 'Read Operation Scope',
          action: () => run(refreshOperation),
        },
        {
          key: 'site_scope_loaded',
          label: 'Site Scope',
          status: state.productScope === 'site' && product.site ? 'complete' : 'needs_attention',
          detail: product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'no site loaded',
          action_label: 'Read Site Scope',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'session_selected',
          label: 'Session Selected',
          status: activeSession ? 'complete' : 'needs_attention',
          detail: activeSession || 'select or start session',
          action_label: 'Focus Session',
          action: () => { if (targets.session) selectOperationSession(targets.session); },
        },
        {
          key: 'session_evidence_loaded',
          label: 'Session Evidence',
          status: sessionEvidenceLoaded ? 'complete' : 'needs_attention',
          detail: sessionEvidenceLoaded ? 'evidence loaded for active session' : 'read active session evidence',
          action_label: 'Read Evidence',
          action: () => run(readSelectedSessionEvidence),
        },
        {
          key: 'attention_reviewed',
          label: 'Attention Review',
          status: openAttention.length === 0 ? 'complete' : 'needs_attention',
          detail: String(openAttention.length) + ' open / ' + state.attentionItems.length + ' total',
          action_label: 'Focus Attention',
          action: () => { if (targets.attention) selectAttentionItem(targets.attention); },
        },
        {
          key: 'task_lifecycle_reviewed',
          label: 'Task Lifecycle',
          status: openTasks.length === 0 ? 'complete' : 'needs_attention',
          detail: String(openTasks.length) + ' open / ' + (product.tasks || []).length + ' total',
          action_label: 'Focus Task',
          action: () => { if (targets.task) selectTask(targets.task); },
        },
        {
          key: 'authority_state_loaded',
          label: 'Authority State',
          status: authorityLoaded ? 'complete' : 'needs_attention',
          detail: authorityLoaded ? 'authority evidence loaded' : 'read site scope for authority state',
          action_label: 'Read Site Scope',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'evidence_focus_set',
          label: 'Evidence Focus',
          status: state.evidenceFocus ? 'complete' : 'needs_attention',
          detail: state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'focus evidence for selected session or operation',
          action_label: 'Focus Evidence',
          action: focusFlightDeckEvidence,
        },
      ];
    }
    function applyContinuityWorkflowNextStep() {
      const step = continuityWorkflowSteps().find((item) => item.status !== 'complete');
      if (step?.action) step.action();
    }
    function continuityWorkflowActionButton(step) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = step.action_label || 'Focus';
      button.addEventListener('click', step.action);
      return button;
    }
    function renderContinuityWorkflow(product = state.operationProduct || {}) {
      if (!product) {
        el('continuityWorkflow').innerHTML = '<div class="empty">No continuity workflow loaded.</div>';
        return;
      }
      const steps = continuityWorkflowSteps(product);
      el('continuityWorkflow').replaceChildren(...steps.map((step) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (step.status !== 'complete' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = step.label;
        const meta = document.createElement('span');
        meta.textContent = [step.status, step.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(continuityWorkflowActionButton(step)));
        return node;
      }));
    }
    function refreshEventKindFilter() {
      const select = el('eventKindFilter');
      const current = select.value;
      const kinds = [...new Set(state.events.map((event) => event.event_kind).filter(Boolean))].sort();
      select.replaceChildren(new Option('All event kinds', ''), ...kinds.map((kind) => new Option(kind, kind)));
      if (kinds.includes(current)) select.value = current;
    }
    function visibleEvents() {
      const activeSession = el('sessionId').value.trim();
      const kindFilter = el('eventKindFilter').value;
      const sessionFilter = el('eventSessionFilter').value;
      return state.events.filter((event) => {
        if (kindFilter && event.event_kind !== kindFilter) return false;
        if (state.evidenceLane && classifyEvidenceLane(event) !== state.evidenceLane) return false;
        if (sessionFilter === 'active' && activeSession && event.carrier_session_id && event.carrier_session_id !== activeSession) return false;
        return true;
      });
    }
    function evidenceLaneDefinitions() {
      return [
        { key: '', label: 'All Evidence' },
        { key: 'input', label: 'Input Lifecycle' },
        { key: 'provider', label: 'Provider Turns' },
        { key: 'tools', label: 'Tools / Effects' },
        { key: 'authority', label: 'Authority' },
        { key: 'directives', label: 'Directives' },
        { key: 'failures', label: 'Failures' },
        { key: 'other', label: 'Other' },
      ];
    }
    function classifyEvidenceLane(event = {}) {
      return classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) }).lane;
    }
    function renderEvidenceLanes() {
      const counts = new Map(evidenceLaneDefinitions().map((lane) => [lane.key, 0]));
      for (const event of state.events) {
        counts.set('', (counts.get('') || 0) + 1);
        const lane = classifyEvidenceLane(event);
        counts.set(lane, (counts.get(lane) || 0) + 1);
      }
      el('evidenceLanes').replaceChildren(...evidenceLaneDefinitions().map((lane) => {
        const node = document.createElement('article');
        node.className = 'evidence-lane' + (state.evidenceLane === lane.key ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = lane.label;
        const meta = document.createElement('span');
        meta.textContent = String(counts.get(lane.key) || 0) + ' events';
        node.addEventListener('click', () => setEvidenceLane(lane.key));
        node.append(title, meta);
        return node;
      }));
    }
    function focusEvidence(event) {
      if (!event) return;
      state.evidenceFocus = event;
      renderEvidenceFocus();
      renderEvidenceActionSummary();
      renderEvidenceReviewQueue();
      updateControlRoom();
    }
    function focusEvidenceFor(predicate) {
      const event = state.events.find(predicate) || (state.operationProduct?.carrier_evidence || []).flatMap((entry) => entry.events || []).find(predicate) || null;
      if (event) focusEvidence(event);
    }
    function evidenceFocusIndex(events = visibleEvents()) {
      if (!state.evidenceFocus) return -1;
      return events.findIndex((event) => eventKey(event) === eventKey(state.evidenceFocus));
    }
    function focusAdjacentEvidence(offset) {
      const events = visibleEvents();
      if (events.length === 0) return;
      const current = evidenceFocusIndex(events);
      const nextIndex = current < 0 ? 0 : Math.max(0, Math.min(events.length - 1, current + offset));
      focusEvidence(events[nextIndex]);
      renderEvents();
    }
    function evidenceTrailContext(event) {
      const events = visibleEvents();
      const index = evidenceFocusIndex(events);
      const lane = state.evidenceLane || classifyEvidenceLane(event);
      return [
        ['Trail Position', index >= 0 ? String(index + 1) + ' / ' + events.length : 'outside visible window'],
        ['Lane', lane || 'all'],
        ['Active Kind Filter', el('eventKindFilter').value || 'all'],
        ['Active Session Filter', el('eventSessionFilter').value || 'all'],
      ];
    }
    function renderEvidenceFocus() {
      if (!state.evidenceFocus) {
        el('evidenceFocus').replaceChildren(
          Object.assign(document.createElement('h3'), { textContent: 'Evidence Focus' }),
          Object.assign(document.createElement('span'), { textContent: 'No event selected.' }),
        );
        renderEvidenceActionSummary();
        return;
      }
      const heading = document.createElement('h3');
      heading.textContent = 'Evidence Focus';
      const meta = document.createElement('span');
      meta.textContent = eventTitle(state.evidenceFocus);
      const summary = document.createElement('div');
      summary.className = 'evidence-summary';
      summary.replaceChildren(...evidenceActionContext(state.evidenceFocus).map(([label, value]) => evidenceField(label, value)), ...evidenceTrailContext(state.evidenceFocus).map(([label, value]) => evidenceField(label, value)));
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(evidencePayload(state.evidenceFocus), null, 2);
      el('evidenceFocus').replaceChildren(
        heading,
        meta,
        summary,
        focusActionRow(
          focusActionButton('evidenceFocusPreviousAction', 'Previous Evidence', () => focusAdjacentEvidence(-1)),
          focusActionButton('evidenceFocusNextAction', 'Next Evidence', () => focusAdjacentEvidence(1)),
        ),
        pre,
      );
    }
    function evidenceTargetContext(event = {}) {
      const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
      return { targetType: command.target_type, targetRef: command.target_ref };
    }
    function tryParseTaskId(value) {
      if (!value || typeof value !== 'string') return null;
      try { return JSON.parse(value).task?.task_id || null; } catch { return null; }
    }
    function evidenceNextAction(event = {}) {
      return classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) }).next_action;
    }
    function evidenceActionSummaryContext(event = state.evidenceFocus) {
      if (!event) return [];
      const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
      return [
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
        ['Target Type', command.target_type],
        ['Target Ref', command.target_ref],
        ['Lane', command.lane],
        ['Session', event.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Sequence', event.sequence ?? 'none'],
        ['Kind', event.event_kind || 'unknown'],
      ];
    }
    function focusEvidenceLaneForCurrent() {
      if (!state.evidenceFocus) return;
      state.evidenceLane = classifyEvidenceLane(state.evidenceFocus);
      renderEvidenceLanes();
      renderEvidenceReviewQueue();
      renderEvents();
      updateControlRoom();
    }
    function selectEvidenceSession() {
      if (state.evidenceFocus?.carrier_session_id) setCurrentSession(state.evidenceFocus.carrier_session_id);
    }
    function focusEvidenceTarget() {
      const event = state.evidenceFocus;
      if (!event) return;
      const payload = event.payload || {};
      const target = evidenceTargetContext(event);
      if (target.targetType === 'task') {
        const task = (state.operationProduct?.tasks || []).find((entry) => entry.task_id === target.targetRef) || { task_id: target.targetRef };
        selectTask(task);
        return;
      }
      if (target.targetType === 'attention') {
        const attention = state.attentionItems.find((item) => item.directive_id === target.targetRef || item.input_event_id === payload.input_event_id);
        if (attention) selectAttentionItem(attention);
        return;
      }
      if (target.targetType === 'authority') {
        const decision = (state.operationProduct?.site_authority?.decisions || []).find((entry) => entry.mutation_class === target.targetRef || entry.reason === payload.reason || entry.action === payload.admission_action);
        if (decision) selectAuthorityDecision(decision);
        else focusAuthorityEvidence();
        return;
      }
      if (target.targetType === 'session' && event.carrier_session_id) {
        const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === event.carrier_session_id) || { carrier_session_id: event.carrier_session_id };
        selectOperationSession(session);
        return;
      }
      if (target.targetType === 'tool_effect') {
        focusOperationPathTask();
        return;
      }
      focusOperationPathEvidence();
    }
    function focusEvidencePath() {
      const event = state.evidenceFocus;
      if (!event) return;
      const target = evidenceTargetContext(event);
      if (target.targetType === 'task') { focusEvidenceTarget(); renderTaskEvidencePath(selectedTaskFromWorkbench()); return; }
      if (target.targetType === 'authority') { focusEvidenceTarget(); renderAuthorityPath(); return; }
      if (event.carrier_session_id || target.targetType === 'session') { focusEvidenceTarget(); renderSessionEvidencePath(focusedSession()); return; }
      focusOperationPathEvidence();
      renderOperationPath();
    }
    function renderEvidenceActionSummary(event = state.evidenceFocus) {
      if (!event) {
        el('evidenceActionSummary').replaceChildren(
          Object.assign(document.createElement('h3'), { textContent: 'Evidence Action' }),
          Object.assign(document.createElement('span'), { textContent: 'No evidence action selected.' }),
        );
        return;
      }
      const heading = Object.assign(document.createElement('h3'), { textContent: 'Evidence Action' });
      const summary = document.createElement('div');
      summary.className = 'evidence-summary';
      summary.replaceChildren(...evidenceActionSummaryContext(event).map(([label, value]) => evidenceField(label, value)));
      el('evidenceActionSummary').replaceChildren(
        heading,
        summary,
        focusActionRow(
          focusActionButton('evidenceActionLaneAction', 'Focus Evidence Lane', focusEvidenceLaneForCurrent),
          focusActionButton('evidenceActionSessionAction', 'Use Evidence Session', selectEvidenceSession),
          focusActionButton('evidenceActionTargetAction', 'Focus Evidence Target', focusEvidenceTarget),
          focusActionButton('evidenceActionPathAction', 'Focus Evidence Path', focusEvidencePath),
        ),
      );
    }
    function evidenceReviewPriority(command = {}) {
      if (command.lane === 'failures') return 0;
      if (command.lane === 'authority') return 1;
      if (command.lane === 'tools') return 2;
      if (command.lane === 'directives') return 3;
      if (command.lane === 'provider') return 4;
      if (command.lane === 'input') return 5;
      return 6;
    }
    function evidenceReviewQueueItems(events = visibleEvents()) {
      return events.map((event) => {
        const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
        return { event, command };
      }).sort((left, right) => {
        const priority = evidenceReviewPriority(left.command) - evidenceReviewPriority(right.command);
        if (priority !== 0) return priority;
        return Number(right.event.sequence ?? 0) - Number(left.event.sequence ?? 0);
      });
    }
    function evidenceReviewQueueButtonId(event, suffix) {
      return ['evidenceReviewQueue', event.event_kind || 'event', event.sequence ?? 'seq', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderEvidenceReviewQueue(events = visibleEvents()) {
      if (!events.length) {
        el('evidenceReviewQueue').innerHTML = '<div class="empty">No evidence review loaded.</div>';
        return;
      }
      const items = evidenceReviewQueueItems(events).slice(0, 25);
      el('evidenceReviewQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.evidenceFocus && eventKey(state.evidenceFocus) === eventKey(item.event) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.command.lane, item.command.command_state, item.event.event_kind || 'event'].join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.command.next_action, item.command.target_type + ':' + item.command.target_ref, item.event.carrier_session_id || 'no session', 'seq ' + (item.event.sequence ?? 'none')].join(' | ');
        node.addEventListener('click', () => focusEvidence(item.event));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'focus'), 'Focus', () => focusEvidence(item.event)),
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'target'), 'Target', () => { focusEvidence(item.event); focusEvidenceTarget(); }),
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'path'), 'Path', () => { focusEvidence(item.event); focusEvidencePath(); }),
          ),
        );
        return node;
      }));
    }
    function selectAttentionItem(item) {
      if (!item?.directive_id) return;
      state.attentionFocus = item;
      focusEvidenceFor((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_id === item.directive_id);
      if (item.carrier_session_id) setCurrentSession(item.carrier_session_id);
      el('updateTaskStatus').value = 'done';
      el('updateTaskNote').value = ['resolved_attention', item.directive_id, item.input_event_id, item.reason].filter(Boolean).join(' ');
      el('eventKindFilter').value = 'directive_emitted';
      renderAttentionFocusDetail(item);
      renderAttentionQueue(state.attentionItems);
      renderEvents();
      updateControlRoom();
    }
    function renderAttentionQueue(items = []) {
      state.attentionItems = items;
      if (items.length === 0) {
        state.attentionFocus = null;
        el('attentionQueue').innerHTML = '<div class="empty">No operation attention loaded.</div>';
        renderAttentionFocusDetail();
        updateControlRoom();
        return;
      }
      if (state.attentionFocus) state.attentionFocus = items.find((item) => item.directive_id === state.attentionFocus.directive_id) || state.attentionFocus;
      el('attentionQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.attentionFocus?.directive_id === item.directive_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.status + ' ' + item.directive_id;
        const meta = document.createElement('span');
        meta.textContent = [item.reason, item.operation_id, item.carrier_session_id, item.visibility, item.resolving_task_id].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectAttentionItem(item));
        node.append(title, meta);
        return node;
      }));
      renderAttentionFocusDetail();
      updateControlRoom();
    }
    function attentionFocusContext(item = {}) {
      const followUp = item.status === 'resolved'
        ? 'inspect_evidence'
        : item.resolving_task_id
          ? 'inspect_resolving_task'
          : 'create_or_select_resolution_task';
      return [
        ['Directive', item.directive_id || 'none'],
        ['Status', item.status || 'unknown'],
        ['Reason', item.reason || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Session', item.carrier_session_id || 'none'],
        ['Visibility', item.visibility || 'unknown'],
        ['Input Event', item.input_event_id || 'none'],
        ['Sequence', item.sequence ?? 'none'],
        ['Resolving Task', item.resolving_task_id || 'none'],
        ['Follow Up', followUp],
        ['Target', item.target ? JSON.stringify(item.target) : 'none'],
      ];
    }
    function renderAttentionFocusDetail(item = state.attentionFocus) {
      if (!item) {
        el('attentionFocusDetail').innerHTML = '<div class="empty">No attention item selected.</div>';
        return;
      }
      el('attentionFocusDetail').replaceChildren(
        ...attentionFocusContext(item).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('attentionFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_id === item.directive_id)),
          focusActionButton('attentionFocusTaskAction', 'Task From Attention', () => run(createTaskFromFocusedAttention)),
          focusActionButton('attentionFocusResolveAction', 'Resolve Attention', () => run(resolveFocusedAttention)),
        ),
      );
    }
    function renderAuthorityState(product = {}) {
      const decisions = product.site_authority?.decisions || [];
      if (decisions.length === 0) {
        state.authorityFocus = null;
        el('authorityState').innerHTML = '<div class="empty">No authority state loaded.</div>';
        renderAuthorityDecisionQueue(decisions, product);
        renderAuthorityPostureSummary(decisions);
        renderAuthorityFocusDetail();
        renderAuthorityPath(product);
        renderAuthorityDecisionControl(null, product);
        updateControlRoom();
        return;
      }
      if (!state.authorityFocus) state.authorityFocus = decisions[0];
      state.authorityFocus = decisions.find((decision) => authorityDecisionKey(decision) === authorityDecisionKey(state.authorityFocus)) || state.authorityFocus;
      el('authorityState').replaceChildren(...decisions.map((decision) => {
        const node = document.createElement('article');
        node.className = 'authority-decision ' + (decision.action || 'unknown') + (authorityDecisionKey(decision) === authorityDecisionKey(state.authorityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [decision.action || 'unknown', decision.mutation_class || 'mutation'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = authorityRouteSummary(decision);
        node.addEventListener('click', () => selectAuthorityDecision(decision));
        node.append(title, meta);
        return node;
      }));
      renderAuthorityDecisionQueue(decisions, product);
      renderAuthorityPostureSummary(decisions);
      renderAuthorityFocusDetail();
      renderAuthorityPath(product);
      renderAuthorityDecisionControl(state.authorityFocus, product);
      updateControlRoom();
    }
    function authorityPostureSummary(decisions = []) {
      const counts = decisions.reduce((next, decision) => {
        const action = String(decision.action || '').toLowerCase();
        if (action === 'admit') next.admit += 1;
        else if (action === 'refuse' || action === 'deny') next.refuse += 1;
        else next.other += 1;
        if (!decision.authority_locus || decision.authority_locus === 'unresolved') next.unresolved += 1;
        const locus = decision.authority_locus || 'unresolved';
        next.loci.set(locus, (next.loci.get(locus) || 0) + 1);
        return next;
      }, { admit: 0, refuse: 0, other: 0, unresolved: 0, loci: new Map() });
      const dominantLocus = [...counts.loci.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'none';
      const nextAction = decisions.length === 0 ? 'read_site_authority'
        : counts.refuse > 0 ? 'inspect_refusals'
        : counts.unresolved > 0 ? 'resolve_authority_locus'
        : 'monitor_admissions';
      return [
        ['Admitted', counts.admit],
        ['Refused', counts.refuse],
        ['Other', counts.other],
        ['Unresolved Locus', counts.unresolved],
        ['Dominant Locus', dominantLocus],
        ['Next Action', nextAction],
      ];
    }
    function renderAuthorityPostureSummary(decisions = []) {
      if (!decisions.length) {
        el('authorityPostureSummary').innerHTML = '<div class="empty">No authority posture loaded.</div>';
        return;
      }
      el('authorityPostureSummary').replaceChildren(...authorityPostureSummary(decisions).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityDecisionEvidenceEvents(decision = {}, product = state.operationProduct || {}) {
      const tokens = [decision.mutation_class, decision.reason, decision.authority_locus, decision.controlled_action].filter(Boolean);
      return authorityEvidenceEvents(product).filter((event) => {
        const text = JSON.stringify(event.payload || {});
        return tokens.length === 0 || tokens.some((token) => text.includes(token));
      });
    }
    function authorityDecisionQueueItems(decisions = [], product = state.operationProduct || {}) {
      return decisions.map((decision) => {
        const evidenceCount = authorityDecisionEvidenceEvents(decision, product).length;
        const action = String(decision.action || '').toLowerCase();
        const unresolved = !decision.authority_locus || decision.authority_locus === 'unresolved';
        const refused = action === 'refuse' || action === 'deny';
        const status = refused || unresolved || evidenceCount === 0 ? 'needs_attention' : 'ready';
        const nextAction = refused ? 'inspect_refused_authority'
          : unresolved ? 'resolve_authority_locus'
          : evidenceCount === 0 ? 'focus_authority_evidence'
          : 'monitor_authority_admission';
        return { decision, evidence_count: evidenceCount, status, next_action: nextAction };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.decision.action !== right.decision.action) return String(right.decision.action || '').localeCompare(String(left.decision.action || ''));
        return authorityDecisionKey(left.decision).localeCompare(authorityDecisionKey(right.decision));
      });
    }
    function authorityDecisionQueueButtonId(decision, suffix) {
      return ['authorityDecisionQueue', authorityDecisionKey(decision) || 'decision', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderAuthorityDecisionQueue(decisions = [], product = state.operationProduct || {}) {
      if (!decisions.length) {
        el('authorityDecisionQueue').innerHTML = '<div class="empty">No authority decisions loaded.</div>';
        return;
      }
      const items = authorityDecisionQueueItems(decisions, product);
      el('authorityDecisionQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (authorityDecisionKey(item.decision) === authorityDecisionKey(state.authorityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.decision.action || 'unknown', item.decision.mutation_class || 'mutation'].join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.next_action, item.decision.authority_locus || 'unresolved', item.decision.controlled_action || 'none', String(item.evidence_count) + ' evidence'].join(' | ');
        node.addEventListener('click', () => selectAuthorityDecision(item.decision));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(authorityDecisionQueueButtonId(item.decision, 'focus'), 'Focus', () => selectAuthorityDecision(item.decision)),
            focusActionButton(authorityDecisionQueueButtonId(item.decision, 'evidence'), 'Evidence', () => { selectAuthorityDecision(item.decision); focusAuthorityEvidence(); }),
          ),
        );
        return node;
      }));
    }
    function authorityDecisionKey(decision = {}) {
      return [decision.mutation_class, decision.action, decision.reason, decision.authority_locus].filter(Boolean).join('|');
    }
    function authorityActorMembership(product = state.operationProduct || {}) {
      const principalId = state.operatorPrincipal?.principal_id || product.reader_principal?.principal_id || '';
      return currentMemberships(product).find((membership) => membership.principal_id === principalId || membership.email === state.operatorPrincipal?.email) || product.membership || null;
    }
    function authorityActionContext(product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      const membership = authorityActorMembership(product);
      const refused = decisions.filter((decision) => ['refuse', 'deny'].includes(String(decision.action || '').toLowerCase()));
      const unresolved = decisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved');
      const evidenceLoaded = state.events.some((event) => classifyEvidenceLane(event) === 'authority')
        || (product.authority_events || []).length > 0
        || (product.carrier_evidence || []).some((entry) => (entry.events || []).some((event) => classifyEvidenceLane(event) === 'authority'));
      const command = classifyCloudflareAuthorityCommandState({
        decision_count: decisions.length,
        refusal_count: refused.length,
        unresolved_locus_count: unresolved.length,
        evidence_loaded: evidenceLoaded,
      });
      return [
        ['Authority Loaded', decisions.length > 0 ? 'yes' : 'no'],
        ['Focused Decision', focused ? authorityDecisionKey(focused) || focused.mutation_class || 'authority' : 'none'],
        ['Decision Action', focused?.action || 'none'],
        ['Actor Membership', membership ? [membership.role || 'unknown', membership.status || 'unknown'].join(' / ') : 'none'],
        ['Authority Locus', focused?.authority_locus || 'unresolved'],
        ['Controlled Action', focused?.controlled_action || 'none'],
        ['Refusals', refused.length],
        ['Unresolved Locus', unresolved.length],
        ['Evidence Loaded', evidenceLoaded ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderAuthorityActionSummary(product = state.operationProduct || {}) {
      el('authorityActionSummary').replaceChildren(...authorityActionContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityEvidenceEvents(product = state.operationProduct || {}) {
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (classifyEvidenceLane(event) !== 'authority') return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function authorityPathContext(product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      const membership = authorityActorMembership(product);
      const evidenceEvents = authorityEvidenceEvents(product);
      const refused = decisions.filter((decision) => ['refuse', 'deny'].includes(String(decision.action || '').toLowerCase()));
      const unresolved = decisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved');
      const nextAction = decisions.length === 0 ? 'read_site_authority'
        : refused.length > 0 ? 'inspect_refused_authority'
        : unresolved.length > 0 ? 'resolve_authority_locus'
        : evidenceEvents.length > 0 ? 'monitor_authority_admissions' : 'focus_authority_evidence';
      return [
        ['Operator', state.operatorPrincipal?.email || state.operatorPrincipal?.principal_id || product.reader_principal?.email || product.reader_principal?.principal_id || 'anonymous'],
        ['Actor Membership', membership ? [membership.role || 'unknown', membership.status || 'unknown'].join(' / ') : 'none'],
        ['Focused Decision', focused ? authorityDecisionKey(focused) || focused.mutation_class || 'authority' : 'none'],
        ['Decision Action', focused?.action || 'none'],
        ['Authority Locus', focused?.authority_locus || 'unresolved'],
        ['Controlled Action', focused?.controlled_action || 'none'],
        ['Decisions', String(decisions.length)],
        ['Refusals', String(refused.length)],
        ['Unresolved Locus', String(unresolved.length)],
        ['Authority Evidence Events', String(evidenceEvents.length)],
        ['Dominant Locus', contextValue(authorityPostureSummary(decisions), 'Dominant Locus') || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderAuthorityPath(product = state.operationProduct || {}) {
      const target = el('authorityPath');
      if (!target) return;
      target.replaceChildren(...authorityPathContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityDecisionControlContext(decision = state.authorityFocus, product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = decision || decisions.find((entry) => entry.action !== 'admit') || decisions[0] || null;
      if (!focused) return [];
      const evidenceEvents = authorityDecisionEvidenceEvents(focused, product);
      const action = String(focused.action || '').toLowerCase();
      const refused = action === 'refuse' || action === 'deny';
      const unresolved = !focused.authority_locus || focused.authority_locus === 'unresolved';
      const reviewAction = refused ? 'review_refused_authority'
        : unresolved ? 'review_unresolved_locus'
        : evidenceEvents.length === 0 ? 'load_decision_evidence'
        : 'monitor_authority_admission';
      return [
        ['Decision', authorityDecisionKey(focused) || focused.mutation_class || 'authority'],
        ['Decision Action', focused.action || 'unknown'],
        ['Mutation', focused.mutation_class || 'unknown'],
        ['Reason', focused.reason || 'none'],
        ['Authority Locus', focused.authority_locus || 'unresolved'],
        ['Controlled Action', focused.controlled_action || 'none'],
        ['Evidence Events', String(evidenceEvents.length)],
        ['Review State', refused || unresolved || evidenceEvents.length === 0 ? 'needs_attention' : 'ready'],
        ['Review Action', reviewAction],
      ];
    }
    function renderAuthorityDecisionControl(decision = state.authorityFocus, product = state.operationProduct || {}) {
      const context = authorityDecisionControlContext(decision, product);
      if (!context.length) {
        el('authorityDecisionControl').innerHTML = '<div class="empty">No authority decision control loaded.</div>';
        return;
      }
      el('authorityDecisionControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    function applyAuthorityDecisionReview() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      const decision = state.authorityFocus || decisions.find((entry) => entry.action !== 'admit') || decisions[0] || null;
      if (!decision) { run(refreshSiteProduct); return; }
      selectAuthorityDecision(decision);
      const reviewAction = contextValue(authorityDecisionControlContext(decision, product), 'Review Action');
      if (reviewAction === 'load_decision_evidence') { run(refreshSiteProduct); return; }
      focusAuthorityEvidence();
    }
    function focusAuthorityPathDecision() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      const target = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      if (target) selectAuthorityDecision(target);
    }
    function refreshAuthorityPath() {
      run(refreshSiteProduct);
    }
    function focusAuthorityEvidence() {
      const decision = state.authorityFocus || (state.operationProduct?.site_authority?.decisions || [])[0] || null;
      if (decision) {
        focusEvidenceFor((event) => JSON.stringify(event.payload || {}).includes(decision.mutation_class || '') || JSON.stringify(event.payload || {}).includes(decision.reason || '') || classifyEvidenceLane(event) === 'authority');
        return;
      }
      focusEvidenceFor((event) => classifyEvidenceLane(event) === 'authority');
    }
    function applyAuthorityNextAction() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      if (decisions.length === 0) { run(refreshSiteProduct); return; }
      const target = decisions.find((decision) => decision.action !== 'admit') || state.authorityFocus || decisions[0];
      if (target) selectAuthorityDecision(target);
      focusAuthorityEvidence();
    }
    function selectAuthorityDecision(decision) {
      if (!decision) return;
      state.authorityFocus = decision;
      focusAuthorityEvidence();
      renderAuthorityState(state.operationProduct || {});
      renderAuthorityPath(state.operationProduct || {});
      renderAuthorityDecisionControl(decision, state.operationProduct || {});
      updateControlRoom();
    }
    function authorityDecisionContext(decision = {}) {
      const followUp = decision.action === 'admit'
        ? 'inspect_admission_evidence'
        : decision.authority_locus
          ? 'inspect_authority_locus'
          : 'resolve_authority_locus';
      return [
        ['Action', decision.action || 'unknown'],
        ['Mutation', decision.mutation_class || 'unknown'],
        ['Reason', decision.reason || 'none'],
        ['Authority Locus', decision.authority_locus || 'unresolved'],
        ['Locus Kind', decision.authority_locus_kind || 'unknown'],
        ['Controlled Action', decision.controlled_action || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderAuthorityFocusDetail() {
      if (!state.authorityFocus) {
        el('authorityFocusDetail').innerHTML = '<div class="empty">No authority decision selected.</div>';
        renderAuthorityDecisionControl();
        return;
      }
      renderAuthorityDecisionControl(state.authorityFocus, state.operationProduct || {});
      el('authorityFocusDetail').replaceChildren(
        ...authorityDecisionContext(state.authorityFocus).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('authorityFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => JSON.stringify(event.payload || {}).includes(state.authorityFocus.mutation_class || '') || JSON.stringify(event.payload || {}).includes(state.authorityFocus.reason || ''))),
        ),
      );
    }
    async function selectOperation(operation) {
      if (!operation?.operation_id) return;
      setCurrentOperation(operation.operation_id);
      await refreshOperation();
    }
    function focusedOperation() {
      const activeOperation = el('operationId').value.trim();
      return state.operationFocus
        || (state.operations || []).find((operation) => operation.operation_id === activeOperation)
        || (state.operationProduct?.operation?.operation_id === activeOperation ? state.operationProduct.operation : null)
        || (activeOperation ? { operation_id: activeOperation } : null);
    }
    function operationScopeLoaded(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      return Boolean(operationId && state.productScope === 'operation' && state.operationProduct?.operation?.operation_id === operationId);
    }
    function operationEvidenceLoaded(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return false;
      return (state.operationProduct?.carrier_evidence || []).some((entry) => (entry.events || []).length > 0)
        || state.events.some((event) => (event.payload?.operation_id || event.payload?.target?.id || state.operationProduct?.operation?.operation_id) === operationId);
    }
    function operationActionContext(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim() || '';
      const isActive = operationId && operationId === el('operationId').value.trim();
      const scopeLoaded = operationScopeLoaded(operation);
      const sessionCount = scopeLoaded ? (state.operationProduct?.sessions || []).length : 0;
      const evidenceLoaded = operationEvidenceLoaded(operation);
      const path = Object.fromEntries(operationPathContext(operation, state.operationProduct || {}));
      const command = classifyCloudflareOperationCommandState({
        operation_id: operationId,
        is_active: Boolean(isActive),
        scope_loaded: scopeLoaded,
        session_count: sessionCount,
        evidence_loaded: evidenceLoaded,
        operation_path_next_action: path['Next Action'] || 'read_operation_scope',
      });
      return [
        ['Operation', operationId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', operation?.status || state.operationProduct?.operation?.status || 'unknown'],
        ['Kind', operation?.operation_kind || state.operationProduct?.operation?.operation_kind || 'unknown'],
        ['Scope Loaded', scopeLoaded ? 'yes' : 'no'],
        ['Sessions', sessionCount],
        ['Open Tasks', path['Open Tasks'] || '0'],
        ['Attention', path.Attention || '0 open / 0 total'],
        ['Authority Decisions', path['Authority Decisions'] || '0'],
        ['Evidence Loaded', evidenceLoaded ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function applyOperationCommandAction() {
      const product = state.operationProduct || {};
      const commandAction = String(contextValue(operationActionContext(focusedOperation()), 'Command Action'));
      if (commandAction === 'read_operation_scope') { run(refreshOperation); return; }
      if (commandAction === 'start_or_select_session') { focusOperationPathSession(); return; }
      if (commandAction === 'inspect_attention') { focusOperationPathAttention(); return; }
      if (commandAction === 'inspect_open_task') { focusOperationPathTask(); return; }
      if (commandAction === 'inspect_operation_evidence' || commandAction === 'read_operation_evidence') { focusOperationPathEvidence(); return; }
      if (String(contextValue(authorityPathContext(product), 'Next Action')) !== 'monitor_authority_admissions') { focusOperationPathAuthority(); return; }
      focusOperationPathEvidence();
    }
    function renderOperationActionSummary(operation = focusedOperation()) {
      if (!operation) {
        el('operationActionSummary').innerHTML = '<div class="empty">No operation action loaded.</div>';
        return;
      }
      el('operationActionSummary').replaceChildren(
        ...operationActionContext(operation).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('operationCommandNextAction', 'Run Operation Command', applyOperationCommandAction),
          focusActionButton('operationCommandSessionAction', 'Focus Operation Session', focusOperationPathSession),
          focusActionButton('operationCommandTaskAction', 'Focus Operation Task', focusOperationPathTask),
          focusActionButton('operationCommandAuthorityAction', 'Focus Operation Authority', focusOperationPathAuthority),
          focusActionButton('operationCommandEvidenceAction', 'Focus Operation Evidence', focusOperationPathEvidence),
        ),
      );
    }
    function useFocusedOperation() {
      const operation = focusedOperation();
      if (operation?.operation_id) run(() => selectOperation(operation));
    }
    function focusOperationSession() {
      const targets = operationFlightDeckTargets();
      if (targets.session) selectOperationSession(targets.session);
    }
    function renderOperationNavigator(operations = []) {
      state.operations = operations;
      if (operations.length === 0) {
        state.operationFocus = null;
        el('operationNavigator').innerHTML = '<div class="empty">No site operations loaded.</div>';
        renderOperationWorkQueue(operations);
        renderOperationActionSummary();
        renderOperationFocusDetail();
        renderOperationPath();
        updateControlRoom();
        return;
      }
      const activeOperation = el('operationId').value.trim();
      state.operationFocus = operations.find((operation) => operation.operation_id === activeOperation) || null;
      el('operationNavigator').replaceChildren(...operations.map((operation) => {
        const node = document.createElement('article');
        node.className = 'operation-item' + (operation.operation_id === activeOperation ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = operation.operation_id;
        const meta = document.createElement('span');
        meta.textContent = [operation.status || 'unknown', operation.operation_kind, operation.display_name].filter(Boolean).join(' | ');
        node.addEventListener('click', () => run(() => selectOperation(operation)));
        node.append(title, meta);
        return node;
      }));
      renderOperationWorkQueue(operations);
      renderOperationActionSummary();
      renderOperationFocusDetail();
      renderOperationPath();
      updateControlRoom();
    }
    function operationWorkQueueItems(operations = state.operations || [], product = state.operationProduct || {}) {
      return operations.map((operation) => {
        const path = Object.fromEntries(operationPathContext(operation, product));
        const scopeLoaded = operationScopeLoaded(operation);
        const evidenceLoaded = operationEvidenceLoaded(operation);
        const command = classifyCloudflareOperationCommandState({
          operation_id: operation.operation_id || '',
          is_active: operation.operation_id === el('operationId').value.trim(),
          scope_loaded: scopeLoaded,
          session_count: Number(path.Sessions || 0) || 0,
          evidence_loaded: evidenceLoaded,
          operation_path_next_action: path['Next Action'] || 'read_operation_scope',
        });
        const ready = ['inspect_operation_evidence', 'evidence_ready'].includes(command.next_action) || command.command_state === 'evidence_ready';
        return { operation, command, path, status: ready ? 'ready' : 'needs_attention' };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.operation.operation_id === el('operationId').value.trim()) return -1;
        if (right.operation.operation_id === el('operationId').value.trim()) return 1;
        return String(right.operation.updated_at || '').localeCompare(String(left.operation.updated_at || ''));
      });
    }
    function operationWorkQueueButtonId(operation, suffix) {
      return ['operationWorkQueue', operation.operation_id || 'operation', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderOperationWorkQueue(operations = state.operations || [], product = state.operationProduct || {}) {
      if (!operations.length) {
        el('operationWorkQueue').innerHTML = '<div class="empty">No operation work loaded.</div>';
        return;
      }
      const items = operationWorkQueueItems(operations, product);
      el('operationWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.operation.operation_id === el('operationId').value.trim() ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.operation.operation_id || 'unknown operation';
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.command.command_state, item.command.next_action, (item.path.Sessions || '0') + ' sessions', (item.path['Open Tasks'] || '0') + ' open tasks', item.path.Attention || '0 open / 0 total'].join(' | ');
        node.addEventListener('click', () => run(() => selectOperation(item.operation)));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(operationWorkQueueButtonId(item.operation, 'use'), 'Use', () => run(() => selectOperation(item.operation))),
            focusActionButton(operationWorkQueueButtonId(item.operation, 'session'), 'Session', () => { state.operationFocus = item.operation; focusOperationPathSession(); }),
            focusActionButton(operationWorkQueueButtonId(item.operation, 'evidence'), 'Evidence', () => { state.operationFocus = item.operation; focusOperationPathEvidence(); }),
          ),
        );
        return node;
      }));
    }
    function operationFocusContext(operation = {}) {
      return [
        ['Operation', operation.operation_id || el('operationId').value.trim() || 'none'],
        ['Display Name', operation.display_name || 'none'],
        ['Kind', operation.operation_kind || 'unknown'],
        ['Status', operation.status || 'unknown'],
        ['Site', operation.site_id || el('siteId').value.trim() || 'none'],
        ['Created', operation.created_at || 'none'],
        ['Updated', operation.updated_at || 'none'],
      ];
    }
    function renderOperationFocusDetail(operation = state.operationFocus) {
      if (!operation) {
        el('operationFocusDetail').innerHTML = '<div class="empty">No operation selected.</div>';
        return;
      }
      el('operationFocusDetail').replaceChildren(...operationFocusContext(operation).map(([label, value]) => evidenceField(label, value)));
    }
    function operationEvents(operation = focusedOperation(), product = state.operationProduct || {}) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return [];
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        const eventOperationId = event.payload?.operation_id || event.payload?.target?.id || product.operation?.operation_id || '';
        if (eventOperationId !== operationId) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function operationTasks(operation = focusedOperation(), product = state.operationProduct || {}) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return [];
      return (product.tasks || []).filter((task) => task.operation_id === operationId || task.site_id === (product.site?.site_id || el('siteId').value.trim()));
    }
    function operationPathContext(operation = focusedOperation(), product = state.operationProduct || {}) {
      if (!operation) return [];
      const operationId = operation.operation_id || el('operationId').value.trim();
      const sessions = (product.sessions || []).filter((session) => !session.operation_id || session.operation_id === operationId);
      const tasks = operationTasks(operation, product);
      const events = operationEvents(operation, product);
      const attention = extractOperationAttention(product).filter((item) => !item.operation_id || item.operation_id === operationId);
      const authorityDecisions = product.site_authority?.decisions || [];
      const openTasks = tasks.filter((task) => taskLifecycleStatus(task) === 'open');
      const openAttention = attention.filter((item) => item.status !== 'resolved');
      const nextAction = !operationId ? 'select_or_create_operation'
        : state.productScope !== 'operation' ? 'read_operation_scope'
        : sessions.length === 0 ? 'start_or_select_session'
        : openAttention.length > 0 ? 'inspect_attention'
        : openTasks.length > 0 ? 'inspect_open_task'
        : events.length > 0 ? 'inspect_operation_evidence' : 'read_operation_evidence';
      return [
        ['Operation', operationId || 'none'],
        ['Scope', state.productScope],
        ['Status', operation.status || product.operation?.status || 'unknown'],
        ['Sessions', String(sessions.length)],
        ['Tasks', String(tasks.length)],
        ['Open Tasks', String(openTasks.length)],
        ['Attention', String(openAttention.length) + ' open / ' + String(attention.length) + ' total'],
        ['Evidence Events', String(events.length)],
        ['Authority Decisions', String(authorityDecisions.length)],
        ['Focused Session', state.sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Focused Task', state.taskFocus?.task_id || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderOperationPath(operation = focusedOperation(), product = state.operationProduct || {}) {
      const target = el('operationPath');
      if (!target) return;
      if (!operation) {
        target.innerHTML = '<div class="empty">No operation path loaded.</div>';
        return;
      }
      target.replaceChildren(...operationPathContext(operation, product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusOperationPathSession() {
      const targets = operationFlightDeckTargets();
      if (targets.session) selectOperationSession(targets.session);
    }
    function focusOperationPathTask() {
      const task = operationTasks(focusedOperation()).find((entry) => taskLifecycleStatus(entry) === 'open') || operationTasks(focusedOperation())[0] || null;
      if (task) selectTask(task);
    }
    function focusOperationPathAttention() {
      const attention = extractOperationAttention(state.operationProduct || {}).find((item) => item.status !== 'resolved') || state.attentionItems[0] || null;
      if (attention) selectAttentionItem(attention);
    }
    function focusOperationPathAuthority() {
      focusAuthorityPathDecision();
    }
    function focusOperationPathEvidence() {
      const operationId = focusedOperation()?.operation_id || el('operationId').value.trim();
      focusEvidenceFor((event) => (event.payload?.operation_id || event.payload?.target?.id || state.operationProduct?.operation?.operation_id) === operationId);
    }
    function selectOperationSession(session) {
      if (!session?.carrier_session_id) return;
      state.sessionFocus = session;
      setCurrentSession(session.carrier_session_id);
      focusEvidenceFor((event) => event.carrier_session_id === session.carrier_session_id);
      renderSessionActionSummary(session);
      renderSessionEvidencePath(session);
      updateControlRoom();
    }
    function renderSessionNavigator(sessions = []) {
      if (sessions.length === 0) {
        state.sessionFocus = null;
        el('sessionNavigator').innerHTML = '<div class="empty">No operation sessions loaded.</div>';
        renderSessionWorkQueue(sessions);
        renderSessionActionSummary();
        renderSessionFocusDetail();
        renderSessionEvidencePath();
        updateControlRoom();
        return;
      }
      const activeSession = el('sessionId').value.trim();
      state.sessionFocus = sessions.find((session) => session.carrier_session_id === activeSession) || null;
      el('sessionNavigator').replaceChildren(...sessions.map((session) => {
        const node = document.createElement('article');
        node.className = 'session-item' + (session.carrier_session_id === activeSession ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = session.carrier_session_id;
        const meta = document.createElement('span');
        meta.textContent = [session.binding_status || 'active', session.agent_id, session.operation_id].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectOperationSession(session));
        node.append(title, meta);
        return node;
      }));
      renderSessionWorkQueue(sessions);
      renderSessionActionSummary();
      renderSessionFocusDetail();
      renderSessionEvidencePath();
      updateControlRoom();
    }
    function sessionWorkQueueItems(sessions = state.operationProduct?.sessions || [], product = state.operationProduct || {}) {
      return sessions.map((session) => {
        const events = sessionEvidenceEvents(session, product);
        const tasks = sessionTasks(session, product);
        const openTasks = tasks.filter((task) => taskLifecycleStatus(task) === 'open');
        const failures = events.filter((event) => classifyEvidenceLane(event) === 'failures');
        const delivery = directiveDeliveryForSession(session, product);
        const command = classifyCloudflareSessionCommandState({
          session_id: session.carrier_session_id || '',
          is_active: session.carrier_session_id === el('sessionId').value.trim(),
          evidence_loaded: events.length > 0,
        });
        const ready = events.length > 0 && failures.length === 0 && openTasks.length === 0;
        const nextAction = events.length === 0 ? 'read_session_evidence'
          : failures.length > 0 ? 'inspect_session_failures'
          : openTasks.length > 0 ? 'inspect_open_task'
          : delivery ? 'inspect_directive_delivery'
          : command.next_action;
        return { session, command, events, tasks, open_tasks: openTasks, failures, delivery, status: ready ? 'ready' : 'needs_attention', next_action: nextAction };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.open_tasks.length !== right.open_tasks.length) return right.open_tasks.length - left.open_tasks.length;
        return String(right.session.updated_at || '').localeCompare(String(left.session.updated_at || ''));
      });
    }
    function sessionWorkQueueButtonId(session, suffix) {
      return ['sessionWorkQueue', session.carrier_session_id || 'session', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderSessionWorkQueue(sessions = state.operationProduct?.sessions || [], product = state.operationProduct || {}) {
      if (!sessions.length) {
        el('sessionWorkQueue').innerHTML = '<div class="empty">No session work loaded.</div>';
        return;
      }
      const items = sessionWorkQueueItems(sessions, product);
      el('sessionWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.session.carrier_session_id === el('sessionId').value.trim() ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.session.carrier_session_id || 'unknown session';
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.command.command_state, item.next_action, String(item.events.length) + ' events', String(item.open_tasks.length) + ' open tasks', item.delivery?.delivery_state || 'no delivery'].join(' | ');
        node.addEventListener('click', () => selectOperationSession(item.session));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(sessionWorkQueueButtonId(item.session, 'use'), 'Use', () => selectOperationSession(item.session)),
            focusActionButton(sessionWorkQueueButtonId(item.session, 'evidence'), 'Evidence', () => { selectOperationSession(item.session); focusFocusedSessionEvidence(); }),
            focusActionButton(sessionWorkQueueButtonId(item.session, 'task'), 'Task', () => { selectOperationSession(item.session); focusSessionPathTask(); }),
          ),
        );
        return node;
      }));
    }
    function focusedSession() {
      const activeSession = el('sessionId').value.trim();
      return state.sessionFocus
        || (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === activeSession)
        || (activeSession ? { carrier_session_id: activeSession } : null);
    }
    function sessionEvidenceLoaded(session = focusedSession()) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return false;
      return state.events.some((event) => event.carrier_session_id === sessionId)
        || (state.operationProduct?.carrier_evidence || []).some((entry) => entry.carrier_session_id === sessionId && (entry.events || []).length > 0);
    }
    function sessionActionContext(session = focusedSession()) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim() || '';
      const isActive = sessionId && sessionId === el('sessionId').value.trim();
      const hasEvidence = sessionEvidenceLoaded(session);
      const command = classifyCloudflareSessionCommandState({
        session_id: sessionId,
        is_active: Boolean(isActive),
        evidence_loaded: hasEvidence,
      });
      return [
        ['Session', sessionId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', session?.binding_status || session?.status || 'active'],
        ['Agent', session?.agent_id || 'none'],
        ['Operation', session?.operation_id || el('operationId').value.trim() || 'none'],
        ['Evidence Loaded', hasEvidence ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderSessionActionSummary(session = focusedSession()) {
      if (!session) {
        el('sessionActionSummary').innerHTML = '<div class="empty">No session action loaded.</div>';
        renderSessionEvidenceControl();
        return;
      }
      el('sessionActionSummary').replaceChildren(...sessionActionContext(session).map(([label, value]) => evidenceField(label, value)));
      renderSessionEvidenceControl(session);
    }
    function useFocusedSession() {
      const session = focusedSession();
      if (session?.carrier_session_id) selectOperationSession(session);
    }
    function focusFocusedSessionEvidence() {
      const session = focusedSession();
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (sessionId) focusEvidenceFor((event) => event.carrier_session_id === sessionId);
    }
    function sessionFocusContext(session = {}) {
      const currentSession = session.carrier_session_id || el('sessionId').value.trim() || '';
      const hasEvidence = state.events.some((event) => event.carrier_session_id === currentSession)
        || (state.operationProduct?.carrier_evidence || []).some((entry) => entry.carrier_session_id === currentSession && (entry.events || []).length > 0);
      const followUp = currentSession
        ? (hasEvidence ? 'inspect_session_evidence' : 'read_session_evidence')
        : 'select_or_start_session';
      return [
        ['Session', currentSession || 'none'],
        ['Status', session.binding_status || session.status || 'active'],
        ['Agent', session.agent_id || 'none'],
        ['Operation', session.operation_id || el('operationId').value.trim() || 'none'],
        ['Site', session.site_id || el('siteId').value.trim() || 'none'],
        ['Site Ref', session.site_ref || 'none'],
        ['Site Root', session.site_root || 'none'],
        ['Started', session.started_at || session.created_at || 'none'],
        ['Updated', session.updated_at || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderSessionFocusDetail(session = state.sessionFocus) {
      if (!session) {
        el('sessionFocusDetail').innerHTML = '<div class="empty">No session selected.</div>';
        renderSessionEvidenceControl();
        return;
      }
      renderSessionEvidenceControl(session);
      el('sessionFocusDetail').replaceChildren(
        ...sessionFocusContext(session).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('sessionFocusReadEvidenceAction', 'Read Evidence', () => run(readSelectedSessionEvidence)),
          focusActionButton('sessionFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => event.carrier_session_id === (session.carrier_session_id || el('sessionId').value.trim()))),
        ),
      );
    }
    function sessionEvidenceEvents(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return [];
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (event.carrier_session_id !== sessionId) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function sessionTasks(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return [];
      return (product.tasks || []).filter((task) => task.carrier_session_id === sessionId || taskEvidenceEvents(task, product).some((event) => event.carrier_session_id === sessionId));
    }
    function directiveDeliveryForSession(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return null;
      return (product.webhook_delay_directive_deliveries || []).find((delivery) => delivery.carrier_session_id === sessionId) || null;
    }
    function sessionEvidencePathContext(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) return [];
      const sessionId = session.carrier_session_id || el('sessionId').value.trim();
      const events = sessionEvidenceEvents(session, product);
      const tasks = sessionTasks(session, product);
      const delivery = directiveDeliveryForSession(session, product);
      const providerEvents = events.filter((event) => classifyEvidenceLane(event) === 'provider');
      const toolEvents = events.filter((event) => classifyEvidenceLane(event) === 'tools');
      const failureEvents = events.filter((event) => classifyEvidenceLane(event) === 'failures');
      const nextAction = !sessionId ? 'select_or_start_session'
        : events.length === 0 ? 'read_session_evidence'
        : failureEvents.length > 0 ? 'inspect_session_failures'
        : tasks.some((task) => taskLifecycleStatus(task) === 'open') ? 'inspect_open_task'
        : delivery ? 'inspect_directive_delivery' : 'monitor_session_evidence';
      return [
        ['Session', sessionId || 'none'],
        ['Events', String(events.length)],
        ['Provider Events', String(providerEvents.length)],
        ['Tool Events', String(toolEvents.length)],
        ['Failure Events', String(failureEvents.length)],
        ['Tasks', String(tasks.length)],
        ['Open Tasks', String(tasks.filter((task) => taskLifecycleStatus(task) === 'open').length)],
        ['Directive Delivery', delivery?.delivery_id || delivery?.directive_delivery_id || 'none'],
        ['Delivery State', delivery?.delivery_state || 'unknown'],
        ['Agent', session.agent_id || 'none'],
        ['Operation', session.operation_id || el('operationId').value.trim() || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderSessionEvidencePath(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) {
        el('sessionEvidencePath').innerHTML = '<div class="empty">No session evidence path loaded.</div>';
        renderSessionEvidenceControl();
        return;
      }
      el('sessionEvidencePath').replaceChildren(...sessionEvidencePathContext(session, product).map(([label, value]) => evidenceField(label, value)));
      renderSessionEvidenceControl(session, product);
    }
    function sessionEvidenceControlContext(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) return [];
      const path = Object.fromEntries(sessionEvidencePathContext(session, product));
      const events = Number(path.Events || 0);
      const failures = Number(path['Failure Events'] || 0);
      const openTasks = Number(path['Open Tasks'] || 0);
      const delivery = path['Directive Delivery'] || 'none';
      const nextAction = path['Next Action'] || 'select_or_start_session';
      const reviewAction = nextAction === 'read_session_evidence' ? 'read_session_evidence'
        : failures > 0 ? 'review_session_failures'
        : openTasks > 0 ? 'review_session_open_task'
        : delivery !== 'none' ? 'review_session_delivery'
        : 'monitor_session_evidence';
      return [
        ['Session', path.Session || session.carrier_session_id || 'none'],
        ['Events', String(events)],
        ['Provider Events', path['Provider Events'] || '0'],
        ['Tool Events', path['Tool Events'] || '0'],
        ['Failure Events', String(failures)],
        ['Open Tasks', String(openTasks)],
        ['Directive Delivery', delivery],
        ['Delivery State', path['Delivery State'] || 'unknown'],
        ['Next Action', nextAction],
        ['Review Action', reviewAction],
      ];
    }
    function renderSessionEvidenceControl(session = focusedSession(), product = state.operationProduct || {}) {
      const context = sessionEvidenceControlContext(session, product);
      if (!context.length) {
        el('sessionEvidenceControl').innerHTML = '<div class="empty">No session evidence control loaded.</div>';
        return;
      }
      el('sessionEvidenceControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    async function applySessionEvidenceAction() {
      const session = focusedSession();
      if (!session) return;
      useFocusedSession();
      const action = contextValue(sessionEvidenceControlContext(session), 'Review Action');
      if (action === 'read_session_evidence') { await readSelectedSessionEvidence(); return; }
      if (action === 'review_session_open_task') { focusSessionPathTask(); return; }
      if (action === 'review_session_delivery') { focusSessionPathDelivery(); return; }
      focusSessionPathEvidence();
    }
    function focusSessionPathEvidence() {
      focusFocusedSessionEvidence();
    }
    function focusSessionPathTask() {
      const task = sessionTasks(focusedSession()).find((entry) => taskLifecycleStatus(entry) === 'open') || sessionTasks(focusedSession())[0] || null;
      if (task) selectTask(task);
    }
    function focusSessionPathDelivery() {
      const delivery = directiveDeliveryForSession(focusedSession());
      if (delivery) selectWebhookDelayDirectiveDelivery(delivery);
    }
    function focusSessionPathChain() {
      focusSessionPathDelivery();
      renderWebhookDelayEvidenceChain();
    }
    function activeSessionDetail() {
      const activeSession = el('sessionId').value.trim();
      if (!activeSession) return null;
      return (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === activeSession)
        || (state.sessionFocus?.carrier_session_id === activeSession ? state.sessionFocus : null)
        || { carrier_session_id: activeSession };
    }
    function renderActiveSessionDetail(session = activeSessionDetail()) {
      if (!session) {
        el('activeSessionDetail').innerHTML = '<div class="empty">No active session loaded.</div>';
        return;
      }
      el('activeSessionDetail').replaceChildren(...sessionFocusContext(session).map(([label, value]) => evidenceField(label, value)));
    }
    async function readSelectedSessionEvidence() {
      state.events = [];
      state.afterSequence = 0;
      state.evidenceFocus = null;
      renderEvents();
      const body = await api.readSessionEvidence();
      appendEvents(body.events || []);
      if ((body.events || []).length > 0) focusEvidence(body.events[0]);
      renderSessionActionSummary();
      renderSessionEvidencePath();
      await refreshStatus();
    }
    function membershipKey(membership = {}) {
      return membership.principal_id || membership.email || membership.member_principal_id || '';
    }
    function selectMembership(membership) {
      if (!membership) return;
      state.membershipFocus = membership;
      if (membership.principal_id) el('memberPrincipalId').value = membership.principal_id;
      if (membership.role) el('memberRole').value = membership.role;
      renderMembershipNavigator(currentMemberships(state.operationProduct || {}));
      renderSiteActionSummary();
      renderMembershipActionSummary();
      updateControlRoom();
    }
    function currentMemberships(product = {}) {
      const memberships = product.memberships || [];
      if (memberships.length > 0) return memberships;
      return [product.membership].filter(Boolean);
    }
    function renderMembershipNavigator(memberships = []) {
      if (memberships.length === 0) {
        state.membershipFocus = null;
        el('membershipNavigator').innerHTML = '<div class="empty">No memberships loaded.</div>';
        renderSiteActionSummary();
        renderMembershipActionSummary();
        renderMembershipFocusDetail();
        return;
      }
      if (state.membershipFocus) state.membershipFocus = memberships.find((membership) => membershipKey(membership) === membershipKey(state.membershipFocus)) || state.membershipFocus;
      if (!state.membershipFocus) state.membershipFocus = memberships[0];
      el('membershipNavigator').replaceChildren(...memberships.map((membership) => {
        const node = document.createElement('article');
        node.className = 'membership-item' + (membershipKey(membership) === membershipKey(state.membershipFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = membership.principal_id || membership.email || 'unknown principal';
        const meta = document.createElement('span');
        meta.textContent = [membership.role || 'unknown', membership.status || 'unknown'].join(' | ');
        node.addEventListener('click', () => selectMembership(membership));
        node.append(title, meta);
        return node;
      }));
      renderSiteActionSummary();
      renderMembershipActionSummary();
      renderMembershipFocusDetail();
    }
    function focusedMembership() {
      const principalId = el('memberPrincipalId').value.trim();
      return state.membershipFocus
        || currentMemberships(state.operationProduct || {}).find((membership) => membershipKey(membership) === principalId || membership.principal_id === principalId)
        || (principalId ? { principal_id: principalId, role: el('memberRole').value.trim() || 'viewer' } : null);
    }
    function membershipAuthorityLoaded(membership = focusedMembership()) {
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim();
      if (!principal) return false;
      return (state.operationProduct?.authority_events || []).some((event) => JSON.stringify(event).includes(principal))
        || (state.operationProduct?.site_authority?.decisions || []).some((decision) => JSON.stringify(decision).includes(principal))
        || state.events.some((event) => classifyEvidenceLane(event) === 'authority' && JSON.stringify(event.payload || {}).includes(principal));
    }
    function membershipActionContext(membership = focusedMembership()) {
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim() || '';
      const role = membership?.role || el('memberRole').value.trim() || 'viewer';
      const status = membership?.status || 'unknown';
      const memberships = currentMemberships(state.operationProduct || {});
      const known = Boolean(principal && memberships.some((item) => membershipKey(item) === membershipKey(membership) || item.principal_id === principal || item.email === principal));
      const isOperator = principal && (principal === state.operatorPrincipal?.principal_id || principal === state.operatorPrincipal?.email);
      const siteLoaded = siteScopeLoaded();
      const authorityLoaded = membershipAuthorityLoaded(membership);
      const command = classifyCloudflareMembershipCommandState({
        principal,
        site_loaded: siteLoaded,
        known,
        status,
        authority_loaded: authorityLoaded,
      });
      return [
        ['Principal', principal || 'none'],
        ['Role', role || 'unknown'],
        ['Status', status],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Known Membership', known ? 'yes' : 'no'],
        ['Operator Principal', isOperator ? 'yes' : 'no'],
        ['Site Scope Loaded', siteLoaded ? 'yes' : 'no'],
        ['Authority Loaded', authorityLoaded ? 'yes' : 'no'],
        ['Next Action', command.next_action],
      ];
    }
    function renderMembershipActionSummary(membership = focusedMembership()) {
      if (!membership) {
        el('membershipActionSummary').innerHTML = '<div class="empty">No membership action loaded.</div>';
        return;
      }
      el('membershipActionSummary').replaceChildren(...membershipActionContext(membership).map(([label, value]) => evidenceField(label, value)));
    }
    async function putFocusedMembership() {
      const principalId = el('memberPrincipalId').value.trim();
      const role = el('memberRole').value.trim();
      if (!principalId || !role) return;
      const result = await api.putMembership(principalId, role);
      renderLastAuthority(null, {
        event_kind: 'site.membership.put',
        principal_id: result.principal?.principal_id || result.reader_principal?.principal_id || result.principal?.email,
        action: result.action,
        reason: result.action,
        evidence: {
          member_principal_id: result.membership?.principal_id,
          role: result.membership?.role,
          status: result.membership?.status,
          actor_role: result.actor_membership?.role,
        },
      });
      await refreshOperation();
    }
    function focusMembershipAuthority() {
      const membership = focusedMembership();
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim();
      if (!principal) { focusAuthorityEvidence(); return; }
      focusEvidenceFor((event) => classifyEvidenceLane(event) === 'authority' && JSON.stringify(event.payload || {}).includes(principal));
    }
    function membershipFocusContext(membership = {}) {
      return [
        ['Principal', membership.principal_id || membership.email || 'none'],
        ['Role', membership.role || 'unknown'],
        ['Status', membership.status || 'unknown'],
        ['Site', membership.site_id || el('siteId').value.trim() || 'none'],
        ['Created', membership.created_at || 'none'],
        ['Updated', membership.updated_at || 'none'],
      ];
    }
    function renderMembershipFocusDetail(membership = state.membershipFocus) {
      if (!membership) {
        el('membershipFocusDetail').innerHTML = '<div class="empty">No membership selected.</div>';
        renderMembershipActionSummary();
        return;
      }
      renderMembershipActionSummary(membership);
      el('membershipFocusDetail').replaceChildren(...membershipFocusContext(membership).map(([label, value]) => evidenceField(label, value)));
    }
    function renderTasks(tasks = []) {
      el('taskCount').textContent = String(tasks.length);
      if (tasks.length === 0) {
        state.taskFocus = null;
        el('tasks').innerHTML = '<div class="empty">No tasks yet.</div>';
        renderTaskWorkQueue(tasks);
        renderTaskLifecycleSummary(tasks);
        renderTaskFocusDetail();
        renderTaskEvidencePath();
        updateControlRoom();
        return;
      }
      if (state.taskFocus) state.taskFocus = tasks.find((task) => task.task_id === state.taskFocus.task_id) || state.taskFocus;
      el('tasks').replaceChildren(...tasks.map((task) => {
        const node = document.createElement('article');
        node.className = 'task' + (state.taskFocus?.task_id === task.task_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = task.task_id + ' ' + task.title;
        const meta = document.createElement('span');
        meta.textContent = [task.status, task.carrier_session_id, task.note].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectTask(task));
        node.append(title, meta);
        return node;
      }));
      renderTaskWorkQueue(tasks);
      renderTaskLifecycleSummary(tasks);
      renderTaskFocusDetail();
      renderTaskEvidencePath();
      renderTaskCommandPreview();
      updateControlRoom();
    }
    function taskWorkQueueItems(tasks = state.operationProduct?.tasks || []) {
      return tasks.map((task) => {
        const evidenceCount = taskEvidenceEvents(task).length;
        const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: evidenceCount });
        const ready = command.lifecycle === 'closed' && evidenceCount > 0;
        return {
          task,
          lifecycle: command.lifecycle,
          command_state: command.command_state,
          command_action: command.command_action,
          next_action: command.next_action,
          evidence_count: evidenceCount,
          status: ready ? 'ready' : 'needs_attention',
        };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.lifecycle !== right.lifecycle) return left.lifecycle === 'open' ? -1 : 1;
        return String(right.task.updated_at || '').localeCompare(String(left.task.updated_at || ''));
      });
    }
    function taskWorkQueueButtonId(task, suffix) {
      return ['taskWorkQueue', task.task_id || 'task', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderTaskWorkQueue(tasks = state.operationProduct?.tasks || []) {
      if (!tasks.length) {
        el('taskWorkQueue').innerHTML = '<div class="empty">No task work loaded.</div>';
        return;
      }
      const items = taskWorkQueueItems(tasks);
      el('taskWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.taskFocus?.task_id === item.task.task_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.task.task_id, item.task.title || 'untitled'].filter(Boolean).join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.lifecycle, item.command_state, item.next_action, String(item.evidence_count) + ' evidence'].join(' | ');
        node.addEventListener('click', () => selectTask(item.task));
        const markLabel = item.lifecycle === 'open' ? 'Mark Done' : 'Mark Open';
        const markStatus = item.lifecycle === 'open' ? 'done' : 'open';
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(taskWorkQueueButtonId(item.task, 'focus'), 'Focus', () => selectTask(item.task)),
            focusActionButton(taskWorkQueueButtonId(item.task, 'evidence'), 'Evidence', () => { selectTask(item.task); focusTaskPathEvidence(); }),
            focusActionButton(taskWorkQueueButtonId(item.task, 'mark'), markLabel, () => run(async () => { selectTask(item.task); await updateFocusedTask(markStatus, el('updateTaskNote').value.trim() || 'operator_route_task_queue'); })),
          ),
        );
        return node;
      }));
    }
    function taskCommandPreviewContext() {
      const newTitle = el('taskTitle').value.trim();
      const selectedTask = selectedTaskFromWorkbench();
      const status = el('updateTaskStatus').value.trim();
      const note = el('updateTaskNote').value.trim();
      const activeSession = el('sessionId').value.trim();
      const attention = selectedAttention();
      const directiveIntent = state.webhookDelayDirectiveFocus;
      const directiveDelivery = state.webhookDelayDirectiveDeliveryFocus;
      const directiveTask = taskForDirectiveIntent(directiveIntent);
      const command = newTitle
        ? '/task create ' + newTitle
        : selectedTask?.task_id && status
          ? ['/task update', selectedTask.task_id, status, note].filter(Boolean).join(' ')
          : 'none';
      const effect = newTitle
        ? 'create_task_for_operation'
        : selectedTask?.task_id && status
          ? 'update_task_lifecycle_state'
          : 'prepare_task_command';
      const followUp = newTitle
        ? 'create_then_select_task'
        : selectedTask?.task_id
          ? (taskLifecycleStatus(selectedTask) === 'open' ? 'mark_done_or_update' : 'inspect_task_evidence')
          : attention
            ? 'create_task_from_attention'
            : directiveIntent && !directiveTask
              ? 'create_task_from_directive_intent'
            : 'select_or_create_task';
      return [
        ['Command', command],
        ['Effect', effect],
        ['Task', selectedTask?.task_id || 'none'],
        ['Status', status || selectedTask?.status || 'none'],
        ['Session', selectedTask?.carrier_session_id || activeSession || 'none'],
        ['Attention', attention?.directive_id || 'none'],
        ['Directive Intent', directiveIntent?.directive_record_id || 'none'],
        ['Directive Delivery', directiveDelivery?.delivery_id || directiveDelivery?.directive_delivery_id || 'none'],
        ['Directive Delivery Session', directiveDelivery?.carrier_session_id || 'none'],
        ['Directive Task', directiveTask?.task_id || 'none'],
        ['Note', note || selectedTask?.note || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderTaskCommandPreview() {
      el('taskCommandPreview').replaceChildren(...taskCommandPreviewContext().map(([label, value]) => evidenceField(label, value)));
    }
    async function createTaskFromWorkbench() {
      const title = el('taskTitle').value.trim();
      if (!title) return;
      const body = await api.createTask(title);
      appendEvents(body.events || []);
      el('taskTitle').value = '';
      await refreshStatus();
      await refreshOperation();
    }
    function taskLifecycleStatus(task = {}) {
      const status = String(task.status || '').toLowerCase();
      if (status === 'open' || status === 'todo' || status === 'pending') return 'open';
      if (status === 'done' || status === 'resolved' || status === 'closed') return 'closed';
      return status || 'unknown';
    }
    function taskLifecycleSummary(tasks = []) {
      const counts = tasks.reduce((next, task) => {
        const status = taskLifecycleStatus(task);
        if (status === 'open') next.open += 1;
        else if (status === 'closed') next.closed += 1;
        else next.other += 1;
        return next;
      }, { open: 0, closed: 0, other: 0 });
      const focusStatus = state.taskFocus ? taskLifecycleStatus(state.taskFocus) : 'none';
      const command = classifyCloudflareTaskCommandState({
        task_id: state.taskFocus?.task_id || '',
        lifecycle: focusStatus,
        evidence_count: taskEvidenceEvents(state.taskFocus).length,
      });
      const nextTask = tasks.find((task) => taskLifecycleStatus(task) === 'open') || state.taskFocus || tasks[0] || null;
      return [
        ['Open', counts.open],
        ['Closed', counts.closed],
        ['Other', counts.other],
        ['Focused Status', focusStatus],
        ['Next Task', nextTask?.task_id || 'none'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderTaskLifecycleSummary(tasks = state.operationProduct?.tasks || []) {
      if (!tasks.length) {
        el('taskLifecycleSummary').innerHTML = '<div class="empty">No task lifecycle loaded.</div>';
        renderTaskLifecycleControl();
        return;
      }
      el('taskLifecycleSummary').replaceChildren(...taskLifecycleSummary(tasks).map(([label, value]) => evidenceField(label, value)));
      renderTaskLifecycleControl(selectedTaskFromWorkbench() || tasks.find((task) => taskLifecycleStatus(task) === 'open') || tasks[0] || null);
    }
    function taskLifecycleControlContext(task = selectedTaskFromWorkbench(), product = state.operationProduct || {}) {
      const target = task || (product.tasks || []).find((entry) => taskLifecycleStatus(entry) === 'open') || (product.tasks || [])[0] || null;
      if (!target) return [];
      const evidenceEvents = taskEvidenceEvents(target, product);
      const command = classifyCloudflareTaskCommandState({ task_id: target.task_id || '', status: target.status, evidence_count: evidenceEvents.length });
      const lifecycleAction = command.next_action === 'mark_done_or_update' ? 'mark_task_done'
        : command.next_action === 'reopen_or_inspect_evidence' ? (evidenceEvents.length > 0 ? 'inspect_task_evidence' : 'reopen_task')
        : command.next_action === 'normalize_status_or_update' ? 'normalize_task_open'
        : command.next_action === 'select_task' ? 'select_next_task'
        : command.next_action || 'inspect_task';
      return [
        ['Task', target.task_id || 'none'],
        ['Lifecycle', command.lifecycle],
        ['Status', target.status || 'unknown'],
        ['Evidence Events', String(evidenceEvents.length)],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
        ['Lifecycle Action', lifecycleAction],
        ['Session', target.carrier_session_id || directiveDeliveryForTask(target, product)?.carrier_session_id || 'none'],
        ['Note', target.note || 'none'],
      ];
    }
    function renderTaskLifecycleControl(task = selectedTaskFromWorkbench()) {
      const context = taskLifecycleControlContext(task);
      if (!context.length) {
        el('taskLifecycleControl').innerHTML = '<div class="empty">No task lifecycle control loaded.</div>';
        return;
      }
      el('taskLifecycleControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    async function applyTaskLifecycleAction() {
      const product = state.operationProduct || {};
      const task = selectedTaskFromWorkbench() || (product.tasks || []).find((entry) => taskLifecycleStatus(entry) === 'open') || (product.tasks || [])[0] || null;
      if (!task) return;
      selectTask(task);
      const action = contextValue(taskLifecycleControlContext(task, product), 'Lifecycle Action');
      if (action === 'mark_task_done') { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_lifecycle_mark_done'); return; }
      if (action === 'reopen_task' || action === 'normalize_task_open') { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_lifecycle_mark_open'); return; }
      if (action === 'inspect_task_evidence') { focusTaskPathEvidence(); return; }
      focusTaskLifecyclePath();
    }
    function directiveIntentForTask(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return null;
      return (product.webhook_delay_directive_records || []).find((record) => directiveIntentTaskPredicate(record)(task)) || null;
    }
    function directiveDeliveryForTask(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return null;
      const directiveIntent = directiveIntentForTask(task, product);
      const directiveRecordId = directiveIntent?.directive_record_id || directiveIntent?.directive_intent?.directive_id || '';
      return (product.webhook_delay_directive_deliveries || []).find((delivery) => (
        (directiveRecordId && delivery.directive_record_id === directiveRecordId)
        || (task.carrier_session_id && delivery.carrier_session_id === task.carrier_session_id)
      )) || null;
    }
    function taskEvidenceEvents(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const predicate = taskEvidencePredicate(task);
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (!predicate(event)) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function taskEvidencePathContext(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const directiveIntent = directiveIntentForTask(task, product);
      const directiveDelivery = directiveDeliveryForTask(task, product);
      const sessionId = task.carrier_session_id || directiveDelivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (product.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      const sessionEvidence = (product.carrier_evidence || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      const evidenceEvents = taskEvidenceEvents(task, product);
      const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: evidenceEvents.length });
      return [
        ['Task', task.task_id || 'none'],
        ['Lifecycle', command.lifecycle],
        ['Session', sessionId || 'none'],
        ['Session Status', session?.binding_status || session?.status || 'unknown'],
        ['Session Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Task Evidence Events', String(evidenceEvents.length)],
        ['Directive Intent', directiveIntent?.directive_record_id || directiveIntent?.directive_intent?.directive_id || 'none'],
        ['Directive Delivery', directiveDelivery?.delivery_id || directiveDelivery?.directive_delivery_id || 'none'],
        ['Delivery State', directiveDelivery?.delivery_state || 'unknown'],
        ['Effect Scope', task.source || 'unknown'],
        ['Authority Path', [directiveIntent?.directive_authority, directiveDelivery?.dispatch_authority, directiveDelivery?.fallback_authority].filter(Boolean).join(' -> ') || 'unknown'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderTaskEvidencePath(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) {
        el('taskEvidencePath').innerHTML = '<div class="empty">No task evidence path loaded.</div>';
        return;
      }
      el('taskEvidencePath').replaceChildren(...taskEvidencePathContext(task, product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusTaskPathSession() {
      const task = selectedTaskFromWorkbench();
      if (!task) return;
      const delivery = directiveDeliveryForTask(task);
      const sessionId = task.carrier_session_id || delivery?.carrier_session_id || '';
      const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      if (session) selectOperationSession(session);
    }
    function focusTaskPathEvidence() {
      const task = selectedTaskFromWorkbench();
      if (task) focusEvidenceFor(taskEvidencePredicate(task));
    }
    function focusTaskPathDirective() {
      const directiveIntent = directiveIntentForTask(selectedTaskFromWorkbench());
      if (directiveIntent) selectWebhookDelayDirective(directiveIntent);
    }
    function focusTaskPathDelivery() {
      const delivery = directiveDeliveryForTask(selectedTaskFromWorkbench());
      if (delivery) selectWebhookDelayDirectiveDelivery(delivery);
    }
    function focusTaskPathChain() {
      focusTaskPathDirective();
      focusTaskPathDelivery();
      renderWebhookDelayEvidenceChain();
    }
    function taskLifecyclePathContext(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const path = Object.fromEntries(taskEvidencePathContext(task, product));
      return [
        ['Lifecycle State', path.Lifecycle || taskLifecycleStatus(task)],
        ['Next Lifecycle Action', path['Next Action'] || 'normalize_status_or_update'],
        ['Evidence Events', path['Task Evidence Events'] || '0'],
        ['Directive Delivery', path['Directive Delivery'] || 'none'],
        ['Delivery State', path['Delivery State'] || 'unknown'],
        ['Authority Path', path['Authority Path'] || 'unknown'],
      ];
    }
    function focusTaskLifecyclePath() {
      const task = selectedTaskFromWorkbench();
      if (!task) return;
      renderTaskEvidencePath(task);
      focusEvidenceFor(taskEvidencePredicate(task));
      updateControlRoom();
    }
    function taskFocusContext(task = {}) {
      const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: taskEvidenceEvents(task).length });
      return [
        ['Task', task.task_id || 'none'],
        ['Number', task.task_number ?? 'none'],
        ['Title', task.title || 'untitled'],
        ['Status', task.status || 'unknown'],
        ['Source', task.source || 'unknown'],
        ['Session', task.carrier_session_id || 'none'],
        ['Site', task.site_id || 'none'],
        ['Created', task.created_at || 'none'],
        ['Updated', task.updated_at || 'none'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Follow Up', command.next_action],
        ['Note', task.note || 'none'],
      ];
    }
    function renderTaskFocusDetail(task = state.taskFocus) {
      if (!task) {
        el('taskFocusDetail').innerHTML = '<div class="empty">No task selected.</div>';
        renderTaskLifecycleControl();
        return;
      }
      renderTaskLifecycleControl(task);
      el('taskFocusDetail').replaceChildren(
        ...taskFocusContext(task).map(([label, value]) => evidenceField(label, value)),
        ...taskLifecyclePathContext(task).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('taskFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor(taskEvidencePredicate(task))),
          focusActionButton('taskFocusPathAction', 'Task Path', focusTaskLifecyclePath),
          focusActionButton('taskFocusOpenAction', 'Mark Open', () => run(async () => { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_marked_open'); })),
          focusActionButton('taskFocusDoneAction', 'Mark Done', () => run(async () => { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_marked_done'); })),
        ),
      );
    }
    function taskEvidencePredicate(task) {
      return (event) => {
        const payloadText = JSON.stringify(event.payload || {});
        return payloadText.includes(task.task_id) || (task.task_number != null && payloadText.includes('"task_number":' + task.task_number));
      };
    }
    function directiveIntentTaskTitle(record = {}) {
      const directiveId = record.directive_record_id || record.directive_intent?.directive_id || 'directive_intent';
      const classification = record.classification_state || record.classification?.state || 'unknown';
      const delay = record.latest_delay_minutes ?? record.classification?.latest_delay_minutes ?? 'unknown';
      return ['directive', directiveId, classification, 'webhook_delay', delay].filter(Boolean).join(' ');
    }
    function directiveIntentTaskPredicate(record = {}) {
      const tokens = [record.directive_record_id, record.directive_intent?.directive_id, record.directive_intent?.input_event_id].filter(Boolean);
      return (task = {}) => {
        const taskText = JSON.stringify(task);
        return tokens.some((token) => taskText.includes(token));
      };
    }
    function taskForDirectiveIntent(record = state.webhookDelayDirectiveFocus, product = state.operationProduct || {}) {
      if (!record) return null;
      return (product.tasks || []).find(directiveIntentTaskPredicate(record)) || null;
    }
    function selectedTaskFromWorkbench() {
      const taskId = el('updateTaskId').value.trim() || state.taskFocus?.task_id || '';
      if (!taskId) return null;
      if (state.taskFocus?.task_id === taskId) return state.taskFocus;
      return (state.operationProduct?.tasks || []).find((task) => task.task_id === taskId) || { task_id: taskId };
    }
    function selectTask(task) {
      if (!task?.task_id) return;
      state.taskFocus = task;
      el('updateTaskId').value = task.task_id;
      el('updateTaskStatus').value = task.status || 'done';
      el('updateTaskNote').value = task.note || '';
      if (task.carrier_session_id) setCurrentSession(task.carrier_session_id);
      focusEvidenceFor(taskEvidencePredicate(task));
      renderTasks(state.operationProduct?.tasks || []);
      renderTaskFocusDetail(task);
      renderTaskCommandPreview();
      renderTaskLifecycleControl(task);
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    async function updateFocusedTask(status, note = null) {
      const taskId = selectedTaskFromWorkbench()?.task_id || '';
      if (!taskId) return;
      const body = await api.updateTask(taskId, status, note ?? el('updateTaskNote').value.trim());
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
      const task = (state.operationProduct?.tasks || []).find((entry) => entry.task_id === taskId);
      if (task) selectTask(task);
    }
    function listItem(label, value) {
      const li = document.createElement('li');
      const key = document.createElement('b');
      key.textContent = label + ': ';
      li.append(key, document.createTextNode(value == null || value === '' ? 'none' : String(value)));
      return li;
    }
    function authoritySummary(event) {
      const evidence = event?.evidence || {};
      const parts = [
        'actor=' + (event?.principal_id || 'unknown'),
        'action=' + (event?.action || 'unknown'),
        'reason=' + (event?.reason || 'none'),
      ];
      if (evidence.member_principal_id) parts.push('target=' + evidence.member_principal_id);
      if (evidence.role) parts.push('role=' + evidence.role);
      if (evidence.status) parts.push('status=' + evidence.status);
      if (evidence.actor_role) parts.push('actor_role=' + evidence.actor_role);
      return parts.join(' | ');
    }
    function renderLastAuthority(event, fallback = null) {
      const authority = event || fallback;
      if (!authority) {
        el('lastAuthority').replaceChildren(
          Object.assign(document.createElement('strong'), { textContent: 'No authority action loaded.' }),
          Object.assign(document.createElement('span'), { textContent: 'Read Site or Put Membership to inspect evidence.' }),
        );
        return;
      }
      const title = document.createElement('strong');
      title.textContent = authority.event_kind || 'site.membership.put';
      const meta = document.createElement('span');
      meta.textContent = authoritySummary(authority);
      el('lastAuthority').replaceChildren(title, meta);
    }
    function renderListBlock(title, items) {
      const block = document.createElement('div');
      block.className = 'overview-block';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const list = document.createElement('ul');
      if (items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'None loaded.';
        list.append(empty);
      } else {
        list.append(...items);
      }
      block.append(heading, list);
      return block;
    }
    function authorityRouteSummary(decision) {
      return [
        'action=' + (decision.action || 'unknown'),
        'reason=' + (decision.reason || 'none'),
        'locus=' + (decision.authority_locus || 'unresolved'),
        'kind=' + (decision.authority_locus_kind || 'unknown'),
      ].join(' | ');
    }
    function continuitySummary(decision) {
      return [
        'action=' + (decision.action || 'unknown'),
        'reason=' + (decision.reason || 'none'),
        'source=' + (decision.source_embodiment_kind || 'unknown'),
        'target=' + (decision.target_embodiment_kind || 'unknown'),
      ].join(' | ');
    }
    function continuityKey(item = {}) {
      return [item.kind, item.packet_id, item.exchange_class, item.source, item.target].filter(Boolean).join('|');
    }
    function continuityItems(product = {}) {
      const decisions = (product.site_continuity?.decisions || []).map((decision) => ({ kind: 'decision', ...decision }));
      const packets = (product.site_continuity_packets || []).map((packet) => ({ kind: 'packet', ...packet }));
      return [...decisions, ...packets];
    }
    function selectContinuity(item) {
      if (!item) return;
      state.continuityFocus = item;
      renderContinuityNavigator(continuityItems(state.operationProduct || {}));
      updateControlRoom();
    }
    function renderContinuityNavigator(items = []) {
      if (items.length === 0) {
        state.continuityFocus = null;
        el('continuityNavigator').innerHTML = '<div class="empty">No continuity loaded.</div>';
        renderContinuityFocusDetail();
        return;
      }
      if (state.continuityFocus) state.continuityFocus = items.find((item) => continuityKey(item) === continuityKey(state.continuityFocus)) || state.continuityFocus;
      if (!state.continuityFocus) state.continuityFocus = items[0];
      el('continuityNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'continuity-item' + (continuityKey(item) === continuityKey(state.continuityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.kind + ' ' + (item.packet_id || item.exchange_class || item.reason || 'continuity');
        const meta = document.createElement('span');
        meta.textContent = item.kind === 'packet'
          ? [item.admission_action, item.imported_at, item.imported_by_principal_id].filter(Boolean).join(' | ')
          : continuitySummary(item);
        node.addEventListener('click', () => selectContinuity(item));
        node.append(title, meta);
        return node;
      }));
      renderContinuityFocusDetail();
    }
    function continuityFocusContext(item = {}) {
      if (item.kind === 'packet') {
        return [
          ['Kind', 'packet'],
          ['Packet', item.packet_id || 'none'],
          ['Admission', item.admission_action || 'unknown'],
          ['Site', item.site_id || el('siteId').value.trim() || 'none'],
          ['Imported', item.imported_at || 'none'],
          ['Imported By', item.imported_by_principal_id || 'none'],
        ];
      }
      return [
        ['Kind', item.kind || 'decision'],
        ['Exchange', item.exchange_class || 'unknown'],
        ['Action', item.action || 'unknown'],
        ['Reason', item.reason || 'none'],
        ['Source', item.source_embodiment_kind || 'unknown'],
        ['Target', item.target_embodiment_kind || 'unknown'],
      ];
    }
    function renderContinuityFocusDetail(item = state.continuityFocus) {
      if (!item) {
        el('continuityFocusDetail').innerHTML = '<div class="empty">No continuity item selected.</div>';
        return;
      }
      el('continuityFocusDetail').replaceChildren(...continuityFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayDirectiveDeliveryKey(item = {}) {
      return item.delivery_id || item.directive_delivery_id || [item.directive_record_id, item.carrier_session_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectWebhookDelayDirectiveDelivery(item) {
      if (!item) return;
      state.webhookDelayDirectiveDeliveryFocus = item;
      if (item.carrier_session_id && (state.operationProduct?.sessions || []).some((session) => session.carrier_session_id === item.carrier_session_id)) {
        selectOperationSession((state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === item.carrier_session_id));
      }
      renderWebhookDelayDirectiveDeliveryNavigator(state.operationProduct?.webhook_delay_directive_deliveries || []);
      setEvidenceLane('directives');
      focusEvidenceFor((event) => item.carrier_session_id && event.carrier_session_id === item.carrier_session_id && (event.event_kind === 'directive_receipt_recorded' || event.event_kind === 'input_admitted_to_turn' || event.event_kind === 'provider_request_recorded'));
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayDirectiveDelivery(item = null) {
      const items = state.operationProduct?.webhook_delay_directive_deliveries || [];
      const focused = item || state.webhookDelayDirectiveDeliveryFocus || items[0] || null;
      if (focused) selectWebhookDelayDirectiveDelivery(focused);
    }
    function renderWebhookDelayDirectiveDeliveryNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayDirectiveDeliveryFocus = null;
        el('webhookDelayDirectiveDeliveryNavigator').innerHTML = '<div class="empty">No webhook delay directive deliveries loaded.</div>';
        renderWebhookDelayDirectiveDeliveryFocusDetail();
        return;
      }
      if (state.webhookDelayDirectiveDeliveryFocus) state.webhookDelayDirectiveDeliveryFocus = items.find((item) => webhookDelayDirectiveDeliveryKey(item) === webhookDelayDirectiveDeliveryKey(state.webhookDelayDirectiveDeliveryFocus)) || state.webhookDelayDirectiveDeliveryFocus;
      if (!state.webhookDelayDirectiveDeliveryFocus) state.webhookDelayDirectiveDeliveryFocus = items[0];
      el('webhookDelayDirectiveDeliveryNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayDirectiveDeliveryKey(item) === webhookDelayDirectiveDeliveryKey(state.webhookDelayDirectiveDeliveryFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.delivery_state || 'unknown', item.delivery_id || item.directive_delivery_id || 'directive_delivery'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.carrier_session_id, item.directive_authority, item.dispatch_authority, item.fallback_status, item.delivery_action].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayDirectiveDelivery(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayDirectiveDeliveryFocusDetail();
    }
    function webhookDelayDirectiveDeliveryFocusContext(item = state.webhookDelayDirectiveDeliveryFocus) {
      const sessionEvidence = (state.operationProduct?.carrier_evidence || []).find((entry) => entry.carrier_session_id === item?.carrier_session_id);
      return [
        ['Directive Delivery', item?.delivery_id || item?.directive_delivery_id || 'none'],
        ['Directive Record', item?.directive_record_id || 'none'],
        ['Delivery State', item?.delivery_state || 'unknown'],
        ['Carrier Session', item?.carrier_session_id || 'none'],
        ['Classification', item?.classification_state || item?.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item?.latest_delay_minutes ?? item?.classification?.latest_delay_minutes ?? 'none'],
        ['Directive Authority', item?.directive_authority || 'cloudflare_primary_directive_delivery'],
        ['Dispatch Authority', item?.dispatch_authority || 'cloudflare_primary_dispatcher'],
        ['Fallback Authority', item?.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item?.fallback_status || 'unknown'],
        ['Delivery Action', item?.delivery_action || 'none'],
        ['Session Start OK', item?.session_start_ok ?? item?.record?.session_start_ok ?? 'unknown'],
        ['Delivery OK', item?.delivery_ok ?? item?.record?.delivery_ok ?? 'unknown'],
        ['Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Recorded', item?.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayDirectiveDeliveryFocusDetail(item = state.webhookDelayDirectiveDeliveryFocus) {
      if (!item) {
        el('webhookDelayDirectiveDeliveryFocusDetail').innerHTML = '<div class="empty">No webhook delay directive delivery selected.</div>';
        return;
      }
      el('webhookDelayDirectiveDeliveryFocusDetail').replaceChildren(...webhookDelayDirectiveDeliveryFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayEvidenceChainContext(product = state.operationProduct || {}) {
      const observation = state.webhookDelayShadowFocus || (product.webhook_delay_shadow_observations || [])[0] || null;
      const intent = state.webhookDelayDirectiveFocus || (product.webhook_delay_directive_records || [])[0] || null;
      const delivery = state.webhookDelayDirectiveDeliveryFocus || (product.webhook_delay_directive_deliveries || [])[0] || null;
      const deliverySessionId = delivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (product.sessions || []).find((entry) => entry.carrier_session_id === deliverySessionId) || state.sessionFocus || null;
      const sessionEvidence = (product.carrier_evidence || []).find((entry) => entry.carrier_session_id === deliverySessionId) || null;
      const task = taskForDirectiveIntent(intent, product) || state.taskFocus || null;
      const nextFocus = !observation ? 'observation'
        : !intent ? 'directive_intent'
        : !delivery ? 'directive_delivery'
        : !sessionEvidence ? 'session_evidence'
        : !task ? 'task'
        : 'chain_complete';
      return [
        ['Observation', observation?.observation_id || 'none'],
        ['Classification', observation?.classification_state || intent?.classification_state || delivery?.classification_state || 'unknown'],
        ['Directive Intent', intent?.directive_record_id || intent?.directive_intent?.directive_id || 'none'],
        ['Directive Visibility', intent?.carrier_admission?.directive_visibility || intent?.directive_intent?.input_event?.metadata?.directive?.visibility || 'unknown'],
        ['Directive Delivery', delivery?.delivery_id || delivery?.directive_delivery_id || 'none'],
        ['Delivery State', delivery?.delivery_state || 'unknown'],
        ['Carrier Session', deliverySessionId || session?.carrier_session_id || 'none'],
        ['Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Task', task?.task_id || 'none'],
        ['Authority Path', [intent?.directive_authority, delivery?.dispatch_authority, delivery?.fallback_authority].filter(Boolean).join(' -> ') || 'unknown'],
        ['Fallback', delivery?.fallback_status || intent?.fallback_status || 'unknown'],
        ['Next Focus', nextFocus],
      ];
    }
    function renderWebhookDelayEvidenceChain(product = state.operationProduct || {}) {
      const target = el('webhookDelayEvidenceChain');
      if (!target) return;
      target.replaceChildren(...webhookDelayEvidenceChainContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusWebhookDelayChainObservation() {
      focusWebhookDelayShadow(state.webhookDelayShadowFocus || (state.operationProduct?.webhook_delay_shadow_observations || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainIntent() {
      focusWebhookDelayDirective(state.webhookDelayDirectiveFocus || (state.operationProduct?.webhook_delay_directive_records || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainDelivery() {
      focusWebhookDelayDirectiveDelivery(state.webhookDelayDirectiveDeliveryFocus || (state.operationProduct?.webhook_delay_directive_deliveries || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainSession() {
      const delivery = state.webhookDelayDirectiveDeliveryFocus || (state.operationProduct?.webhook_delay_directive_deliveries || [])[0] || null;
      const sessionId = delivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      if (session) selectOperationSession(session);
      if (sessionId) focusEvidenceFor((event) => event.carrier_session_id === sessionId);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainTask() {
      const task = taskForDirectiveIntent(state.webhookDelayDirectiveFocus, state.operationProduct || {});
      if (task) selectTask(task);
      renderWebhookDelayEvidenceChain();
    }
    function webhookDelayShadowKey(item = {}) {
      return item.observation_id || [item.site_id, item.generated_at, item.latest_delay_minutes].filter(Boolean).join('|');
    }
    function selectWebhookDelayShadow(item) {
      if (!item) return;
      state.webhookDelayShadowFocus = item;
      renderWebhookDelayShadowNavigator(state.operationProduct?.webhook_delay_shadow_observations || []);
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayShadow(item = null) {
      const items = state.operationProduct?.webhook_delay_shadow_observations || [];
      const focused = item || state.webhookDelayShadowFocus || items[0] || null;
      if (focused) selectWebhookDelayShadow(focused);
    }
    function renderWebhookDelayShadowNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayShadowFocus = null;
        el('webhookDelayShadowNavigator').innerHTML = '<div class="empty">No webhook delay shadow reads loaded.</div>';
        renderWebhookDelayShadowFocusDetail();
        return;
      }
      if (state.webhookDelayShadowFocus) state.webhookDelayShadowFocus = items.find((item) => webhookDelayShadowKey(item) === webhookDelayShadowKey(state.webhookDelayShadowFocus)) || state.webhookDelayShadowFocus;
      if (!state.webhookDelayShadowFocus) state.webhookDelayShadowFocus = items[0];
      el('webhookDelayShadowNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayShadowKey(item) === webhookDelayShadowKey(state.webhookDelayShadowFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.classification_state || item.classification?.state || 'unknown', item.observation_id || item.generated_at || 'shadow_read'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = ['delay=' + (item.latest_delay_minutes ?? item.observation?.latest?.delay_minutes ?? 'unknown'), item.dispatch_authority || item.classification?.dispatch_authority, item.dispatch_action || item.classification?.dispatch_action || 'none'].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayShadow(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayShadowFocusDetail();
    }
    function webhookDelayShadowFocusContext(item = {}) {
      return [
        ['Observation', item.observation_id || 'none'],
        ['Classification', item.classification_state || item.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item.latest_delay_minutes ?? item.observation?.latest?.delay_minutes ?? 'none'],
        ['Critical Minutes', item.critical_minutes ?? item.classification?.critical_minutes ?? 'none'],
        ['Shadow Mode', item.shadow_mode || item.classification?.shadow_mode || 'cloudflare_shadow_read'],
        ['Dispatch Authority', item.dispatch_authority || item.classification?.dispatch_authority || 'windows_primary_dispatcher'],
        ['Dispatch Action', item.dispatch_action || item.classification?.dispatch_action || 'none'],
        ['Source Locus', item.source_locus || 'windows_local_site'],
        ['Target Locus', item.target_locus || 'cloudflare_carrier_site'],
        ['Generated', item.generated_at || item.observation?.generated_at || 'none'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayShadowFocusDetail(item = state.webhookDelayShadowFocus) {
      if (!item) {
        el('webhookDelayShadowFocusDetail').innerHTML = '<div class="empty">No webhook delay shadow read selected.</div>';
        return;
      }
      el('webhookDelayShadowFocusDetail').replaceChildren(...webhookDelayShadowFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayDirectiveKey(item = {}) {
      return item.directive_record_id || item.directive_intent?.directive_id || [item.site_id, item.operation_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectWebhookDelayDirective(item) {
      if (!item) return;
      state.webhookDelayDirectiveFocus = item;
      renderWebhookDelayDirectiveNavigator(state.operationProduct?.webhook_delay_directive_records || []);
      renderTaskCommandPreview();
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayDirective(item = null) {
      const items = state.operationProduct?.webhook_delay_directive_records || [];
      const focused = item || state.webhookDelayDirectiveFocus || items[0] || null;
      if (focused) selectWebhookDelayDirective(focused);
    }
    function renderWebhookDelayDirectiveNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayDirectiveFocus = null;
        el('webhookDelayDirectiveNavigator').innerHTML = '<div class="empty">No webhook delay directive records loaded.</div>';
        renderWebhookDelayDirectiveFocusDetail();
        return;
      }
      if (state.webhookDelayDirectiveFocus) state.webhookDelayDirectiveFocus = items.find((item) => webhookDelayDirectiveKey(item) === webhookDelayDirectiveKey(state.webhookDelayDirectiveFocus)) || state.webhookDelayDirectiveFocus;
      if (!state.webhookDelayDirectiveFocus) state.webhookDelayDirectiveFocus = items[0];
      el('webhookDelayDirectiveNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayDirectiveKey(item) === webhookDelayDirectiveKey(state.webhookDelayDirectiveFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.classification_state || item.classification?.state || 'unknown', item.directive_record_id || item.directive_intent?.directive_id || 'webhook_delay_directive'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.directive_authority, item.fallback_authority, item.fallback_status, item.directive_action, item.carrier_admission?.directive_visibility].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayDirective(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayDirectiveFocusDetail();
    }
    function webhookDelayDirectiveFocusContext(item = {}) {
      return [
        ['Directive Record', item.directive_record_id || 'none'],
        ['Classification', item.classification_state || item.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item.latest_delay_minutes ?? item.classification?.latest_delay_minutes ?? 'none'],
        ['Critical Minutes', item.critical_minutes ?? item.classification?.critical_minutes ?? item.threshold_policy?.critical_minutes ?? 'none'],
        ['Directive Authority', item.directive_authority || 'cloudflare_directive_dual_recorded'],
        ['Fallback Authority', item.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item.fallback_status || 'unknown'],
        ['Directive Action', item.directive_action || 'none'],
        ['Carrier Input Operation', item.directive_intent?.carrier_input_operation || 'none'],
        ['Directive Visibility', item.carrier_admission?.directive_visibility || item.directive_intent?.input_event?.metadata?.directive?.visibility || 'unknown'],
        ['Dispatch To Provider', item.carrier_admission?.dispatch_to_provider ?? 'unknown'],
        ['Complete Without Provider', item.carrier_admission?.complete_without_provider ?? 'unknown'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayDirectiveFocusDetail(item = state.webhookDelayDirectiveFocus) {
      if (!item) {
        el('webhookDelayDirectiveFocusDetail').innerHTML = '<div class="empty">No webhook delay directive record selected.</div>';
        return;
      }
      el('webhookDelayDirectiveFocusDetail').replaceChildren(...webhookDelayDirectiveFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function residentLoopShadowKey(item = {}) {
      return item.loop_run_id || [item.site_id, item.operation_id, item.run_started_at].filter(Boolean).join('|');
    }
    function selectResidentLoopShadow(item) {
      if (!item) return;
      state.residentLoopShadowFocus = item;
      renderResidentLoopShadowNavigator(state.operationProduct?.resident_loop_shadow_runs || []);
      updateControlRoom();
    }
    function renderResidentLoopShadowNavigator(items = []) {
      if (items.length === 0) {
        state.residentLoopShadowFocus = null;
        el('residentLoopShadowNavigator').innerHTML = '<div class="empty">No resident loop shadow reads loaded.</div>';
        renderResidentLoopShadowFocusDetail();
        return;
      }
      if (state.residentLoopShadowFocus) state.residentLoopShadowFocus = items.find((item) => residentLoopShadowKey(item) === residentLoopShadowKey(state.residentLoopShadowFocus)) || state.residentLoopShadowFocus;
      if (!state.residentLoopShadowFocus) state.residentLoopShadowFocus = items[0];
      el('residentLoopShadowNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (residentLoopShadowKey(item) === residentLoopShadowKey(state.residentLoopShadowFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.loop_status || item.loop_run?.status || 'unknown', item.loop_run_id || item.run_started_at || 'resident_loop_shadow'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = ['steps=' + (item.step_count ?? item.loop_run?.step_count ?? 'unknown'), 'attention=' + (item.operator_attention_count ?? item.loop_run?.operator_attention_count ?? 'unknown'), item.dispatch_authority, item.dispatch_action || 'none'].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectResidentLoopShadow(item));
        node.append(title, meta);
        return node;
      }));
      renderResidentLoopShadowFocusDetail();
    }
    function residentLoopShadowFocusContext(item = {}) {
      const loopRun = item.loop_run || {};
      return [
        ['Loop Run', item.loop_run_id || 'none'],
        ['Status', item.loop_status || loopRun.status || 'unknown'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || loopRun.operation_id || el('operationId').value.trim() || 'none'],
        ['Started', item.run_started_at || loopRun.run_started_at || 'none'],
        ['Finished', item.run_finished_at || loopRun.run_finished_at || 'none'],
        ['Steps', item.step_count ?? loopRun.step_count ?? 'unknown'],
        ['Operator Attention', item.operator_attention_count ?? loopRun.operator_attention_count ?? 'unknown'],
        ['Source Locus', item.source_locus || 'unknown'],
        ['Target Locus', item.target_locus || 'unknown'],
        ['Shadow Mode', item.shadow_mode || loopRun.shadow_mode || 'unknown'],
        ['Dispatch Authority', item.dispatch_authority || loopRun.dispatch_authority || 'none'],
        ['Dispatch Action', item.dispatch_action || loopRun.dispatch_action || 'none'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderResidentLoopShadowFocusDetail(item = state.residentLoopShadowFocus) {
      if (!item) {
        el('residentLoopShadowFocusDetail').innerHTML = '<div class="empty">No resident loop shadow read selected.</div>';
        return;
      }
      el('residentLoopShadowFocusDetail').replaceChildren(...residentLoopShadowFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function residentDispatchKey(item = {}) {
      return item.dispatch_decision_id || [item.site_id, item.operation_id, item.carrier_session_id].filter(Boolean).join('|');
    }
    function selectResidentDispatch(item) {
      if (!item) return;
      state.residentDispatchFocus = item;
      renderResidentDispatchNavigator(state.operationProduct?.resident_dispatch_decisions || []);
      updateControlRoom();
    }
    function focusResidentDispatch(decision = null) {
      const items = state.operationProduct?.resident_dispatch_decisions || [];
      const focused = decision || state.residentDispatchFocus || items[0] || null;
      if (focused) selectResidentDispatch(focused);
    }
    async function startResidentDispatchFromWorkbench() {
      const body = await api.startResidentDispatch();
      const carrierSessionId = body.carrier_session_id || body.decision?.carrier_session_id || body.session_start?.carrier_session_id;
      if (carrierSessionId) setCurrentSession(carrierSessionId);
      appendEvents([body.session_start?.event].filter(Boolean));
      await refreshStatus();
      await refreshOperation();
      const decisionId = body.decision?.dispatch_decision_id;
      const decisions = state.operationProduct?.resident_dispatch_decisions || [];
      focusResidentDispatch(decisions.find((item) => item.dispatch_decision_id === decisionId || item.carrier_session_id === carrierSessionId));
    }
    function renderResidentDispatchNavigator(items = []) {
      if (items.length === 0) {
        state.residentDispatchFocus = null;
        el('residentDispatchNavigator').innerHTML = '<div class="empty">No resident dispatch decisions loaded.</div>';
        renderResidentDispatchFocusDetail();
        return;
      }
      if (state.residentDispatchFocus) state.residentDispatchFocus = items.find((item) => residentDispatchKey(item) === residentDispatchKey(state.residentDispatchFocus)) || state.residentDispatchFocus;
      if (!state.residentDispatchFocus) state.residentDispatchFocus = items[0];
      el('residentDispatchNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (residentDispatchKey(item) === residentDispatchKey(state.residentDispatchFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.decision_state || 'unknown', item.dispatch_decision_id || item.carrier_session_id || 'resident_dispatch'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.dispatch_authority, item.fallback_authority, item.fallback_status, item.dispatch_action].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectResidentDispatch(item));
        node.append(title, meta);
        return node;
      }));
      renderResidentDispatchFocusDetail();
    }
    function residentDispatchFocusContext(item = {}) {
      return [
        ['Decision', item.dispatch_decision_id || 'none'],
        ['State', item.decision_state || 'unknown'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Session', item.carrier_session_id || 'none'],
        ['Dispatch Authority', item.dispatch_authority || 'cloudflare_primary_dispatcher'],
        ['Fallback Authority', item.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item.fallback_status || 'unknown'],
        ['Dispatch Action', item.dispatch_action || 'none'],
        ['Dispatch Scope', item.dispatch_scope || 'unknown'],
        ['Session Start Status', item.session_start_status ?? 'none'],
        ['Session Start OK', item.session_start_ok ?? 'unknown'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderResidentDispatchFocusDetail(item = state.residentDispatchFocus) {
      if (!item) {
        el('residentDispatchFocusDetail').innerHTML = '<div class="empty">No resident dispatch decision selected.</div>';
        return;
      }
      el('residentDispatchFocusDetail').replaceChildren(...residentDispatchFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function siteProductStatusSummary(status) {
      const missing = (status?.missing || []).join(', ') || 'none';
      const attention = (status?.attention || []).join(', ') || 'none';
      return [
        status?.health || 'unknown',
        'next=' + (status?.next_action || 'none'),
        'missing=' + missing,
        'attention=' + attention,
      ].join(' | ');
    }
    function renderSitesProduct(product) {
      state.siteList = product.sites || [];
      state.siteProductStatuses = product.site_product_statuses || [];
      state.siteProductOverview = product.site_product_overview || null;
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      const overview = state.siteProductOverview || {};
      const health = overview.health_counts || {};
      el('sitesOverview').replaceChildren(
        ...[
          ['Schema', overview.schema || 'none'],
          ['Sites', overview.site_count ?? state.siteList.length],
          ['Ready', health.ready ?? 0],
          ['Attention', health.attention ?? 0],
          ['Incomplete', health.incomplete ?? 0],
          ['Next Site', overview.next_site_id || 'none'],
          ['Next Action', overview.next_action || 'monitor_sites'],
        ].map(([label, value]) => evidenceField(label, value)),
      );
      if (state.siteProductStatuses.length === 0) {
        el('sitesStatusList').innerHTML = '<div class="empty">No site statuses loaded.</div>';
      } else {
        el('sitesStatusList').replaceChildren(...state.siteProductStatuses.map((status) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'attention-item';
          item.textContent = (status.site_id || 'unknown-site') + ' / ' + siteProductStatusSummary(status);
          item.addEventListener('click', () => focusSiteFromStatus(status));
          return item;
        }));
      }
      updateControlRoom();
    }
    function focusSiteFromStatus(status) {
      const siteId = status?.site_id;
      if (!siteId) return;
      const site = state.siteList.find((entry) => entry.site_id === siteId) || { site_id: siteId, status: status.site_status };
      el('siteId').value = siteId;
      state.siteFocus = site;
      renderSiteFocusDetail(site);
      run(refreshSiteProduct);
    }
    function focusNextSiteFromOverview() {
      const nextSiteId = state.siteProductOverview?.next_site_id || state.siteProductStatuses[0]?.site_id;
      const status = state.siteProductStatuses.find((entry) => entry.site_id === nextSiteId) || state.siteProductStatuses[0];
      if (status) focusSiteFromStatus(status);
    }
    function renderSiteProduct(product) {
      state.operationProduct = product;
      state.productScope = 'site';
      state.operations = product.operations || [];
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      renderSiteFocusDetail(product.site || state.siteFocus);
      el('siteStatus').textContent = product.site?.status || 'unknown';
      el('operationStatus').textContent = 'site scope';
      el('membershipRole').textContent = product.membership?.role || 'none';
      el('sessionCount').textContent = String((product.sessions || []).length);
      el('taskCount').textContent = String((product.tasks || []).length);
      el('evidenceCount').textContent = String((product.carrier_evidence || []).length);
      el('authorityCount').textContent = String((product.authority_events || []).length);
      el('continuityCount').textContent = String((product.site_continuity_packets || []).length);
      renderTasks(product.tasks || []);
      renderMembershipNavigator(currentMemberships(product));
      renderContinuityNavigator(continuityItems(product));
      renderWebhookDelayShadowNavigator(product.webhook_delay_shadow_observations || []);
      renderWebhookDelayDirectiveNavigator(product.webhook_delay_directive_records || []);
      renderWebhookDelayDirectiveDeliveryNavigator(product.webhook_delay_directive_deliveries || []);
      renderWebhookDelayEvidenceChain(product);
      renderResidentLoopShadowNavigator(product.resident_loop_shadow_runs || []);
      renderResidentDispatchNavigator(product.resident_dispatch_decisions || []);
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderAuthorityPath(product);
      renderProductScopeDetail(product);
      renderOperationFlightDeck(product);
      renderOperationPath(focusedOperation(), product);
      updateControlRoom();
      const siteItems = [
        listItem('site_id', product.site?.site_id),
        listItem('display_name', product.site?.display_name),
        listItem('principal', product.reader_principal?.email || product.reader_principal?.principal_id),
      ];
      const operationItems = (product.operations || []).map((operation) => listItem(operation.operation_id, [operation.status, operation.operation_kind, operation.display_name].filter(Boolean).join(' | ')));
      const membershipItems = (product.memberships || []).map((membership) => listItem(membership.principal_id, membership.role + ' / ' + membership.status));
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const authorityItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const authorityRoutingItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const continuityItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const webhookDelayShadowItems = (product.webhook_delay_shadow_observations || []).map((entry) => listItem(entry.observation_id || entry.generated_at, [entry.classification_state, entry.latest_delay_minutes, entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveItems = (product.webhook_delay_directive_records || []).map((entry) => listItem(entry.directive_record_id || entry.directive_intent?.directive_id, [entry.classification_state, entry.directive_authority, entry.fallback_status, entry.directive_action, entry.carrier_admission?.directive_visibility].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveDeliveryItems = (product.webhook_delay_directive_deliveries || []).map((entry) => listItem(entry.delivery_id || entry.directive_delivery_id, [entry.delivery_state, entry.carrier_session_id, entry.directive_authority, entry.dispatch_authority, entry.fallback_status].filter((value) => value != null && value !== '').join(' | ')));
      const residentLoopShadowItems = (product.resident_loop_shadow_runs || []).map((entry) => listItem(entry.loop_run_id || entry.run_started_at, [entry.loop_status, 'steps=' + (entry.step_count ?? 'unknown'), 'attention=' + (entry.operator_attention_count ?? 'unknown'), entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const residentDispatchItems = (product.resident_dispatch_decisions || []).map((entry) => listItem(entry.dispatch_decision_id || entry.carrier_session_id, [entry.decision_state, entry.dispatch_authority, entry.fallback_status, entry.dispatch_action].filter((value) => value != null && value !== '').join(' | ')));
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      renderOperationNavigator(product.operations || []);
      renderOperationSessions(product.sessions || []);
      el('productOverview').replaceChildren(
        renderListBlock('Site', siteItems),
        renderListBlock('Operations', operationItems),
        renderListBlock('Memberships', membershipItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Operation Attention', state.attentionItems.map((item) => listItem(item.directive_id, [item.reason, item.operation_id].filter(Boolean).join(' | ')))),
        renderListBlock('Tasks', (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')))),
        renderListBlock('Authority Events', authorityItems),
        renderListBlock('Authority Routing', authorityRoutingItems),
        renderListBlock('Site Continuity', continuityItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
        renderListBlock('Webhook Delay Shadow Reads', webhookDelayShadowItems),
        renderListBlock('Webhook Delay Directive Intents', webhookDelayDirectiveItems),
        renderListBlock('Webhook Delay Directive Deliveries', webhookDelayDirectiveDeliveryItems),
        renderListBlock('Resident Loop Shadow Reads', residentLoopShadowItems),
        renderListBlock('Resident Dispatch', residentDispatchItems),
        renderListBlock('Carrier Evidence', evidenceItems),
      );
      renderLastAuthority((product.authority_events || [])[0]);
      updateControlRoom();
    }
    function renderOperationSessions(sessions = []) {
      const select = el('operationSessionSelect');
      const current = el('sessionId').value.trim();
      select.replaceChildren(...(sessions.length === 0
        ? [new Option('No operation sessions loaded', '')]
        : sessions.map((session) => new Option(session.carrier_session_id + ' / ' + (session.binding_status || session.agent_id || 'active'), session.carrier_session_id))));
      if (sessions.some((session) => session.carrier_session_id === current)) select.value = current;
      renderSessionNavigator(sessions);
      renderActiveSessionDetail();
    }
    function renderOperationProduct(product) {
      state.operationProduct = product;
      state.productScope = 'operation';
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      renderSiteFocusDetail(product.site || state.siteFocus);
      if (product.operation?.operation_id && !state.operations.some((operation) => operation.operation_id === product.operation.operation_id)) {
        state.operations = [product.operation, ...state.operations];
      }
      const surface = product.operation_product_surface || {};
      el('siteStatus').textContent = product.operation?.site_id || product.site?.status || 'unknown';
      el('operationStatus').textContent = product.operation?.status || 'unknown';
      el('membershipRole').textContent = product.membership?.role || 'none';
      el('sessionCount').textContent = String(surface.session_count ?? (product.sessions || []).length);
      el('taskCount').textContent = String(surface.task_count ?? (product.tasks || []).length);
      el('evidenceCount').textContent = String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length);
      el('authorityCount').textContent = String((product.authority_events || []).length + (product.site_authority?.decisions || []).length);
      el('continuityCount').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length);
      renderTasks(product.tasks || []);
      renderMembershipNavigator(currentMemberships(product));
      renderContinuityNavigator(continuityItems(product));
      renderWebhookDelayShadowNavigator(product.webhook_delay_shadow_observations || []);
      renderWebhookDelayDirectiveNavigator(product.webhook_delay_directive_records || []);
      renderWebhookDelayDirectiveDeliveryNavigator(product.webhook_delay_directive_deliveries || []);
      renderWebhookDelayEvidenceChain(product);
      renderResidentLoopShadowNavigator(product.resident_loop_shadow_runs || []);
      renderResidentDispatchNavigator(product.resident_dispatch_decisions || []);
      renderOperationNavigator(state.operations || []);
      renderOperationSessions(product.sessions || []);
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderAuthorityPath(product);
      renderProductScopeDetail(product);
      renderOperationFlightDeck(product);
      renderOperationPath(focusedOperation(), product);
      updateControlRoom();
      const operationItems = [
        listItem('operation_id', product.operation?.operation_id),
        listItem('display_name', product.operation?.display_name),
        listItem('kind', product.operation?.operation_kind),
        listItem('status', product.operation?.status),
      ];
      const surfaceItems = [
        listItem('schema', surface.schema),
        listItem('sessions', surface.session_count),
        listItem('tasks', surface.task_count),
        listItem('evidence', surface.carrier_evidence_count),
        listItem('continuity_packets', surface.continuity_packet_count),
        listItem('webhook_delay_shadow_reads', surface.webhook_delay_shadow_observation_count),
        listItem('webhook_delay_directive_intents', surface.webhook_delay_directive_record_count),
        listItem('webhook_delay_directive_deliveries', surface.webhook_delay_directive_delivery_count),
        listItem('resident_loop_shadow_reads', surface.resident_loop_shadow_run_count),
        listItem('resident_dispatch_decisions', surface.resident_dispatch_decision_count),
        listItem('dispatch_authority', surface.dispatch_authority),
      ];
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const taskItems = (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')));
      const authorityDecisionItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const authorityEventItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const continuityDecisionItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const webhookDelayShadowItems = (product.webhook_delay_shadow_observations || []).map((entry) => listItem(entry.observation_id || entry.generated_at, [entry.classification_state, entry.latest_delay_minutes, entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveItems = (product.webhook_delay_directive_records || []).map((entry) => listItem(entry.directive_record_id || entry.directive_intent?.directive_id, [entry.classification_state, entry.directive_authority, entry.fallback_status, entry.directive_action, entry.carrier_admission?.directive_visibility].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveDeliveryItems = (product.webhook_delay_directive_deliveries || []).map((entry) => listItem(entry.delivery_id || entry.directive_delivery_id, [entry.delivery_state, entry.carrier_session_id, entry.directive_authority, entry.dispatch_authority, entry.fallback_status].filter((value) => value != null && value !== '').join(' | ')));
      const residentLoopShadowItems = (product.resident_loop_shadow_runs || []).map((entry) => listItem(entry.loop_run_id || entry.run_started_at, [entry.loop_status, 'steps=' + (entry.step_count ?? 'unknown'), 'attention=' + (entry.operator_attention_count ?? 'unknown'), entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const residentDispatchItems = (product.resident_dispatch_decisions || []).map((entry) => listItem(entry.dispatch_decision_id || entry.carrier_session_id, [entry.decision_state, entry.dispatch_authority, entry.fallback_status, entry.dispatch_action].filter((value) => value != null && value !== '').join(' | ')));
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      el('productOverview').replaceChildren(
        renderListBlock('Operation', operationItems),
        renderListBlock('Product Surface', surfaceItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Operation Attention', state.attentionItems.map((item) => listItem(item.directive_id, [item.reason, item.operation_id].filter(Boolean).join(' | ')))),
        renderListBlock('Tasks', taskItems),
        renderListBlock('Authority Decisions', authorityDecisionItems),
        renderListBlock('Authority Events', authorityEventItems),
        renderListBlock('Continuity Decisions', continuityDecisionItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
        renderListBlock('Webhook Delay Shadow Reads', webhookDelayShadowItems),
        renderListBlock('Webhook Delay Directive Intents', webhookDelayDirectiveItems),
        renderListBlock('Webhook Delay Directive Deliveries', webhookDelayDirectiveDeliveryItems),
        renderListBlock('Resident Loop Shadow Reads', residentLoopShadowItems),
        renderListBlock('Resident Dispatch', residentDispatchItems),
        renderListBlock('Carrier Evidence', evidenceItems),
      );
      renderLastAuthority((product.authority_events || [])[0]);
      updateControlRoom();
    }
    function evidencePayload(event) {
      const payload = event.payload || {};
      const evidence = {
        code: payload.code,
        message: payload.message,
        operation: payload.operation,
        http_status: payload.http_status,
        site_registry_reason: payload.site_registry_reason,
        site_authority_decision: payload.site_authority_decision,
        provider: payload.provider_adapter_kind || payload.provider_request_status || payload.provider_execution_enabled,
        tool_name: payload.tool_name,
        status: payload.status,
        admission_action: payload.admission_action,
        admission_reason: payload.admission_reason,
        capability_ref: payload.capability_ref,
        effect_scope: payload.effect_scope,
        authority_ref: payload.authority_ref,
        directive_kind: payload.directive_kind,
        directive_id: payload.directive_id,
        input_event_id: payload.input_event_id,
        reason: payload.reason,
        target: payload.target,
        result_summary: payload.result_summary,
        text_delta: payload.text_delta,
      };
      return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined));
    }
    function compactEvidenceValue(value) {
      if (value == null || value === '') return 'none';
      if (typeof value === 'string') return value.length > 220 ? value.slice(0, 217) + '...' : value;
      return JSON.stringify(value);
    }
    function evidenceField(label, value) {
      const node = document.createElement('div');
      node.className = 'evidence-field';
      const key = document.createElement('b');
      key.textContent = label;
      const body = document.createElement('span');
      body.textContent = compactEvidenceValue(value);
      node.append(key, body);
      return node;
    }
    function focusActionButton(id, label, action) {
      const button = document.createElement('button');
      button.id = id;
      button.className = 'secondary';
      button.textContent = label;
      button.addEventListener('click', action);
      return button;
    }
    function focusActionRow(...buttons) {
      const row = document.createElement('div');
      row.className = 'actions';
      row.style.gridColumn = '1 / -1';
      row.append(...buttons);
      return row;
    }
    function operatorPrincipalLabel(principal) {
      return principal?.email || principal?.name || principal?.principal_id || 'anonymous';
    }
    function operatorPrincipalContext(principal = {}) {
      return [
        ['Principal', operatorPrincipalLabel(principal)],
        ['Principal ID', principal.principal_id || 'none'],
        ['Auth Type', principal.auth_type || 'unknown'],
        ['Tenant', principal.tenant_id || 'none'],
        ['Object ID', principal.object_id || 'none'],
        ['Operator Session', principal.operator_session_id || 'none'],
        ['Controlled Actions', (principal.controlled_actions || []).join(', ') || 'none'],
      ];
    }
    function renderOperatorIdentity(principal = state.operatorPrincipal) {
      state.operatorPrincipal = principal || state.operatorPrincipal;
      if (!state.operatorPrincipal) {
        el('operatorIdentity').innerHTML = '<div class="empty">No operator session loaded.</div>';
        updateControlRoom();
        return;
      }
      el('operatorIdentity').replaceChildren(...operatorPrincipalContext(state.operatorPrincipal).map(([label, value]) => evidenceField(label, value)));
      updateControlRoom();
    }
    function runtimePostureContext(status = {}) {
      return [
        ['Provider', status.provider_adapter_posture || status.provider_adapter_kind || 'unknown'],
        ['Provider Kind', status.provider_adapter_kind || 'none'],
        ['Provider Execution', status.provider_execution_enabled ?? 'unknown'],
        ['Tool Effects', status.tool_effect_posture || 'unknown'],
        ['Tool Effect Kind', status.tool_effect_adapter_kind || 'none'],
        ['Supported Tools', (status.supported_tools || []).join(', ') || 'none'],
        ['Session', status.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Tasks', (status.tasks || []).length],
        ['Events', status.event_count ?? state.events.length],
      ];
    }
    function renderRuntimePosture(status = state.runtimeStatus) {
      state.runtimeStatus = status || state.runtimeStatus;
      if (!state.runtimeStatus) {
        el('runtimePostureDetail').innerHTML = '<div class="empty">No runtime status loaded.</div>';
        return;
      }
      el('runtimePostureDetail').replaceChildren(...runtimePostureContext(state.runtimeStatus).map(([label, value]) => evidenceField(label, value)));
    }
    function siteFocusContext(site = {}) {
      return [
        ['Site', site.site_id || el('siteId').value.trim() || 'none'],
        ['Display Name', site.display_name || 'none'],
        ['Status', site.status || 'unknown'],
        ['Site Ref', site.site_ref || 'none'],
        ['Site Root', site.site_root || 'none'],
        ['Created', site.created_at || 'none'],
        ['Updated', site.updated_at || 'none'],
      ];
    }
    function focusedSite() {
      return state.siteFocus
        || state.operationProduct?.site
        || (el('siteId').value.trim() ? { site_id: el('siteId').value.trim() } : null);
    }
    function siteScopeLoaded(site = focusedSite()) {
      const siteId = site?.site_id || el('siteId').value.trim();
      return Boolean(siteId && state.productScope === 'site' && state.operationProduct?.site?.site_id === siteId);
    }
    function siteActionContext(site = focusedSite()) {
      const siteId = site?.site_id || el('siteId').value.trim() || '';
      const loaded = siteScopeLoaded(site);
      const operations = state.operationProduct?.operations || [];
      const memberships = currentMemberships(state.operationProduct || {});
      const authorityCount = (state.operationProduct?.authority_events || []).length + (state.operationProduct?.site_authority?.decisions || []).length;
      const command = classifyCloudflareSiteCommandState({
        site_id: siteId,
        scope_loaded: loaded,
        operation_count: operations.length,
        membership_count: memberships.length,
        authority_count: authorityCount,
      });
      return [
        ['Site', siteId || 'none'],
        ['Scope Loaded', loaded ? 'yes' : 'no'],
        ['Status', site?.status || state.operationProduct?.site?.status || 'unknown'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Operations', operations.length],
        ['Memberships', memberships.length],
        ['Authority Items', authorityCount],
        ['Next Action', command.next_action],
      ];
    }
    function renderSiteActionSummary(site = focusedSite()) {
      if (!site) {
        el('siteActionSummary').innerHTML = '<div class="empty">No site action loaded.</div>';
        return;
      }
      el('siteActionSummary').replaceChildren(...siteActionContext(site).map(([label, value]) => evidenceField(label, value)));
    }
    function focusSiteOperation() {
      const operation = state.operationFocus || state.operations[0] || state.operationProduct?.operation || null;
      if (operation) run(() => selectOperation(operation));
    }
    function focusSiteMembership() {
      const membership = state.membershipFocus || currentMemberships(state.operationProduct || {})[0] || null;
      if (membership) selectMembership(membership);
    }
    function renderSiteFocusDetail(site = state.siteFocus) {
      state.siteFocus = site || state.siteFocus;
      if (!state.siteFocus) {
        el('siteFocusDetail').innerHTML = '<div class="empty">No site loaded.</div>';
        renderSiteActionSummary();
        return;
      }
      renderSiteActionSummary(state.siteFocus);
      el('siteFocusDetail').replaceChildren(...siteFocusContext(state.siteFocus).map(([label, value]) => evidenceField(label, value)));
    }
    function evidenceMeaning(event) {
      const payload = event.payload || {};
      switch (event.event_kind) {
        case 'carrier_session_started': return 'Session admitted to the Cloudflare carrier runtime.';
        case 'carrier_command_executed': return 'Operator command entered the carrier command lane.';
        case 'input_admitted_to_turn': return 'Input entered a provider turn.';
        case 'turn_started': return 'Provider turn opened for the active session.';
        case 'provider_request_recorded': return 'Provider request recorded through ' + (payload.provider || payload.provider_adapter_kind || 'configured provider') + '.';
        case 'provider_text_delta_recorded': return 'Provider output recorded as carrier evidence.';
        case 'provider_tool_call_requested': return 'Provider requested tool ' + (payload.tool_name || 'unknown') + '.';
        case 'tool_call_requested': return 'Carrier requested tool execution for ' + (payload.tool_name || 'unknown') + '.';
        case 'tool_result_received': return 'Tool result recorded with status ' + (payload.status || 'unknown') + '.';
        case 'turn_completed': return 'Provider turn completed with posture ' + (payload.provider || payload.status || 'completed') + '.';
        case 'input_completed': return 'Input lifecycle reached a terminal state.';
        case 'directive_emitted': return 'Directive emitted for ' + (payload.directive_kind || 'unknown directive') + '.';
        case 'directive_receipt_recorded': return 'Directive receipt recorded by the carrier.';
        case 'directive_carrier_accepted_recorded': return 'Carrier accepted directive without provider work.';
        case 'directive_emission_authorized': return 'Directive emission was authorized.';
        case 'directive_emission_rule_recorded': return 'Directive emission rule was recorded.';
        case 'console_action_failed': return 'Console action failed before completing.';
        default: return 'Carrier evidence recorded for ' + (event.event_kind || 'unknown event') + '.';
      }
    }
    function evidenceActionContext(event) {
      const payload = event.payload || {};
      const siteAuthority = payload.site_authority_decision || {};
      const provider = payload.provider || payload.provider_adapter_kind || payload.provider_request_status || payload.provider_execution_enabled;
      const directive = payload.directive_kind || payload.directive_id || payload.input_event_id;
      const effect = payload.tool_name || payload.capability_ref || payload.effect_scope;
      const authority = payload.authority_ref || payload.admission_action || siteAuthority.action || siteAuthority.authority_locus;
      return [
        ['Meaning', evidenceMeaning(event)],
        ['Session', event.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Event Kind', event.event_kind || 'unknown'],
        ['Authority', [authority, payload.admission_reason || siteAuthority.reason].filter(Boolean).join(' / ') || 'none'],
        ['Effect', [effect, payload.status].filter(Boolean).join(' / ') || 'none'],
        ['Provider', provider || 'none'],
        ['Directive', directive || 'none'],
        ['Result', payload.result_summary || payload.message || payload.code || 'none'],
      ];
    }
    function renderEvents() {
      el('eventCount').textContent = String(state.events.length);
      el('cursor').textContent = String(state.afterSequence);
      const events = visibleEvents();
      updateControlRoom();
      renderEvidenceFocus();
      renderEvidenceActionSummary();
      renderEvidenceLanes();
      renderEvidenceReviewQueue(events);
      if (events.length === 0) {
        el('events').innerHTML = '<div class="empty">No matching events read yet.</div>';
        return;
      }
      el('events').replaceChildren(...events.map((event) => {
        const node = document.createElement('article');
        node.className = 'event' + (state.evidenceFocus && eventKey(state.evidenceFocus) === eventKey(event) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = eventTitle(event);
        const summary = document.createElement('span');
        summary.textContent = evidenceMeaning(event);
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(evidencePayload(event), null, 2);
        node.addEventListener('click', () => { focusEvidence(event); renderEvents(); });
        node.append(title, summary, pre);
        return node;
      }));
      el('events').scrollTop = el('events').scrollHeight;
    }
    async function refreshStatus() {
      const status = await api.status();
      el('provider').textContent = status.provider_adapter_posture || status.provider_adapter_kind || 'unknown';
      el('effects').textContent = status.tool_effect_posture || 'unknown';
      renderRuntimePosture(status);
      renderTasks(status.tasks || []);
      return status;
    }
    async function refreshOperation() {
      saveWorkbenchState();
      const body = await api.readOperation();
      renderOperationProduct(body);
      appendEvents((body.carrier_evidence || []).flatMap((entry) => entry.events || []));
      return body;
    }
    async function refreshSiteProduct() {
      saveWorkbenchState();
      const body = await api.readSite();
      renderSiteProduct(body);
      appendEvents((body.carrier_evidence || []).flatMap((entry) => entry.events || []));
      return body;
    }
    async function refreshSitesProduct() {
      saveWorkbenchState();
      const body = await api.readSites();
      renderSitesProduct(body);
      return body;
    }
    async function createOperationFromWorkbench() {
      const operationId = el('newOperationId').value.trim();
      if (!operationId) throw new Error('Operation ID is required.');
      const displayName = el('newOperationDisplayName').value.trim() || operationId;
      const operationKind = el('newOperationKind').value.trim() || 'cloudflare_control';
      const body = await api.createOperation(operationId, displayName, operationKind);
      if (body.operation?.operation_id) setCurrentOperation(body.operation.operation_id);
      renderLastAuthority(null, {
        event_kind: 'operation.create',
        action: body.action || 'created',
        reason: body.action === 'updated' ? 'site_operation_updated' : 'site_operation_created',
        evidence: { operation_id: operationId, operation_kind: operationKind, status: body.operation?.status || 'active' },
      });
      await refreshOperation();
    }
    function selectedAttention() {
      if (state.attentionFocus) return state.attentionFocus;
      return state.attentionItems.find((item) => item.status !== 'resolved') || state.attentionItems[0] || null;
    }
    async function createTaskFromFocusedAttention() {
      const attention = selectedAttention();
      if (!attention) return;
      const body = await api.createTask(['attention', attention.directive_id, attention.reason].filter(Boolean).join(' '));
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
    }
    async function createTaskFromFocusedDirectiveIntent() {
      const directiveIntent = state.webhookDelayDirectiveFocus || (state.operationProduct?.webhook_delay_directive_records || [])[0] || null;
      if (!directiveIntent) return;
      const body = await api.createTask(directiveIntentTaskTitle(directiveIntent));
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
      const task = taskForDirectiveIntent(directiveIntent);
      if (task) selectTask(task);
    }
    async function resolveFocusedAttention() {
      const attention = selectedAttention();
      const taskId = el('updateTaskId').value.trim() || state.taskFocus?.task_id || '';
      if (!attention || !taskId) return;
      const note = ['resolved_attention', attention.directive_id, attention.input_event_id, attention.reason].filter(Boolean).join(' ');
      const body = await api.updateTask(taskId, 'done', note);
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
    }
    async function refreshOperatorSession() {
      const session = await api.session();
      if (session?.principal) {
        renderOperatorIdentity(session.principal);
        el('membershipRole').textContent = session.principal.email || session.principal.principal_id;
      }
    }
    async function run(action) {
      el('error').textContent = '';
      try { await action(); } catch (error) {
        el('error').textContent = error.message;
        appendConsoleEvidence('console_action_failed', {
          message: error.message,
          operation: error.details?.operation,
          http_status: error.details?.http_status,
          code: error.details?.body?.code,
          site_registry_reason: error.details?.body?.site_registry_reason,
          site_authority_decision: error.details?.body?.site_authority_decision,
        });
      }
    }
    function setAutoRefresh(enabled) {
      if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
      state.autoRefreshTimer = enabled ? setInterval(() => run(refreshOperation), 15000) : null;
      el('autoRefreshOperation').setAttribute('aria-pressed', enabled ? 'true' : 'false');
      el('autoRefreshOperation').textContent = enabled ? 'Auto Refresh On' : 'Auto Refresh';
    }
    el('signInMicrosoft').addEventListener('click', () => { window.location.href = '/auth/microsoft/login'; });
    el('siteId').addEventListener('change', saveWorkbenchState);
    el('operationId').addEventListener('change', saveWorkbenchState);
    el('sessionId').addEventListener('change', saveWorkbenchState);
    el('useSelectedSession').addEventListener('click', () => setCurrentSession(el('operationSessionSelect').value));
    el('operationSessionSelect').addEventListener('change', () => setCurrentSession(el('operationSessionSelect').value));
    el('readSessionEvidence').addEventListener('click', () => run(readSelectedSessionEvidence));
    el('sessionActionUseSession').addEventListener('click', useFocusedSession);
    el('sessionActionReadEvidence').addEventListener('click', () => run(readSelectedSessionEvidence));
    el('sessionActionFocusEvidence').addEventListener('click', focusFocusedSessionEvidence);
    el('focusSessionPathEvidence').addEventListener('click', focusSessionPathEvidence);
    el('focusSessionPathTask').addEventListener('click', focusSessionPathTask);
    el('focusSessionPathDelivery').addEventListener('click', focusSessionPathDelivery);
    el('focusSessionPathChain').addEventListener('click', focusSessionPathChain);
    el('sessionEvidenceApplyAction').addEventListener('click', () => run(applySessionEvidenceAction));
    el('sessionEvidenceFocusAction').addEventListener('click', focusSessionPathEvidence);
    el('sessionEvidenceTaskAction').addEventListener('click', focusSessionPathTask);
    el('eventKindFilter').addEventListener('change', renderEvents);
    el('eventSessionFilter').addEventListener('change', renderEvents);
    el('raiseAttention').addEventListener('click', () => run(async () => { const body = await api.emitAttention(); appendEvents(body.events || []); await refreshOperation(); }));
    el('taskFromAttention').addEventListener('click', () => run(createTaskFromFocusedAttention));
    el('taskFromDirectiveIntent').addEventListener('click', () => run(createTaskFromFocusedDirectiveIntent));
    el('focusWebhookDelayChainObservation').addEventListener('click', focusWebhookDelayChainObservation);
    el('focusWebhookDelayChainIntent').addEventListener('click', focusWebhookDelayChainIntent);
    el('focusWebhookDelayChainDelivery').addEventListener('click', focusWebhookDelayChainDelivery);
    el('focusWebhookDelayChainSession').addEventListener('click', focusWebhookDelayChainSession);
    el('focusWebhookDelayChainTask').addEventListener('click', focusWebhookDelayChainTask);
    el('resolveAttention').addEventListener('click', () => run(resolveFocusedAttention));
    el('start').addEventListener('click', () => run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }));
    el('refresh').addEventListener('click', () => run(refreshOperation));
    el('readOperation').addEventListener('click', () => run(refreshOperation));
    el('readOperationScope').addEventListener('click', () => run(refreshOperation));
    el('operationActionUseOperation').addEventListener('click', useFocusedOperation);
    el('operationActionReadOperation').addEventListener('click', () => run(refreshOperation));
    el('operationActionFocusSession').addEventListener('click', focusOperationSession);
    el('focusOperationPathSession').addEventListener('click', focusOperationPathSession);
    el('focusOperationPathTask').addEventListener('click', focusOperationPathTask);
    el('focusOperationPathAttention').addEventListener('click', focusOperationPathAttention);
    el('focusOperationPathAuthority').addEventListener('click', focusOperationPathAuthority);
    el('focusOperationPathEvidence').addEventListener('click', focusOperationPathEvidence);
    el('controlRoomNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operatorRouteNextAction').addEventListener('click', applyOperatorRouteNextAction);
    el('workbenchReadinessNextAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('operationControlBoardNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operationControlBoardReadinessAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('operationControlBoardEvidenceAction').addEventListener('click', focusFlightDeckEvidence);
    el('operationControlTargetNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operationControlTargetEvidenceAction').addEventListener('click', focusFlightDeckEvidence);
    el('operationControlTargetReadinessAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('startResidentDispatch').addEventListener('click', () => run(startResidentDispatchFromWorkbench));
    el('continuityWorkflowNextAction').addEventListener('click', applyContinuityWorkflowNextStep);
    el('authorityNextAction').addEventListener('click', applyAuthorityNextAction);
    el('authorityReadSiteAction').addEventListener('click', () => run(refreshSiteProduct));
    el('authorityActionEvidenceAction').addEventListener('click', focusAuthorityEvidence);
    el('authorityPathFocusDecision').addEventListener('click', focusAuthorityPathDecision);
    el('authorityPathFocusEvidence').addEventListener('click', focusAuthorityEvidence);
    el('authorityPathRefresh').addEventListener('click', refreshAuthorityPath);
    el('authorityDecisionApplyAction').addEventListener('click', applyAuthorityDecisionReview);
    el('authorityDecisionEvidenceAction').addEventListener('click', focusAuthorityEvidence);
    el('authorityDecisionRefreshAction').addEventListener('click', refreshAuthorityPath);
    el('createOperation').addEventListener('click', () => run(createOperationFromWorkbench));
    el('autoRefreshOperation').addEventListener('click', () => setAutoRefresh(!state.autoRefreshTimer));
    el('readSites').addEventListener('click', () => run(refreshSitesProduct));
    el('sitesOverviewNextAction').addEventListener('click', focusNextSiteFromOverview);
    el('readSite').addEventListener('click', () => run(refreshSiteProduct));
    el('readSiteScope').addEventListener('click', () => run(refreshSiteProduct));
    el('siteActionReadSite').addEventListener('click', () => run(refreshSiteProduct));
    el('siteActionFocusOperation').addEventListener('click', focusSiteOperation);
    el('siteActionFocusMembership').addEventListener('click', focusSiteMembership);
    el('membershipActionPut').addEventListener('click', () => run(putFocusedMembership));
    el('membershipActionReadSite').addEventListener('click', () => run(refreshSiteProduct));
    el('membershipActionFocusAuthority').addEventListener('click', focusMembershipAuthority);
    el('putMembership').addEventListener('click', () => run(putFocusedMembership));
    el('read').addEventListener('click', () => run(async () => { const body = await api.readEvents(); appendEvents(body.events || []); await refreshStatus(); }));
    el('taskTitle').addEventListener('input', renderTaskCommandPreview);
    el('updateTaskId').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskEvidencePath(selectedTaskFromWorkbench()); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('updateTaskStatus').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskEvidencePath(selectedTaskFromWorkbench()); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('updateTaskNote').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('memberPrincipalId').addEventListener('input', () => renderMembershipActionSummary());
    el('memberRole').addEventListener('input', () => renderMembershipActionSummary());
    el('createTask').addEventListener('click', () => run(createTaskFromWorkbench));
    el('focusTaskEvidence').addEventListener('click', () => run(async () => { const task = selectedTaskFromWorkbench(); if (task) focusEvidenceFor(taskEvidencePredicate(task)); }));
    el('focusTaskPathSession').addEventListener('click', focusTaskPathSession);
    el('focusTaskPathEvidence').addEventListener('click', focusTaskPathEvidence);
    el('focusTaskPathDirective').addEventListener('click', focusTaskPathDirective);
    el('focusTaskPathDelivery').addEventListener('click', focusTaskPathDelivery);
    el('focusTaskPathChain').addEventListener('click', focusTaskPathChain);
    el('taskLifecycleApplyAction').addEventListener('click', () => run(applyTaskLifecycleAction));
    el('taskLifecycleEvidenceAction').addEventListener('click', focusTaskPathEvidence);
    el('taskLifecycleSessionAction').addEventListener('click', focusTaskPathSession);
    el('markTaskOpen').addEventListener('click', () => run(async () => { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_marked_open'); }));
    el('markTaskDone').addEventListener('click', () => run(async () => { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_marked_done'); }));
    el('updateTask').addEventListener('click', () => run(async () => {
      const status = el('updateTaskStatus').value.trim();
      if (!status) return;
      await updateFocusedTask(status);
    }));
    el('send').addEventListener('click', () => run(async () => { const content = el('input').value.trim(); if (!content) return; const body = await api.deliver(content); appendEvents(body.events || []); el('input').value = ''; await refreshStatus(); await refreshOperation(); }));
    loadWorkbenchState();
    refreshOperatorSession().then(() => refreshOperation()).catch((error) => appendConsoleEvidence('console_operation_autoload_failed', { message: error.message }));
  </script>
</body>
</html>`;
}

function withPrincipalEvidence(body, operation, principal) {
  if (!body || typeof body !== 'object') return body;
  if (operation === 'session.status') return { ...body, reader_principal: principal };
  if (operation === 'session.events.read') return { ...body, reader_principal: principal };
  if (operation === 'site.read') return { ...body, reader_principal: principal };
  if (operation === 'operation.read') return { ...body, reader_principal: principal };
  if (operation === 'operation.list') return { ...body, reader_principal: principal };
  return { ...body, principal };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('cloudflare_workers_ai_provider_timeout')), timeoutMs);
    }),
  ]);
}

function extractWorkersAiText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (Array.isArray(result?.response)) return result.response.map(String).join('\n');
  return JSON.stringify(result);
}

function extractWorkersAiToolCalls(result) {
  if (Array.isArray(result?.tool_calls)) return result.tool_calls;
  if (Array.isArray(result?.toolCalls)) return result.toolCalls;
  if (Array.isArray(result?.result?.tool_calls)) return result.result.tool_calls;
  return [];
}
