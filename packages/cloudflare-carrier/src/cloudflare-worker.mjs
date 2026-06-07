import { CloudflareCarrierSession } from './cloudflare-carrier.mjs';
import { classifyToolEffectAdmission } from '../../carrier-protocol/src/carrier-protocol.mjs';

const SNAPSHOT_KEY = 'cloudflare_carrier_session_snapshot_v1';
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF = 'cloudflare-carrier:capability/runtime-metadata-read:v1';
const CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE = 'cloudflare-carrier/runtime-metadata:read-only';
const CLOUDFLARE_KV_GET_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-get:v1';
const CLOUDFLARE_KV_GET_EFFECT_SCOPE = 'cloudflare-kv:read-only:get';
const CLOUDFLARE_KV_PUT_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-put:v1';
const CLOUDFLARE_KV_PUT_EFFECT_SCOPE = 'cloudflare-kv:write:put';
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
const CLOUDFLARE_KV_GET_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_kv_get',
  access: 'read_only',
  substrate: 'cloudflare-kv',
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
    const toolEffectAdapter = createCloudflareToolEffectAdapter(this.env);
    if (snapshot) {
      this.session = CloudflareCarrierSession.fromSnapshot(snapshot, { providerAdapter, toolEffectAdapter });
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
      toolEffectAdapter,
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
  const kvBinding = env.CLOUDFLARE_CARRIER_KV ?? env.NARADA_CARRIER_KV ?? null;
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
  return {
    configured: tools.length > 0,
    runtimeReadsEnabled,
    kvReadsEnabled: kvReadsEnabled && Boolean(kvBinding && typeof kvBinding.get === 'function'),
    kvWritesEnabled: kvWritesEnabled && Boolean(kvBinding && typeof kvBinding.put === 'function'),
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
  return classifyToolEffectAdmission(toolCall, {
    adapterConfigured: state.adapterConfigured ?? state.configured ?? state.runtimeReadsEnabled ?? false,
    admissionRequired: state.admissionRequired === true,
    supportedTools,
    admitReason: toolName === 'cloudflare_carrier_kv_put' ? 'write_tool_effect_admitted' : 'read_only_tool_effect_admitted',
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

function extractWorkersAiToolCalls(result) {
  if (Array.isArray(result?.tool_calls)) return result.tool_calls;
  if (Array.isArray(result?.toolCalls)) return result.toolCalls;
  if (Array.isArray(result?.result?.tool_calls)) return result.result.tool_calls;
  return [];
}
