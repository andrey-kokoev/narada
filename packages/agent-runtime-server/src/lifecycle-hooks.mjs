import {
  createNarsLifecycleHookPayload,
  narsLifecycleHookPayloadFromEvent,
  narsLifecycleHooksForEvent,
  validateNarsLifecycleHookPayload,
} from '@narada2/carrier-protocol';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { valueAfterFlag } from './runtime-server-options.mjs';

const SECRET_PATTERN = /(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/giu;

function sanitizeHookFailure(error) {
  const name = error instanceof Error && error.name ? error.name : 'Error';
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    name,
    message: rawMessage.replace(SECRET_PATTERN, '$1=<redacted>'),
  };
}

function lifecycleHookModuleSpecifier(args = [], env = process.env) {
  const argumentValue = valueAfterFlag(args, '--lifecycle-hook-module', { trim: true });
  const environmentValue = typeof env.NARADA_LIFECYCLE_HOOK_MODULE === 'string'
    ? env.NARADA_LIFECYCLE_HOOK_MODULE.trim() || null
    : null;
  if (argumentValue && environmentValue && argumentValue !== environmentValue) {
    throw new Error('contradictory_nars_lifecycle_hook_module');
  }
  return argumentValue ?? environmentValue;
}

function moduleSource(moduleNamespace) {
  const defaultExport = moduleNamespace?.default;
  if (isObject(defaultExport) && (Object.hasOwn(defaultExport, 'hooks') || Object.hasOwn(defaultExport, 'onFailure'))) {
    return defaultExport;
  }
  return moduleNamespace;
}

function normalizeLifecycleHooks(rawHooks) {
  if (rawHooks === undefined) throw new Error('nars_lifecycle_hook_module_missing_hooks');
  const hooks = Array.isArray(rawHooks) ? rawHooks : [rawHooks];
  if (!hooks.every((hook) => typeof hook === 'function' || isObject(hook))) {
    throw new Error('nars_lifecycle_hook_module_invalid_hooks');
  }
  return hooks;
}

export async function loadNarsLifecycleHookDispatcher({ args = [], env = process.env, clock } = {}) {
  const specifier = lifecycleHookModuleSpecifier(args, env);
  if (!specifier) return createNarsLifecycleHookDispatcher({ clock });
  const moduleUrl = specifier.startsWith('file:') ? specifier : pathToFileURL(resolve(specifier)).href;
  let moduleNamespace;
  try {
    moduleNamespace = await import(moduleUrl);
  } catch (error) {
    throw new Error(
      `nars_lifecycle_hook_module_load_failed:${specifier}:${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const source = moduleSource(moduleNamespace);
  const rawHooks = Object.hasOwn(source, 'hooks') ? source.hooks : moduleNamespace.default;
  const onFailure = source.onFailure ?? null;
  if (onFailure !== null && typeof onFailure !== 'function') {
    throw new Error('nars_lifecycle_hook_module_invalid_on_failure');
  }
  return createNarsLifecycleHookDispatcher({
    hooks: normalizeLifecycleHooks(rawHooks),
    onFailure,
    clock,
  });
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
  const bindRequired = ({ name, flag, envNames }) => {
    const argvValue = valueAfterFlag(args, flag, { trim: true });
    const envValues = (envNames ?? [])
      .map((envName) => typeof env[envName] === 'string' && env[envName].trim() ? env[envName].trim() : undefined)
      .filter(Boolean);
    const distinctEnvValues = [...new Set(envValues)];
    if (distinctEnvValues.length > 1 || (argvValue && distinctEnvValues[0] && argvValue !== distinctEnvValues[0])) {
      throw new Error(`contradictory_nars_binding:${name}`);
    }
    const value = argvValue ?? distinctEnvValues[0];
    if (!value) throw new Error(`missing_nars_binding:${name}`);
    return value;
  };
  const agentId = bindRequired({ name: 'agent_id', flag: '--identity', envNames: ['NARADA_AGENT_ID'] });
  const sessionId = bindRequired({ name: 'session_id', flag: '--session', envNames: ['NARADA_NARS_SESSION_ID', 'NARADA_RUNTIME_SESSION_ID', 'NARADA_CARRIER_SESSION_ID'] });
  const siteRoot = bindRequired({ name: 'site_root', flag: '--site-root', envNames: ['NARADA_SITE_ROOT'] });
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
