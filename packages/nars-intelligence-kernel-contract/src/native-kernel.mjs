import {
  assertNarsAdmittedInput,
  assertNarsAdmittedTurn,
  assertNarsKernelCapabilityGateway,
  assertNarsKernelEventSink,
  assertNarsKernelStartContext,
  buildKernelHealthProjection,
  buildKernelStartEvidence,
  createNarsToolRound,
  normalizeNarsExecutionPolicy,
  NarsKernelContractError,
} from './index.mjs';

const NATIVE_CAPABILITIES = Object.freeze([
  'provider-cognition',
  'provider-retry',
  'cancellation',
  'health-projection',
]);

function publicResourceId(value) {
  if (typeof value === 'string') return value.replace(/^(?:model|inference-provider):/, '');
  if (!value || typeof value !== 'object') return null;
  return publicResourceId(value.id ?? null);
}

/**
 * The native adapter is intentionally small: session-core remains the owner of
 * admission, journaling, and terminal transitions. It is useful both as the
 * production native implementation and as the substitutability control.
 */
export function createNarsNativeKernel({
  providerAdapter,
  now = () => new Date().toISOString(),
  kernelVersion = 'native-0.1.0',
  runtimeContext = {},
} = {}) {
  if (!providerAdapter || typeof providerAdapter.invoke !== 'function') {
    throw new NarsKernelContractError('native_provider_adapter_required', 'Native kernel requires a provider adapter.');
  }
  let state = 'created';
  let activeTurnId = null;
  let activeTurnCompletion = null;
  let resolveActiveTurnCompletion = null;
  let started = null;
  let lastError = null;
  let sequence = 0;
  let pendingAbort = null;
  let currentConfig = {
    provider: runtimeContext.provider ?? null,
    model: runtimeContext.model ?? null,
    thinking: runtimeContext.thinking ?? null,
    executionPolicy: normalizeNarsExecutionPolicy(runtimeContext.executionPolicy ?? runtimeContext.execution_policy, {
      sourceKind: 'runtime-config',
    }),
  };
  let closed = false;
  const compactError = (error, fallback) => ({
    code: error?.code ?? fallback,
    message: String(error instanceof Error ? error.message : error?.message ?? error ?? fallback)
      .replace(
        /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|bearer)["']?\s*[:=]\s*["']?)([^\s,'"`}]+)(["']?)/gi,
        '$1[redacted]$3',
      ),
  });
  const settleActiveTurn = () => {
    resolveActiveTurnCompletion?.();
    resolveActiveTurnCompletion = null;
    activeTurnId = null;
    activeTurnCompletion = null;
    pendingAbort = null;
  };

  const emit = async (sink, event) => sink({
    ...event,
    sequence: ++sequence,
    timestamp: now(),
  });

  const health = () => Object.freeze({
    ...buildKernelHealthProjection({
      kernelKind: 'narada-native',
      kernelVersion,
      provider: publicResourceId(currentConfig.provider),
      model: publicResourceId(currentConfig.model),
      thinking: typeof currentConfig.thinking === 'string' ? currentConfig.thinking.trim() || null : null,
      executionPolicy: currentConfig.executionPolicy,
      kernelState: state,
      activeTurnId,
      capabilityProfile: {
        native_tools: false,
        gateway_tools_only: true,
        canonical_journal: true,
      },
      lastKernelError: lastError,
      piVersion: null,
      piMode: null,
      supportedCapabilities: NATIVE_CAPABILITIES,
    }),
    start_evidence: started,
  });

  async function invokeAdmitted(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new NarsKernelContractError('native_admitted_invocation_invalid', 'The invocation gateway must provide a record.');
    }
    const turnId = String(input.turnId ?? input.inputEventId ?? input.invocationId ?? '').trim();
    if (!turnId) throw new NarsKernelContractError('native_admitted_invocation_id_required', 'The admitted invocation requires an id.');
    if (!input.plan || typeof input.plan !== 'object' || Array.isArray(input.plan)) {
      throw new NarsKernelContractError('native_admitted_plan_required', 'The invocation gateway must provide the resolver-admitted plan.');
    }
    if (!input.adapter || typeof input.adapter !== 'object' || Array.isArray(input.adapter)) {
      throw new NarsKernelContractError('native_admitted_adapter_required', 'The invocation gateway must provide the admitted adapter resource.');
    }
    const result = await api.runTurn({
      turn_id: turnId,
      input_id: input.inputEventId ?? turnId,
      input_event_id: input.inputEventId ?? turnId,
      runtime_request_id: input.runtimeRequestId ?? input.requestId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      turn_attempt: input.turnAttempt ?? 1,
      messages: input.messages ?? [],
      tools: [],
      settings: input.requestedOptions && typeof input.requestedOptions === 'object' ? input.requestedOptions : {},
      execution_policy: input.executionPolicy ?? input.execution_policy ?? currentConfig.executionPolicy,
      provider_invocation: {
        plan: input.plan,
        model: input.model,
        modelProvider: input.modelProvider,
        offering: input.offering,
        inferenceProvider: input.inferenceProvider,
        endpoint: input.endpoint,
        adapter: input.adapter,
        credential: input.credential ?? null,
        invocationId: input.invocationId ?? null,
        turnId,
        inputEventId: input.inputEventId ?? turnId,
        requestId: input.requestId ?? null,
        runtimeRequestId: input.runtimeRequestId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        turnAttempt: input.turnAttempt ?? 1,
        invocationScope: input.invocationScope ?? null,
      },
      abortSignal: input.abortSignal ?? null,
    }, input.invocationEventSink ?? (async () => {}), input.capabilityGateway);
    return result.provider_outcome ?? { admission: 'acknowledged', response: result.response };
  }

  const api = {
    async start(context) {
      if (closed) throw new NarsKernelContractError('native_kernel_closed', 'Native kernel is closed.');
      const normalized = assertNarsKernelStartContext(context);
      if (started) return started;
      const hasExplicitExecutionPolicy = context?.execution_policy != null || context?.executionPolicy != null;
      state = 'starting';
      currentConfig = {
        provider: normalized.provider ?? currentConfig.provider,
        model: normalized.model ?? currentConfig.model,
        thinking: normalized.thinking ?? currentConfig.thinking,
        executionPolicy: hasExplicitExecutionPolicy ? normalized.execution_policy : currentConfig.executionPolicy,
      };
      started = buildKernelStartEvidence({
        kernelKind: 'narada-native',
        kernelVersion,
        capabilities: NATIVE_CAPABILITIES,
        sessionId: normalized.session_id,
        piMode: null,
        startedAt: now(),
      });
      state = 'ready';
      return started;
    },

    async runTurn(turn, eventSink, capabilityGateway) {
      if (closed) throw new NarsKernelContractError('native_kernel_closed', 'Native kernel is closed.');
      if (!started) throw new NarsKernelContractError('native_kernel_not_started', 'Native kernel has not started.');
      if (activeTurnId) throw new NarsKernelContractError('native_kernel_turn_active', `Turn '${activeTurnId}' is already active.`);
      const normalizedTurn = assertNarsAdmittedTurn({
        ...(turn && typeof turn === 'object' ? turn : {}),
        execution_policy: turn?.execution_policy ?? turn?.executionPolicy ?? currentConfig.executionPolicy,
      });
      const sink = assertNarsKernelEventSink(eventSink);
      const gateway = assertNarsKernelCapabilityGateway(capabilityGateway);
      let admittedCatalog = [];
      activeTurnId = normalizedTurn.turn_id;
      activeTurnCompletion = new Promise((resolve) => { resolveActiveTurnCompletion = resolve; });
      pendingAbort = new AbortController();
      const turnAbort = pendingAbort;
      if (normalizedTurn.abortSignal?.aborted) turnAbort.abort(normalizedTurn.abortSignal.reason);
      else normalizedTurn.abortSignal?.addEventListener?.('abort', () => turnAbort.abort(normalizedTurn.abortSignal.reason), { once: true });
      state = 'running';
      try {
        const gatewayCatalog = await gateway.toolCatalog();
        if (!Array.isArray(gatewayCatalog)) {
          throw new NarsKernelContractError(
            'native_gateway_catalog_invalid',
            'The NARS capability gateway must return an array tool catalog.',
          );
        }
        admittedCatalog = assertNarsAdmittedTurn({
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
          messages: [],
          tools: gatewayCatalog,
        }).tools;
        const admittedNames = new Set();
        for (const tool of admittedCatalog) {
          const name = tool.function.name;
          if (admittedNames.has(name)) {
            throw new NarsKernelContractError(
              'native_gateway_catalog_duplicate_tool',
              `The NARS capability gateway catalog contains duplicate tool '${name}'.`,
            );
          }
          admittedNames.add(name);
        }
        const undeclaredRequestedTool = normalizedTurn.tools.find((tool) => !admittedNames.has(tool.function.name));
        if (undeclaredRequestedTool) {
          throw new NarsKernelContractError(
            'native_tool_not_in_admitted_catalog',
            `Tool '${undeclaredRequestedTool.function.name}' is not present in the NARS-admitted catalog.`,
          );
        }
        await emit(sink, {
          kind: 'kernel_provider_request_started',
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
        });
      } catch (error) {
        lastError = compactError(error, 'native_kernel_setup_failed');
        state = 'failed';
        settleActiveTurn();
        throw error;
      }
      try {
        const toolRound = createNarsToolRound({
          turn: normalizedTurn,
          messages: normalizedTurn.messages,
          tools: admittedCatalog,
          capabilityGateway: gateway,
          abortSignal: turnAbort.signal,
        });
        const outcome = await providerAdapter.invoke({
          ...(normalizedTurn.provider_invocation && typeof normalizedTurn.provider_invocation === 'object'
            ? normalizedTurn.provider_invocation
            : {}),
          messages: toolRound.messages,
          tools: toolRound.tools,
          settings: normalizedTurn.settings,
          turnId: normalizedTurn.turn_id,
          inputEventId: normalizedTurn.input_event_id,
          runtimeRequestId: normalizedTurn.runtime_request_id,
          runtime_request_id: normalizedTurn.runtime_request_id,
          idempotencyKey: normalizedTurn.idempotency_key,
          idempotency_key: normalizedTurn.idempotency_key,
          turnAttempt: normalizedTurn.turn_attempt,
          turn_attempt: normalizedTurn.turn_attempt,
          abortSignal: toolRound.abort_signal,
          executionPolicy: toolRound.execution_policy,
          execution_policy: toolRound.execution_policy,
          tool_loop: toolRound.tool_loop,
          invocationEventSink: async (event) => emit(sink, { kind: 'kernel_provider_telemetry', source_event: event }),
          capabilityGateway: toolRound.capability_gateway,
        });
        await emit(sink, {
          kind: 'kernel_provider_request_completed',
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
          admission: outcome?.admission ?? null,
        });
        if (outcome?.error) {
          lastError = compactError(outcome.error, 'native_provider_failure');
          return { terminal_state: turnAbort.signal.aborted ? 'interrupted' : 'failed', provider_outcome: outcome, error: outcome.error };
        }
        return { terminal_state: 'completed', response: outcome?.response, provider_outcome: outcome };
      } catch (error) {
        lastError = compactError(error, 'native_kernel_turn_failed');
        await emit(sink, { kind: 'kernel_failure', turn_id: normalizedTurn.turn_id, error: lastError });
        if (turnAbort.signal.aborted) return { terminal_state: 'interrupted', error: lastError };
        throw error;
      } finally {
        settleActiveTurn();
        if (state !== 'failed') state = 'ready';
      }
    },

    async steer(input) {
      if (closed) return { accepted: false, input_id: String(input?.input_id ?? ''), reason: 'kernel_closed' };
      const normalized = assertNarsAdmittedInput(input);
      return { accepted: false, input_id: normalized.input_id, reason: 'native_kernel_steering_delegated_to_session_core' };
    },

    async cancel(request = {}) {
      if (pendingAbort) {
        pendingAbort.abort(request.reason ?? 'kernel_cancel_requested');
        state = 'cancelling';
        return { accepted: true, cancellation_requested: true, confirmed: false, turn_id: activeTurnId, reason: request.reason ?? 'kernel_cancel_requested' };
      }
      return { accepted: true, cancellation_requested: false, confirmed: true, turn_id: null, reason: 'no_active_turn' };
    },

    async reconfigure(request = {}) {
      if (closed) return { accepted: false, reason: 'native_kernel_closed' };
      if (activeTurnId) return { accepted: false, reason: 'runtime_not_at_clean_turn_boundary', active_turn_id: activeTurnId };
      const requestedExecutionPolicy = request.execution_policy ?? request.executionPolicy;
      const hasExecutionPolicy = requestedExecutionPolicy != null;
      const hasAdmittedPlan = request.admitted_plan && typeof request.admitted_plan === 'object' && !Array.isArray(request.admitted_plan);
      if (!hasAdmittedPlan && !hasExecutionPolicy) {
        return { accepted: false, reason: 'admitted_plan_required' };
      }
      const nextExecutionPolicy = hasExecutionPolicy
        ? normalizeNarsExecutionPolicy(requestedExecutionPolicy, {
          sourceKind: 'runtime-reconfigure',
        })
        : currentConfig.executionPolicy;
      let nextConfig = {
        ...currentConfig,
        executionPolicy: nextExecutionPolicy,
      };
      if (hasAdmittedPlan) {
        const selected = request.admitted_plan.selected;
        if (!selected || typeof selected !== 'object' || Array.isArray(selected)
          || !publicResourceId(selected.inference_provider)
          || !publicResourceId(selected.model)) {
          return { accepted: false, reason: 'admitted_plan_binding_incomplete' };
        }
        nextConfig = {
          ...nextConfig,
          provider: selected.inference_provider,
          model: selected.model,
          thinking: request.admitted_plan?.options?.thinking ?? nextConfig.thinking,
        };
      }
      currentConfig = nextConfig;
      return {
        accepted: true,
        active: {
          provider: publicResourceId(currentConfig.provider),
          model: publicResourceId(currentConfig.model),
          thinking: typeof currentConfig.thinking === 'string' ? currentConfig.thinking.trim() || null : null,
          ...(hasExecutionPolicy ? { execution_policy: currentConfig.executionPolicy } : {}),
        },
        reason: 'native_runtime_configuration_delegated_to_canonical_runtime',
      };
    },

    async inspect() { return health(); },
    health,
    invokeAdmitted,

    async close(request = {}) {
      if (closed) return { closed: true, reason: request.reason ?? 'already_closed' };
      closed = true;
      const reason = request.reason ?? 'kernel_close';
      pendingAbort?.abort(reason);
      state = 'cancelling';
      await activeTurnCompletion;
      pendingAbort = null;
      state = 'closed';
      return { closed: true, reason, joined: true };
    },
  };
  return Object.freeze(api);
}
