import { CloudflareCarrierSession } from './cloudflare-carrier.mjs';
import { classifyToolEffectAdmission } from '../../carrier-protocol/src/carrier-protocol.mjs';
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
const CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_resident_loop_shadow_read.v1';
const CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE = 'cloudflare_shadow_read';
const WINDOWS_PRIMARY_DISPATCH_AUTHORITY = 'windows_primary_dispatcher';
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

async function listCloudflareContinuityPackets(env = {}, siteId, limit = 100) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareContinuityPacketSchema(db);
  const result = await db.prepare(`SELECT packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, imported_by_principal_id, imported_at
    FROM cloudflare_site_continuity_packets WHERE site_id = ? ORDER BY imported_at DESC LIMIT ?`).bind(siteId, boundedContinuityPacketReadLimit(limit)).all();
  return result.results ?? [];
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
};

async function handleCarrierApiRequest(request, env) {
    const auth = await authenticateCarrierApiRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);

    const body = await request.clone().json();
    if (isSiteProductOperation(body.operation)) {
      const siteResponse = await handleSiteProductApiRequest(body, auth.principal, env);
      return jsonResponse(withPrincipalEvidence(siteResponse.body, body.operation, auth.principal), siteResponse.status);
    }
    const carrierSessionId = body.carrier_session_id ?? body.params?.carrier_session_id;
    if (!carrierSessionId) return jsonResponse({ ok: false, code: 'missing_carrier_session_id' }, 400);
    if (!env?.CLOUDFLARE_CARRIER_SESSIONS) {
      return jsonResponse({ ok: false, code: 'missing_durable_object_binding' }, 500);
    }
    const registryAdmission = await validateCarrierSiteBindingForRequest(body, auth.principal, env);
    if (registryAdmission?.ok === false) {
      return jsonResponse(withPrincipalEvidence({
        ok: false,
        code: 'carrier_site_binding_denied',
        site_registry_code: registryAdmission.code,
        site_registry_reason: registryAdmission.reason ?? registryAdmission.code,
      }, body.operation, auth.principal), 403);
    }
    const sessionAuthorityDecision = validateCarrierSessionAuthorityForRequest(body, env);
    if (sessionAuthorityDecision && sessionAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
      return jsonResponse(withPrincipalEvidence({
        ok: false,
        code: 'site_authority_route_denied',
        operation: body.operation,
        site_authority_decision: sessionAuthorityDecision,
      }, body.operation, auth.principal), 403);
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
    const authenticatedRequest = new Request(request.url, {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...routedBody, principal: auth.principal }),
    });
    const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(authenticatedRequest);
    const responseBody = await durableResponse.json();
    return jsonResponse(withPrincipalEvidence(responseBody, body.operation, auth.principal), durableResponse.status);
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
    'resident_loop.shadow_read.record',
    'resident_loop.shadow_read.list',
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
  if (body.operation === 'operation.read') {
    const operation = response.operation;
    const siteId = operation?.site_id ?? params.site_id;
    const sessions = response.sessions ?? [];
    const tasks = await listOperationTasks(env, siteId, sessions);
    const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
    const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
    const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
    const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, sessions, principal, params);
    const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
    const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
    return {
      status: 200,
      body: {
        ...response,
        tasks,
        site_continuity_packets: continuityPackets,
        webhook_delay_shadow_observations: webhookDelayShadowObservations,
        resident_loop_shadow_runs: residentLoopShadowRuns,
        carrier_evidence: carrierEvidence,
        site_authority: siteAuthority,
        site_continuity: siteContinuity,
        operation_product_surface: {
          schema: 'narada.cloudflare_operation_product_surface.v1',
          operation_id: operation?.operation_id ?? null,
          site_id: siteId,
          session_count: sessions.length,
          task_count: tasks.length,
          carrier_evidence_count: carrierEvidence.length,
          continuity_packet_count: continuityPackets.length,
          webhook_delay_shadow_observation_count: webhookDelayShadowObservations.length,
          resident_loop_shadow_run_count: residentLoopShadowRuns.length,
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
  const siteId = response.site?.site_id ?? params.site_id;
  const tasks = await listSiteTasks(env, siteId);
  const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
  const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
  const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
  const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, response.sessions ?? [], principal, params);
  const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
  const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
  return {
    status: 200,
    body: {
      ...response,
      tasks,
      site_continuity_packets: continuityPackets,
      webhook_delay_shadow_observations: webhookDelayShadowObservations,
      resident_loop_shadow_runs: residentLoopShadowRuns,
      carrier_evidence: carrierEvidence,
      site_authority: siteAuthority,
      site_continuity: siteContinuity,
    },
  };
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

function webhookDelayShadowObservationId(siteId, observation) {
  return `webhook_delay_shadow_${safeIdToken(siteId)}_${safeIdToken(observation.generated_at)}_${safeIdToken(observation.latest.delay_minutes)}`;
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
        <h3>Operation Action</h3>
        <div id="operationActionSummary" class="evidence-summary"><div class="empty">No operation action loaded.</div></div>
        <div class="actions">
          <button id="operationActionUseOperation" class="secondary">Use Focused Operation</button>
          <button id="operationActionReadOperation" class="secondary">Read Focused Operation</button>
          <button id="operationActionFocusSession" class="secondary">Focus Operation Session</button>
        </div>
        <h3>Operation Focus Detail</h3>
        <div id="operationFocusDetail" class="evidence-summary"><div class="empty">No operation selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Session Navigator</h2>
        <div id="sessionNavigator" class="attention-items"><div class="empty">No operation sessions loaded.</div></div>
        <h3>Session Action</h3>
        <div id="sessionActionSummary" class="evidence-summary"><div class="empty">No session action loaded.</div></div>
        <div class="actions">
          <button id="sessionActionUseSession" class="secondary">Use Focused Session</button>
          <button id="sessionActionReadEvidence" class="secondary">Read Focused Evidence</button>
          <button id="sessionActionFocusEvidence" class="secondary">Focus Session Evidence</button>
        </div>
        <h3>Session Focus Detail</h3>
        <div id="sessionFocusDetail" class="evidence-summary"><div class="empty">No session selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operation Attention</h2>
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
        <div id="authorityState" class="attention-items"><div class="empty">No authority state loaded.</div></div>
        <div id="authorityFocusDetail" class="evidence-summary"><div class="empty">No authority decision selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operation Surface</h2>
        <div class="actions">
          <button id="readOperation" class="secondary">Read Operation</button>
          <button id="autoRefreshOperation" class="secondary" aria-pressed="false">Auto Refresh</button>
        </div>
      </div>
      <div class="product-panel">
        <h2>Site Product</h2>
        <div class="actions"><button id="readSite" class="secondary">Read Site</button></div>
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
        <h3>Task Focus Detail</h3>
        <div id="taskFocusDetail" class="evidence-summary"><div class="empty">No task selected.</div></div>
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
      <div id="events" class="events"><div class="empty">Start or resume a session to read carrier events.</div></div>
      <div class="composer">
        <label>Input<textarea id="input" placeholder="Send an operator input to the Cloudflare carrier"></textarea></label>
        <div class="actions"><button id="send">Send Input</button></div>
      </div>
    </section>
  </main>
  <script type="module">
    const WORKBENCH_STORAGE_KEY = 'narada.cloudflare.operationWorkbench.v1';
    const state = { events: [], afterSequence: 0, autoRefreshTimer: null, operationProduct: null, productScope: 'none', operations: [], consoleSequence: 0, operatorPrincipal: null, runtimeStatus: null, siteFocus: null, taskFocus: null, attentionItems: [], attentionFocus: null, evidenceFocus: null, evidenceLane: '', authorityFocus: null, operationFocus: null, sessionFocus: null, membershipFocus: null, continuityFocus: null, webhookDelayShadowFocus: null };
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
      readOperation() {
        return this.request('operation.read', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          carrier_event_limit: 20,
          session_limit: 10,
        });
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
      el('controlContinuity').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0) + ' packets';
      el('controlWorkbenchReadiness').textContent = operationWorkbenchReadiness(product);
      renderSiteActionSummary();
      renderMembershipActionSummary();
      renderOperationActionSummary();
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
      return missing.length === 0 ? 'ready' : 'missing ' + missing.join(', ');
    }
    function operationFlightDeckContext(product = {}) {
      const surface = product.operation_product_surface || {};
      const activeSession = el('sessionId').value.trim();
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const unresolvedAuthority = (product.site_authority?.decisions || []).filter((decision) => decision.action !== 'admit');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
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
      return {
        session: sessions.find((session) => session.carrier_session_id === activeSession) || state.sessionFocus || sessions[0] || null,
        attention: openAttention[0] || state.attentionFocus || state.attentionItems[0] || null,
        task: openTasks[0] || state.taskFocus || (product.tasks || [])[0] || null,
        authority: unresolvedAuthority[0] || state.authorityFocus || (product.site_authority?.decisions || [])[0] || null,
      };
    }
    function setEvidenceLane(key) {
      state.evidenceLane = key;
      const first = visibleEvents()[0] || null;
      if (first) focusEvidence(first);
      else { state.evidenceFocus = null; renderEvidenceFocus(); }
      renderEvidenceLanes();
      renderEvents();
      updateControlRoom();
    }
    function focusFlightDeckEvidence() {
      setEvidenceLane('');
      const activeSession = el('sessionId').value.trim();
      focusEvidenceFor((event) => activeSession && event.carrier_session_id === activeSession);
    }
    function applyFlightDeckNextAction() {
      const targets = operationFlightDeckTargets();
      if (targets.attention && targets.attention.status !== 'resolved') { selectAttentionItem(targets.attention); return; }
      if (targets.task && !['done', 'closed', 'resolved'].includes(String(targets.task.status || '').toLowerCase())) { selectTask(targets.task); return; }
      if (targets.session && !el('sessionId').value.trim()) { selectOperationSession(targets.session); return; }
      if (targets.authority && targets.authority.action !== 'admit') { selectAuthorityDecision(targets.authority); return; }
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
      const kind = event.event_kind || '';
      const payload = event.payload || {};
      if (kind.includes('failed') || kind.includes('rejected') || payload.status === 'failed' || payload.admission_action === 'deny' || payload.action === 'refuse') return 'failures';
      if (kind.startsWith('directive_') || payload.directive_kind || payload.directive_id) return 'directives';
      if (kind.includes('authority') || payload.site_authority_decision || payload.authority_ref) return 'authority';
      if (kind.includes('tool') || payload.tool_name || payload.capability_ref || payload.effect_scope) return 'tools';
      if (kind.startsWith('provider_') || kind.startsWith('turn_') || payload.provider || payload.provider_adapter_kind) return 'provider';
      if (kind.includes('input') || kind === 'carrier_command_executed' || kind === 'carrier_session_started') return 'input';
      return 'other';
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
      const payload = event.payload || {};
      const siteAuthority = payload.site_authority_decision || {};
      const taskId = payload.task_id || payload.task?.task_id || tryParseTaskId(payload.result_summary) || null;
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
      return { targetType, targetRef };
    }
    function tryParseTaskId(value) {
      if (!value || typeof value !== 'string') return null;
      try { return JSON.parse(value).task?.task_id || null; } catch { return null; }
    }
    function evidenceNextAction(event = {}) {
      const lane = classifyEvidenceLane(event);
      const payload = event.payload || {};
      if (lane === 'failures') return 'inspect_failure_and_retry_or_escalate';
      if (lane === 'authority') return 'inspect_authority_locus';
      if (lane === 'tools') return payload.status === 'failed' ? 'inspect_tool_failure' : 'inspect_tool_effect';
      if (lane === 'directives') return 'resolve_or_acknowledge_directive';
      if (lane === 'provider') return 'inspect_provider_turn';
      if (lane === 'input') return 'trace_input_lifecycle';
      return 'inspect_evidence_payload';
    }
    function evidenceActionSummaryContext(event = state.evidenceFocus) {
      if (!event) return [];
      const target = evidenceTargetContext(event);
      return [
        ['Next Action', evidenceNextAction(event)],
        ['Target Type', target.targetType],
        ['Target Ref', target.targetRef],
        ['Lane', classifyEvidenceLane(event)],
        ['Session', event.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Sequence', event.sequence ?? 'none'],
        ['Kind', event.event_kind || 'unknown'],
      ];
    }
    function focusEvidenceLaneForCurrent() {
      if (!state.evidenceFocus) return;
      state.evidenceLane = classifyEvidenceLane(state.evidenceFocus);
      renderEvidenceLanes();
      renderEvents();
      updateControlRoom();
    }
    function selectEvidenceSession() {
      if (state.evidenceFocus?.carrier_session_id) setCurrentSession(state.evidenceFocus.carrier_session_id);
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
        ),
      );
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
        renderAuthorityPostureSummary(decisions);
        renderAuthorityFocusDetail();
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
      renderAuthorityPostureSummary(decisions);
      renderAuthorityFocusDetail();
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
      const nextAction = decisions.length === 0 ? 'read_site_authority'
        : refused.length > 0 ? 'inspect_refused_authority'
        : unresolved.length > 0 ? 'resolve_authority_locus'
        : evidenceLoaded ? 'monitor_authority_admissions' : 'focus_authority_evidence';
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
        ['Next Action', nextAction],
      ];
    }
    function renderAuthorityActionSummary(product = state.operationProduct || {}) {
      el('authorityActionSummary').replaceChildren(...authorityActionContext(product).map(([label, value]) => evidenceField(label, value)));
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
        return;
      }
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
      const nextAction = !operationId ? 'select_or_create_operation'
        : !isActive ? 'use_focused_operation'
        : !scopeLoaded ? 'read_operation_scope'
        : sessionCount === 0 ? 'start_or_select_session'
        : evidenceLoaded ? 'inspect_operation_evidence' : 'read_operation_evidence';
      return [
        ['Operation', operationId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', operation?.status || state.operationProduct?.operation?.status || 'unknown'],
        ['Kind', operation?.operation_kind || state.operationProduct?.operation?.operation_kind || 'unknown'],
        ['Scope Loaded', scopeLoaded ? 'yes' : 'no'],
        ['Sessions', sessionCount],
        ['Evidence Loaded', evidenceLoaded ? 'yes' : 'no'],
        ['Next Action', nextAction],
      ];
    }
    function renderOperationActionSummary(operation = focusedOperation()) {
      if (!operation) {
        el('operationActionSummary').innerHTML = '<div class="empty">No operation action loaded.</div>';
        return;
      }
      el('operationActionSummary').replaceChildren(...operationActionContext(operation).map(([label, value]) => evidenceField(label, value)));
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
        renderOperationActionSummary();
        renderOperationFocusDetail();
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
      renderOperationActionSummary();
      renderOperationFocusDetail();
      updateControlRoom();
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
    function selectOperationSession(session) {
      if (!session?.carrier_session_id) return;
      state.sessionFocus = session;
      setCurrentSession(session.carrier_session_id);
      focusEvidenceFor((event) => event.carrier_session_id === session.carrier_session_id);
      renderSessionActionSummary(session);
      updateControlRoom();
    }
    function renderSessionNavigator(sessions = []) {
      if (sessions.length === 0) {
        state.sessionFocus = null;
        el('sessionNavigator').innerHTML = '<div class="empty">No operation sessions loaded.</div>';
        renderSessionActionSummary();
        renderSessionFocusDetail();
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
      renderSessionActionSummary();
      renderSessionFocusDetail();
      updateControlRoom();
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
      const nextAction = !sessionId ? 'select_or_start_session'
        : !isActive ? 'use_focused_session'
        : hasEvidence ? 'inspect_session_evidence'
        : 'read_session_evidence';
      return [
        ['Session', sessionId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', session?.binding_status || session?.status || 'active'],
        ['Agent', session?.agent_id || 'none'],
        ['Operation', session?.operation_id || el('operationId').value.trim() || 'none'],
        ['Evidence Loaded', hasEvidence ? 'yes' : 'no'],
        ['Next Action', nextAction],
      ];
    }
    function renderSessionActionSummary(session = focusedSession()) {
      if (!session) {
        el('sessionActionSummary').innerHTML = '<div class="empty">No session action loaded.</div>';
        return;
      }
      el('sessionActionSummary').replaceChildren(...sessionActionContext(session).map(([label, value]) => evidenceField(label, value)));
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
        return;
      }
      el('sessionFocusDetail').replaceChildren(
        ...sessionFocusContext(session).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('sessionFocusReadEvidenceAction', 'Read Evidence', () => run(readSelectedSessionEvidence)),
          focusActionButton('sessionFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => event.carrier_session_id === (session.carrier_session_id || el('sessionId').value.trim()))),
        ),
      );
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
      const nextAction = !principal ? 'enter_principal'
        : !siteLoaded ? 'read_membership_site'
        : !known ? 'put_membership'
        : status !== 'active' ? 'inspect_inactive_membership'
        : !authorityLoaded ? 'focus_membership_authority'
        : 'monitor_membership_authority';
      return [
        ['Principal', principal || 'none'],
        ['Role', role || 'unknown'],
        ['Status', status],
        ['Known Membership', known ? 'yes' : 'no'],
        ['Operator Principal', isOperator ? 'yes' : 'no'],
        ['Site Scope Loaded', siteLoaded ? 'yes' : 'no'],
        ['Authority Loaded', authorityLoaded ? 'yes' : 'no'],
        ['Next Action', nextAction],
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
        renderTaskLifecycleSummary(tasks);
        renderTaskFocusDetail();
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
      renderTaskLifecycleSummary(tasks);
      renderTaskFocusDetail();
      renderTaskCommandPreview();
      updateControlRoom();
    }
    function taskCommandPreviewContext() {
      const newTitle = el('taskTitle').value.trim();
      const selectedTask = selectedTaskFromWorkbench();
      const status = el('updateTaskStatus').value.trim();
      const note = el('updateTaskNote').value.trim();
      const activeSession = el('sessionId').value.trim();
      const attention = selectedAttention();
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
            : 'select_or_create_task';
      return [
        ['Command', command],
        ['Effect', effect],
        ['Task', selectedTask?.task_id || 'none'],
        ['Status', status || selectedTask?.status || 'none'],
        ['Session', selectedTask?.carrier_session_id || activeSession || 'none'],
        ['Attention', attention?.directive_id || 'none'],
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
      const nextAction = !state.taskFocus ? 'select_task'
        : focusStatus === 'open' ? 'mark_done_or_update'
        : focusStatus === 'closed' ? 'reopen_or_inspect_evidence'
        : 'normalize_status_or_update';
      const nextTask = tasks.find((task) => taskLifecycleStatus(task) === 'open') || state.taskFocus || tasks[0] || null;
      return [
        ['Open', counts.open],
        ['Closed', counts.closed],
        ['Other', counts.other],
        ['Focused Status', focusStatus],
        ['Next Task', nextTask?.task_id || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderTaskLifecycleSummary(tasks = state.operationProduct?.tasks || []) {
      if (!tasks.length) {
        el('taskLifecycleSummary').innerHTML = '<div class="empty">No task lifecycle loaded.</div>';
        return;
      }
      el('taskLifecycleSummary').replaceChildren(...taskLifecycleSummary(tasks).map(([label, value]) => evidenceField(label, value)));
    }
    function taskFocusContext(task = {}) {
      const status = taskLifecycleStatus(task);
      const followUp = status === 'open'
        ? 'mark_done_or_update'
        : status === 'closed'
          ? 'reopen_or_inspect_evidence'
          : 'normalize_status_or_update';
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
        ['Follow Up', followUp],
        ['Note', task.note || 'none'],
      ];
    }
    function renderTaskFocusDetail(task = state.taskFocus) {
      if (!task) {
        el('taskFocusDetail').innerHTML = '<div class="empty">No task selected.</div>';
        return;
      }
      el('taskFocusDetail').replaceChildren(
        ...taskFocusContext(task).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('taskFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor(taskEvidencePredicate(task))),
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
    function webhookDelayShadowKey(item = {}) {
      return item.observation_id || [item.site_id, item.generated_at, item.latest_delay_minutes].filter(Boolean).join('|');
    }
    function selectWebhookDelayShadow(item) {
      if (!item) return;
      state.webhookDelayShadowFocus = item;
      renderWebhookDelayShadowNavigator(state.operationProduct?.webhook_delay_shadow_observations || []);
      updateControlRoom();
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
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderProductScopeDetail(product);
      renderOperationFlightDeck(product);
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
      renderOperationNavigator(state.operations || []);
      renderOperationSessions(product.sessions || []);
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderProductScopeDetail(product);
      renderOperationFlightDeck(product);
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
        listItem('dispatch_authority', surface.dispatch_authority),
      ];
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const taskItems = (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')));
      const authorityDecisionItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const authorityEventItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const continuityDecisionItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const webhookDelayShadowItems = (product.webhook_delay_shadow_observations || []).map((entry) => listItem(entry.observation_id || entry.generated_at, [entry.classification_state, entry.latest_delay_minutes, entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
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
      const nextAction = !siteId ? 'select_site'
        : !loaded ? 'read_site_scope'
        : memberships.length === 0 ? 'load_or_create_membership'
        : operations.length === 0 ? 'create_or_select_operation'
        : authorityCount === 0 ? 'read_site_authority'
        : 'inspect_site_operations';
      return [
        ['Site', siteId || 'none'],
        ['Scope Loaded', loaded ? 'yes' : 'no'],
        ['Status', site?.status || state.operationProduct?.site?.status || 'unknown'],
        ['Operations', operations.length],
        ['Memberships', memberships.length],
        ['Authority Items', authorityCount],
        ['Next Action', nextAction],
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
    el('eventKindFilter').addEventListener('change', renderEvents);
    el('eventSessionFilter').addEventListener('change', renderEvents);
    el('raiseAttention').addEventListener('click', () => run(async () => { const body = await api.emitAttention(); appendEvents(body.events || []); await refreshOperation(); }));
    el('taskFromAttention').addEventListener('click', () => run(createTaskFromFocusedAttention));
    el('resolveAttention').addEventListener('click', () => run(resolveFocusedAttention));
    el('start').addEventListener('click', () => run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }));
    el('refresh').addEventListener('click', () => run(refreshOperation));
    el('readOperation').addEventListener('click', () => run(refreshOperation));
    el('readOperationScope').addEventListener('click', () => run(refreshOperation));
    el('operationActionUseOperation').addEventListener('click', useFocusedOperation);
    el('operationActionReadOperation').addEventListener('click', () => run(refreshOperation));
    el('operationActionFocusSession').addEventListener('click', focusOperationSession);
    el('continuityWorkflowNextAction').addEventListener('click', applyContinuityWorkflowNextStep);
    el('authorityNextAction').addEventListener('click', applyAuthorityNextAction);
    el('authorityReadSiteAction').addEventListener('click', () => run(refreshSiteProduct));
    el('authorityActionEvidenceAction').addEventListener('click', focusAuthorityEvidence);
    el('createOperation').addEventListener('click', () => run(createOperationFromWorkbench));
    el('autoRefreshOperation').addEventListener('click', () => setAutoRefresh(!state.autoRefreshTimer));
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
    el('updateTaskId').addEventListener('input', renderTaskCommandPreview);
    el('updateTaskStatus').addEventListener('input', renderTaskCommandPreview);
    el('updateTaskNote').addEventListener('input', renderTaskCommandPreview);
    el('memberPrincipalId').addEventListener('input', () => renderMembershipActionSummary());
    el('memberRole').addEventListener('input', () => renderMembershipActionSummary());
    el('createTask').addEventListener('click', () => run(createTaskFromWorkbench));
    el('focusTaskEvidence').addEventListener('click', () => run(async () => { const task = selectedTaskFromWorkbench(); if (task) focusEvidenceFor(taskEvidencePredicate(task)); }));
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
