import { redactProviderRuntimeBinding, resolveProviderRuntimeBinding } from '@narada2/carrier-provider-contract';
import { createProviderCall } from '@narada2/nars-provider-runtime/provider-call';
import {
  createNarsProviderRuntimeReconfigurationStateMachine,
} from './provider-runtime-reconfiguration-state.mjs';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bindingOverrides(settings = {}) {
  return {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    thinking: settings.thinking,
  };
}

function runtimeContextForBinding(runtimeContext, binding) {
  return {
    ...runtimeContext,
    intelligenceProvider: binding.provider_id,
    providerSettings: {
      ...runtimeContext.providerSettings,
      apiKey: binding.api_key,
      baseUrl: binding.base_url,
      model: binding.model,
      thinking: binding.reasoning_effort,
      runtimeBinding: binding,
    },
  };
}

function activeRecord(binding, call) {
  return {
    binding,
    provider: binding.provider_id,
    model: binding.model,
    thinking: binding.reasoning_effort,
    call,
  };
}

function targetFromParams(params, active) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('provider_runtime_reconfiguration_params_required');
  }
  const hasProvider = params.provider !== undefined && params.provider !== null;
  const hasModel = params.model !== undefined && params.model !== null;
  const hasThinking = params.thinking !== undefined && params.thinking !== null;
  const provider = hasProvider ? nonEmpty(params.provider) : active.provider;
  const model = hasModel ? nonEmpty(params.model) : null;
  const thinking = hasThinking ? nonEmpty(params.thinking) : null;
  if (hasProvider && !provider) throw new Error('provider_runtime_reconfiguration_provider_invalid');
  if (hasModel && !model) throw new Error('provider_runtime_reconfiguration_model_invalid');
  if (hasThinking && !thinking) throw new Error('provider_runtime_reconfiguration_thinking_invalid');
  if (!hasProvider && !model && !thinking) {
    throw new Error('provider_runtime_reconfiguration_target_required');
  }
  return { provider, model, thinking };
}

export function createNarsProviderRuntimeController({
  runtimeContext = {},
  env = process.env,
  createCall = createProviderCall,
  now = () => new Date().toISOString(),
  onTransition = () => {},
  isBusy = () => false,
} = {}) {
  const initialProvider = nonEmpty(runtimeContext.intelligenceProvider);
  if (!initialProvider) throw new Error('provider_runtime_controller_provider_required');
  const initialBinding = resolveProviderRuntimeBinding(initialProvider, {
    env,
    overrides: bindingOverrides(runtimeContext.providerSettings),
  });
  let active = activeRecord(initialBinding, createCall({ runtimeContext, env }));
  let lock = null;
  let lastReconfiguration = null;
  let nextRequestNumber = 1;

  function snapshot() {
    return {
      provider: active.provider,
      model: active.model,
      thinking: active.thinking,
      provider_runtime_binding: redactProviderRuntimeBinding(active.binding),
      reconfiguration: lock?.snapshot() ?? lastReconfiguration?.snapshot() ?? null,
    };
  }

  function transition(machine, state, evidence = {}, previous = active) {
    return machine.transition(state, {
      previous_provider: previous.provider,
      previous_model: previous.model,
      ...evidence,
    });
  }

  async function reconfigure(params = {}, options = {}) {
    const requestId = nonEmpty(params?.request_id)
      ?? nonEmpty(params?.requestId)
      ?? `runtime_reconfiguration_${nextRequestNumber++}`;
    const machine = createNarsProviderRuntimeReconfigurationStateMachine({
      requestId,
      metadata: { method: 'runtime.intelligence.reconfigure' },
      now,
      onTransition,
    });
    machine.transition('requested');
    if (lock) {
      machine.transition('refused', { reason: 'reconfiguration_in_progress' });
      lastReconfiguration = machine;
      return controllerResult(machine, { target: null });
    }
    lock = machine;
    try {
      transition(machine, 'validating');
      const target = targetFromParams(params, active);
      if (options.isBusy?.() ?? isBusy()) {
        transition(machine, 'refused', { reason: 'runtime_not_at_clean_turn_boundary', target });
        return controllerResult(machine, { target });
      }
      const sameProvider = target.provider === active.provider;
      const candidateBinding = resolveProviderRuntimeBinding(target.provider, {
        env,
        overrides: {
          apiKey: sameProvider ? initialOrActiveApiKey(active) : undefined,
          baseUrl: sameProvider ? initialOrActiveBaseUrl(active) : undefined,
          model: target.model ?? (sameProvider ? active.model : undefined),
          thinking: target.thinking ?? (sameProvider ? active.thinking : undefined),
        },
      });
      const candidateContext = runtimeContextForBinding(runtimeContext, candidateBinding);
      const candidateCall = createCall({ runtimeContext: candidateContext, env });
      const candidate = activeRecord(candidateBinding, candidateCall);
      const previous = active;
      transition(machine, 'admitted', { target: publicBinding(candidateBinding) });
      transition(machine, 'switching', { target: publicBinding(candidateBinding) });
      active = candidate;
      transition(machine, 'active', { active: publicBinding(candidateBinding) }, previous);
      return controllerResult(machine, { active: publicBinding(candidateBinding) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (machine.state === 'validating' || machine.state === 'admitted') {
        transition(machine, 'refused', { reason: 'target_not_admitted', error: message });
      } else if (machine.state === 'switching') {
        transition(machine, 'failed', { reason: 'runtime_reconfiguration_failed', error: message });
      } else {
        throw error;
      }
      return controllerResult(machine, { error: message });
    } finally {
      lock = null;
      lastReconfiguration = machine;
    }
  }

  return Object.freeze({
    callProvider: (messages, tools, overrides = {}) => active.call(messages, tools, overrides),
    snapshot,
    reconfigure,
  });
}

function controllerResult(machine, extras = {}) {
  const terminalRecord = machine.history().at(-1) ?? {};
  return {
    ...machine.snapshot(),
    ...(terminalRecord.reason ? { reason: terminalRecord.reason } : {}),
    ...(terminalRecord.error ? { error: terminalRecord.error } : {}),
    ...extras,
  };
}

function publicBinding(binding) {
  return {
    provider: binding.provider_id,
    model: binding.model,
    thinking: binding.reasoning_effort,
    provider_runtime_binding: redactProviderRuntimeBinding(binding),
  };
}

function initialOrActiveApiKey(active) {
  return active.binding.api_key ?? undefined;
}

function initialOrActiveBaseUrl(active) {
  return active.binding.base_url ?? undefined;
}

