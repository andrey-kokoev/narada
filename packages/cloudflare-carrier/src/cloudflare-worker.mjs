import { CloudflareCarrierSession } from './cloudflare-carrier.mjs';

const SNAPSHOT_KEY = 'cloudflare_carrier_session_snapshot_v1';

export class CloudflareCarrierDurableObject {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
    this.session = null;
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
    const session = await this.#loadOrCreateSession(request);
    if (!session) return { ok: false, code: 'carrier_session_not_found' };
    const response = session.handle(request);
    if (mutatesSession(request.operation)) await this.#storeSnapshot(session);
    return response;
  }

  async #loadOrCreateSession(request) {
    if (this.session) return this.session;
    const snapshot = await this.state.storage.get(SNAPSHOT_KEY);
    if (snapshot) {
      this.session = CloudflareCarrierSession.fromSnapshot(snapshot);
      return this.session;
    }
    if (request.operation !== 'session.start') return null;
    const params = request.params ?? {};
    this.session = new CloudflareCarrierSession({
      carrier_session_id: params.carrier_session_id ?? request.carrier_session_id,
      agent_id: params.agent_id,
      site_id: params.site_id,
      site_root: params.site_root ?? params.site_ref,
      site_ref: params.site_ref,
    });
    return this.session;
  }

  async #storeSnapshot(session) {
    await this.state.storage.put(SNAPSHOT_KEY, session.snapshot());
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
    }
    const body = await request.clone().json();
    const carrierSessionId = body.carrier_session_id ?? body.params?.carrier_session_id;
    if (!carrierSessionId) return jsonResponse({ ok: false, code: 'missing_carrier_session_id' }, 400);
    if (!env?.CLOUDFLARE_CARRIER_SESSIONS) {
      return jsonResponse({ ok: false, code: 'missing_durable_object_binding' }, 500);
    }
    const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
    return env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(request);
  },
};

function mutatesSession(operation) {
  return [
    'session.start',
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
