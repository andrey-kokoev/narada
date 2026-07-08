import {
  createNarsLifecycleHookPayload,
  narsLifecycleHookPayloadFromEvent,
  narsLifecycleHooksForEvent,
  validateNarsLifecycleHookPayload,
} from '@narada2/carrier-protocol';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';

const SECRET_PATTERN = /(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/giu;

function sanitizeHookFailure(error) {
  const name = error instanceof Error && error.name ? error.name : 'Error';
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    name,
    message: rawMessage.replace(SECRET_PATTERN, '$1=<redacted>'),
  };
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hookHandlersFor(hookEntry, hook) {
  if (typeof hookEntry === 'function') return [hookEntry];
  if (!isObject(hookEntry)) return [];
  const handler = hookEntry[hook];
  return typeof handler === 'function' ? [handler.bind(hookEntry)] : [];
}

export function createNarsLifecycleHookDispatcher({ hooks = [], onFailure = null, clock = () => new Date().toISOString() } = {}) {
  return {
    hooks: Array.isArray(hooks) ? [...hooks] : [],
    onFailure: typeof onFailure === 'function' ? onFailure : null,
    clock,
    dispatched: [],
    failures: [],
  };
}

export async function dispatchNarsLifecycleHook(dispatcher, hook, payloadInput = {}) {
  const payload = payloadInput.schema
    ? payloadInput
    : createNarsLifecycleHookPayload({ hook, timestamp: dispatcher?.clock?.() ?? new Date().toISOString(), ...payloadInput });
  const errors = validateNarsLifecycleHookPayload(payload);
  if (errors.length > 0) throw new Error(`invalid_nars_lifecycle_hook_payload:${errors.join(',')}`);

  dispatcher?.dispatched?.push?.({ hook, payload });
  const failures = [];
  for (const hookEntry of dispatcher?.hooks ?? []) {
    for (const handler of hookHandlersFor(hookEntry, hook)) {
      try {
        await handler(payload);
      } catch (error) {
        const failure = {
          event: 'runtime_error',
          code: 'nars_lifecycle_hook_failed',
          hook,
          hook_kind: payload.hook_kind,
          agent_id: payload.agent_id,
          ...(payload.agent_identity_ref === undefined ? {} : { agent_identity_ref: payload.agent_identity_ref }),
          session_id: payload.session_id,
          request_id: payload.request_id ?? null,
          turn_id: payload.turn_id ?? null,
          timestamp: dispatcher?.clock?.() ?? new Date().toISOString(),
          error: sanitizeHookFailure(error),
        };
        dispatcher?.failures?.push?.(failure);
        failures.push(failure);
        if (dispatcher?.onFailure) await dispatcher.onFailure(failure);
      }
    }
  }
  return { payload, failures };
}

export async function dispatchNarsLifecycleHooksForEvent(dispatcher, event) {
  const dispatched = [];
  const failures = [];
  for (const hook of narsLifecycleHooksForEvent(event)) {
    const result = await dispatchNarsLifecycleHook(
      dispatcher,
      hook,
      narsLifecycleHookPayloadFromEvent({ hook, event, timestamp: dispatcher?.clock?.() ?? new Date().toISOString() }),
    );
    dispatched.push(result.payload);
    failures.push(...result.failures);
  }
  return { dispatched, failures };
}

export function lifecycleBindingFromArgs(args = [], env = process.env) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    const value = index >= 0 ? args[index + 1] : undefined;
    return typeof value === 'string' && value.trim() && !value.startsWith('--') ? value.trim() : undefined;
  };
  const bindRequired = ({ name, flag, envName }) => {
    const argvValue = valueAfter(flag);
    const envValue = typeof env[envName] === 'string' && env[envName].trim() ? env[envName].trim() : undefined;
    if (argvValue && envValue && argvValue !== envValue) {
      throw new Error(`contradictory_nars_binding:${name}`);
    }
    const value = argvValue ?? envValue;
    if (!value) throw new Error(`missing_nars_binding:${name}`);
    return value;
  };
  const agentId = bindRequired({ name: 'agent_id', flag: '--identity', envName: 'NARADA_AGENT_ID' });
  const sessionId = bindRequired({ name: 'session_id', flag: '--session', envName: 'NARADA_CARRIER_SESSION_ID' });
  const siteRoot = bindRequired({ name: 'site_root', flag: '--site-root', envName: 'NARADA_SITE_ROOT' });
  let agentIdentityRef = null;
  if (typeof env.NARADA_AGENT_IDENTITY_REF === 'string' && env.NARADA_AGENT_IDENTITY_REF.trim()) {
    try {
      const parsed = JSON.parse(env.NARADA_AGENT_IDENTITY_REF);
      agentIdentityRef = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      agentIdentityRef = null;
    }
  }
  const resolvedAgentIdentityRef = resolveAgentIdentityRef(agentIdentityRef ?? agentId, {
    role: env.NARADA_AGENT_ROLE ?? null,
    site_id: env.NARADA_SITE_ID ?? null,
  });
  agentIdentityRef = resolvedAgentIdentityRef.status === 'resolved'
    ? resolvedAgentIdentityRef.value
    : buildAgentIdentityRefV2({
      identity_scope: { kind: 'unscoped' },
      local_agent_id: agentId,
      role: env.NARADA_AGENT_ROLE ?? agentId,
      legacy_agent_id: agentId,
    });
  return {
    agent_id: agentId,
    ...(agentIdentityRef ? { agent_identity_ref: agentIdentityRef } : {}),
    session_id: sessionId,
    metadata: {
      site_root: siteRoot,
      agent_start_event_id: env.NARADA_AGENT_START_EVENT_ID ?? null,
    },
  };
}

export function lifecycleHookFailureLine(failure) {
  return `[agent-runtime-server] lifecycle hook ${failure.hook} failed: ${failure.error?.name ?? 'Error'}: ${failure.error?.message ?? 'unknown error'}`;
}
