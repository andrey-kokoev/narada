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
    const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, sessions, principal, params);
    const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
    const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
    return {
      status: 200,
      body: {
        ...response,
        tasks,
        site_continuity_packets: continuityPackets,
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
  const carrierEvidence = await readCarrierEvidenceForSiteSessions(env, response.sessions ?? [], principal, params);
  const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
  const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
  return {
    status: 200,
    body: {
      ...response,
      tasks,
      site_continuity_packets: continuityPackets,
      carrier_evidence: carrierEvidence,
      site_authority: siteAuthority,
      site_continuity: siteContinuity,
    },
  };
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
    .task-panel { margin-top: 16px; border-top: 1px solid #d7d7ce; padding-top: 14px; }
    .task-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .tasks { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .task { border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; }
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
    .events { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
    .event { border: 1px solid #d9dcd3; border-radius: 8px; padding: 10px; background: #fff; }
    .event strong { display: block; color: #1f4e48; font-size: 13px; overflow-wrap: anywhere; }
    .event pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: #343941; }
    .composer { padding: 12px 14px; border-top: 1px solid #d7d7ce; }
    .error { margin-top: 12px; color: #a5361f; font-size: 13px; overflow-wrap: anywhere; }
    .empty { color: #686d75; font-size: 14px; padding: 24px 4px; }
    @media (max-width: 840px) { main { grid-template-columns: 1fr; } section { min-height: 560px; } }
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
      <div class="control-room">
        <h2>Control Room</h2>
        <div class="control-room-grid">
          <div class="control-room-item"><b>Operation</b><span id="controlOperation">none</span></div>
          <div class="control-room-item"><b>Selected Session</b><span id="controlSession">none</span></div>
          <div class="control-room-item"><b>Authority Locus</b><span id="controlAuthorityLocus">unknown</span></div>
          <div class="control-room-item"><b>Task Focus</b><span id="controlTaskFocus">none</span></div>
          <div class="control-room-item"><b>Evidence Window</b><span id="controlEvidenceWindow">0 events</span></div>
          <div class="control-room-item"><b>Continuity</b><span id="controlContinuity">unknown</span></div>
        </div>
      </div>
      <div class="product-panel">
        <h2>Last Authority</h2>
        <div id="lastAuthority" class="task"><strong>No authority action loaded.</strong><span>Read Site or Put Membership to inspect evidence.</span></div>
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
      </div>
      <div class="product-panel">
        <h2>Site Membership</h2>
        <label>Principal ID<input id="memberPrincipalId" placeholder="microsoft:tenant:object-id"></label>
        <label>Role<input id="memberRole" value="viewer"></label>
        <div class="actions"><button id="putMembership" class="secondary">Put Membership</button></div>
      </div>
      <div class="task-panel">
        <h2>Task State</h2>
        <label>New task<input id="taskTitle" placeholder="Task title"></label>
        <div class="actions"><button id="createTask" class="secondary">Create Task</button></div>
        <label>Task ID<input id="updateTaskId" placeholder="cloudflare-task-1"></label>
        <label>Status<input id="updateTaskStatus" value="done"></label>
        <label>Note<input id="updateTaskNote" placeholder="Update note"></label>
        <div class="actions"><button id="updateTask" class="secondary">Update Task</button></div>
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
      <div id="events" class="events"><div class="empty">Start or resume a session to read carrier events.</div></div>
      <div class="composer">
        <label>Input<textarea id="input" placeholder="Send an operator input to the Cloudflare carrier"></textarea></label>
        <div class="actions"><button id="send">Send Input</button></div>
      </div>
    </section>
  </main>
  <script type="module">
    const WORKBENCH_STORAGE_KEY = 'narada.cloudflare.operationWorkbench.v1';
    const state = { events: [], afterSequence: 0, autoRefreshTimer: null, operationProduct: null, consoleSequence: 0, taskFocus: null };
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
      putMembership(memberPrincipalId, role) {
        return this.request('site.membership.put', {
          site_id: el('siteId').value.trim(),
          member_principal_id: memberPrincipalId,
          role,
          status: 'active',
        }, { request_id: 'console_membership_put_' + Date.now() });
      },
      readEvents() { return this.request('session.events.read', { after_sequence: state.afterSequence }); },
      command(command, args = []) { return this.request('carrier.command.execute', { command, args }, { request_id: 'console_command_' + Date.now() }); },
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
      updateControlRoom();
    }
    function setCurrentSession(carrierSessionId) {
      const next = String(carrierSessionId || '').trim();
      if (!next) return;
      el('sessionId').value = next;
      el('operationSessionSelect').value = next;
      saveWorkbenchState();
      state.events = [];
      state.afterSequence = 0;
      renderEvents();
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
    function appendEvents(events = []) {
      for (const event of events) {
        if (state.events.some((existing) => eventKey(existing) === eventKey(event))) continue;
        state.events.push(event);
        const sequence = Number(event.sequence || 0);
        if (Number.isInteger(sequence)) state.afterSequence = Math.max(state.afterSequence, sequence);
      }
      refreshEventKindFilter();
      renderEvents();
    }
    function updateControlRoom() {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      const activeSession = el('sessionId').value.trim();
      const activeDecision = (product.site_authority?.decisions || []).find((decision) => decision.mutation_class === 'cloudflare_carrier_session')
        || (product.site_authority?.decisions || [])[0]
        || null;
      el('controlOperation').textContent = product.operation?.operation_id || el('operationId').value.trim() || 'none';
      el('controlSession').textContent = activeSession || 'none';
      el('controlAuthorityLocus').textContent = activeDecision ? [activeDecision.authority_locus || 'unresolved', activeDecision.action || 'unknown'].join(' / ') : 'unknown';
      el('controlTaskFocus').textContent = state.taskFocus ? [state.taskFocus.task_id, state.taskFocus.status].filter(Boolean).join(' / ') : 'none';
      el('controlEvidenceWindow').textContent = String(surface.carrier_evidence_count ?? state.events.length) + ' evidence groups / ' + state.events.length + ' loaded events';
      el('controlContinuity').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0) + ' packets';
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
        if (sessionFilter === 'active' && activeSession && event.carrier_session_id && event.carrier_session_id !== activeSession) return false;
        return true;
      });
    }
    function renderTasks(tasks = []) {
      el('taskCount').textContent = String(tasks.length);
      if (tasks.length === 0) {
        el('tasks').innerHTML = '<div class="empty">No tasks yet.</div>';
        return;
      }
      el('tasks').replaceChildren(...tasks.map((task) => {
        const node = document.createElement('article');
        node.className = 'task';
        const title = document.createElement('strong');
        title.textContent = task.task_id + ' ' + task.title;
        const meta = document.createElement('span');
        meta.textContent = [task.status, task.carrier_session_id, task.note].filter(Boolean).join(' | ');
        node.addEventListener('click', () => {
          state.taskFocus = task;
          el('updateTaskId').value = task.task_id;
          el('updateTaskStatus').value = task.status || 'done';
          el('updateTaskNote').value = task.note || '';
          if (task.carrier_session_id) setCurrentSession(task.carrier_session_id);
          updateControlRoom();
        });
        node.append(title, meta);
        return node;
      }));
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
    function renderSiteProduct(product) {
      state.operationProduct = product;
      el('siteStatus').textContent = product.site?.status || 'unknown';
      el('operationStatus').textContent = 'site scope';
      el('membershipRole').textContent = product.membership?.role || 'none';
      el('sessionCount').textContent = String((product.sessions || []).length);
      el('taskCount').textContent = String((product.tasks || []).length);
      el('evidenceCount').textContent = String((product.carrier_evidence || []).length);
      el('authorityCount').textContent = String((product.authority_events || []).length);
      el('continuityCount').textContent = String((product.site_continuity_packets || []).length);
      renderTasks(product.tasks || []);
      updateControlRoom();
      const siteItems = [
        listItem('site_id', product.site?.site_id),
        listItem('display_name', product.site?.display_name),
        listItem('principal', product.reader_principal?.email || product.reader_principal?.principal_id),
      ];
      const membershipItems = (product.memberships || []).map((membership) => listItem(membership.principal_id, membership.role + ' / ' + membership.status));
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const authorityItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const authorityRoutingItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const continuityItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      renderOperationSessions(product.sessions || []);
      el('productOverview').replaceChildren(
        renderListBlock('Site', siteItems),
        renderListBlock('Memberships', membershipItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Tasks', (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')))),
        renderListBlock('Authority Events', authorityItems),
        renderListBlock('Authority Routing', authorityRoutingItems),
        renderListBlock('Site Continuity', continuityItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
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
    }
    function renderOperationProduct(product) {
      state.operationProduct = product;
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
      renderOperationSessions(product.sessions || []);
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
      ];
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const taskItems = (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')));
      const authorityDecisionItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const authorityEventItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const continuityDecisionItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      el('productOverview').replaceChildren(
        renderListBlock('Operation', operationItems),
        renderListBlock('Product Surface', surfaceItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Tasks', taskItems),
        renderListBlock('Authority Decisions', authorityDecisionItems),
        renderListBlock('Authority Events', authorityEventItems),
        renderListBlock('Continuity Decisions', continuityDecisionItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
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
        result_summary: payload.result_summary,
        text_delta: payload.text_delta,
      };
      return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined));
    }
    function renderEvents() {
      el('eventCount').textContent = String(state.events.length);
      el('cursor').textContent = String(state.afterSequence);
      const events = visibleEvents();
      updateControlRoom();
      if (events.length === 0) {
        el('events').innerHTML = '<div class="empty">No matching events read yet.</div>';
        return;
      }
      el('events').replaceChildren(...events.map((event) => {
        const node = document.createElement('article');
        node.className = 'event';
        const title = document.createElement('strong');
        title.textContent = (event.carrier_session_id ? event.carrier_session_id + ' ' : '') + '#' + event.sequence + ' ' + event.event_kind;
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(evidencePayload(event), null, 2);
        node.append(title, pre);
        return node;
      }));
      el('events').scrollTop = el('events').scrollHeight;
    }
    async function refreshStatus() {
      const status = await api.status();
      el('provider').textContent = status.provider_adapter_posture || status.provider_adapter_kind || 'unknown';
      el('effects').textContent = status.tool_effect_posture || 'unknown';
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
    async function refreshOperatorSession() {
      const session = await api.session();
      if (session?.principal) {
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
    el('eventKindFilter').addEventListener('change', renderEvents);
    el('eventSessionFilter').addEventListener('change', renderEvents);
    el('start').addEventListener('click', () => run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }));
    el('refresh').addEventListener('click', () => run(refreshOperation));
    el('readOperation').addEventListener('click', () => run(refreshOperation));
    el('autoRefreshOperation').addEventListener('click', () => setAutoRefresh(!state.autoRefreshTimer));
    el('readSite').addEventListener('click', () => run(async () => { const body = await api.readSite(); renderSiteProduct(body); appendEvents((body.carrier_evidence || []).flatMap((entry) => entry.events || [])); }));
    el('putMembership').addEventListener('click', () => run(async () => {
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
    }));
    el('read').addEventListener('click', () => run(async () => { const body = await api.readEvents(); appendEvents(body.events || []); await refreshStatus(); }));
    el('createTask').addEventListener('click', () => run(async () => { const title = el('taskTitle').value.trim(); if (!title) return; const body = await api.command('/task', ['create', ...title.split(/\\s+/)]); appendEvents(body.events || []); el('taskTitle').value = ''; await refreshStatus(); await refreshOperation(); }));
    el('updateTask').addEventListener('click', () => run(async () => {
      const taskId = el('updateTaskId').value.trim();
      const status = el('updateTaskStatus').value.trim();
      const note = el('updateTaskNote').value.trim();
      if (!taskId || !status) return;
      const body = await api.command('/task', ['update', taskId, status, ...note.split(/\\s+/).filter(Boolean)]);
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
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
