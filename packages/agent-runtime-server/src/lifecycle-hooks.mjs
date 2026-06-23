import {
  createNarsLifecycleHookPayload,
  narsLifecycleHookPayloadFromEvent,
  narsLifecycleHooksForEvent,
  validateNarsLifecycleHookPayload,
} from '@narada2/carrier-protocol';

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
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    agent_id: valueAfter('--identity') ?? env.NARADA_AGENT_ID ?? 'unknown-agent',
    session_id: valueAfter('--session') ?? env.NARADA_CARRIER_SESSION_ID ?? 'unknown-session',
    metadata: {
      site_root: valueAfter('--site-root') ?? env.NARADA_SITE_ROOT ?? null,
      agent_start_event_id: env.NARADA_AGENT_START_EVENT_ID ?? null,
    },
  };
}

export function lifecycleHookFailureLine(failure) {
  return `[agent-runtime-server] lifecycle hook ${failure.hook} failed: ${failure.error?.name ?? 'Error'}: ${failure.error?.message ?? 'unknown error'}`;
}
