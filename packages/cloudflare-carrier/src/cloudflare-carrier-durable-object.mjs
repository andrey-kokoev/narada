import {
  CloudflareCarrierSession,
  cloudflareCarrierSessionMutates,
} from './cloudflare-carrier.mjs';
import { createCloudflareCarrierConfig } from './cloudflare-carrier-config.mjs';

const SNAPSHOT_KEY = 'cloudflare_carrier_session_snapshot_v1';

function carrierEventsFromResponse(response = {}) {
  return (response.events ?? [response.event]).filter((event) => event?.schema && event?.carrier_session_id);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Durable Object session lifecycle boundary.
 *
 * The Worker entry supplies adapter/evidence ports. This keeps serialization,
 * snapshot recovery, and alarms independent from product HTTP handlers and
 * provider implementation details.
 */
export class CloudflareCarrierDurableObjectBase {
  constructor(state, env = {}, dependencies = {}) {
    this.state = state;
    this.env = env;
    this.config = createCloudflareCarrierConfig(env);
    this.dependencies = {
      createProviderAdapter: dependencies.createProviderAdapter ?? (() => null),
      createToolEffectAdapter: dependencies.createToolEffectAdapter ?? (() => null),
      createTaskStoreAdapter: dependencies.createTaskStoreAdapter ?? (() => null),
      recordEvidenceEvents: dependencies.recordEvidenceEvents ?? (async () => ({ ok: false, code: 'missing_carrier_evidence_index_port' })),
    };
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
    if (cloudflareCarrierSessionMutates(request.operation)) {
      await this.#storeSnapshot(session);
      await this.dependencies.recordEvidenceEvents(this.env, session, carrierEventsFromResponse(response));
      await this.#scheduleOperationHeartbeatAlarm(session);
    }
    return response;
  }

  async #alarmInLane() {
    const session = await this.#loadOrCreateSession({ operation: 'session.status' });
    if (!session || session.state.closed) return;
    const response = await session.handle({
      operation: 'directive.heartbeat.emit',
      request_id: `request_operation_heartbeat_alarm_${Date.now()}`,
      carrier_session_id: session.state.carrier_session_id,
      principal: { principal_id: 'principal:service' },
      internal_authority: 'cloudflare-durable-object-alarm',
      params: {
        operation_id: session.state.operation_id ?? null,
        reason: 'operation_continuity_heartbeat',
      },
    });
    await this.#storeSnapshot(session);
    await this.dependencies.recordEvidenceEvents(this.env, session, carrierEventsFromResponse(response));
    await this.#scheduleOperationHeartbeatAlarm(session);
  }

  async #loadOrCreateSession(request) {
    if (this.session) return this.session;
    const snapshot = await this.state.storage.get(SNAPSHOT_KEY);
    const providerAdapter = this.dependencies.createProviderAdapter(this.env, this.config);
    const toolEffectAdapter = this.dependencies.createToolEffectAdapter(this.env, this.config);
    const taskStoreAdapter = this.dependencies.createTaskStoreAdapter(this.env, this.config);
    if (snapshot) {
      this.session = CloudflareCarrierSession.fromSnapshot(snapshot, {
        providerAdapter,
        toolEffectAdapter,
        taskStoreAdapter,
        intelligenceDiagnosticsEnabled: this.config.capabilities.intelligenceDiagnostics,
      });
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
      intelligenceDiagnosticsEnabled: this.config.capabilities.intelligenceDiagnostics,
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

