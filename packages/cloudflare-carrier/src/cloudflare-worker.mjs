import { CloudflareCarrierSession } from './cloudflare-carrier.mjs';

const SNAPSHOT_KEY = 'cloudflare_carrier_session_snapshot_v1';
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';

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
    const response = await session.handle(request);
    if (mutatesSession(request.operation)) await this.#storeSnapshot(session);
    return response;
  }

  async #loadOrCreateSession(request) {
    if (this.session) return this.session;
    const snapshot = await this.state.storage.get(SNAPSHOT_KEY);
    const providerAdapter = createCloudflareAiProviderAdapter(this.env);
    if (snapshot) {
      this.session = CloudflareCarrierSession.fromSnapshot(snapshot, { providerAdapter });
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
      providerAdapter,
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
    const auth = authenticateCarrierRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);

    const body = await request.clone().json();
    const carrierSessionId = body.carrier_session_id ?? body.params?.carrier_session_id;
    if (!carrierSessionId) return jsonResponse({ ok: false, code: 'missing_carrier_session_id' }, 400);
    if (!env?.CLOUDFLARE_CARRIER_SESSIONS) {
      return jsonResponse({ ok: false, code: 'missing_durable_object_binding' }, 500);
    }
    const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
    const authenticatedRequest = new Request(request.url, {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, principal: auth.principal }),
    });
    const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(authenticatedRequest);
    const responseBody = await durableResponse.json();
    return jsonResponse(withPrincipalEvidence(responseBody, body.operation, auth.principal), durableResponse.status);
  },
};

export function createCloudflareAiProviderAdapter(env = {}) {
  if (!env.AI || typeof env.AI.run !== 'function') return null;
  const model = env.CLOUDFLARE_CARRIER_AI_MODEL ?? env.AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;
  const timeoutMs = clampInteger(env.CLOUDFLARE_CARRIER_AI_TIMEOUT_MS, 1000, 30000, 15000);
  const maxRetries = clampInteger(env.CLOUDFLARE_CARRIER_AI_MAX_RETRIES, 0, 3, 1);
  return {
    posture: 'cloudflare-workers-ai',
    adapter_kind: 'cloudflare-workers-ai',
    provider: 'cloudflare-workers-ai',
    model,
    async run({ input }) {
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const result = await withTimeout(env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content: 'You are Narada running inside a Cloudflare carrier. Answer the operator input concisely.',
              },
              {
                role: 'user',
                content: input.content,
              },
            ],
          }), timeoutMs);
          return { text: extractWorkersAiText(result) };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error('cloudflare_workers_ai_provider_failed');
    },
  };
}

export function authenticateCarrierRequest(request, env = {}) {
  const configured = Boolean(env.SERVICE_TOKEN || env.ADMIN_BEARER_TOKEN || env.CLOUDFLARE_CARRIER_SERVICE_TOKEN || env.CLOUDFLARE_CARRIER_ADMIN_TOKEN);
  if (!configured) return { ok: false, code: 'auth_not_configured', status: 500 };

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, code: 'unauthorized', status: 401 };

  if (token === (env.SERVICE_TOKEN ?? env.CLOUDFLARE_CARRIER_SERVICE_TOKEN)) {
    return {
      ok: true,
      principal: {
        auth_type: 'service',
        principal_id: 'service',
        controlled_actions: ['*'],
      },
    };
  }

  if (token === (env.ADMIN_BEARER_TOKEN ?? env.CLOUDFLARE_CARRIER_ADMIN_TOKEN)) {
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

function withPrincipalEvidence(body, operation, principal) {
  if (!body || typeof body !== 'object') return body;
  if (operation === 'session.status') return { ...body, reader_principal: principal };
  if (operation === 'session.events.read') return { ...body, reader_principal: principal };
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
