import {
  assertNarsAdmittedInput,
  assertNarsAdmittedTurn,
  assertNarsKernelCapabilityGateway,
  assertNarsKernelEventSink,
  assertNarsKernelStartContext,
  buildKernelHealthProjection,
  buildKernelStartEvidence,
  createNarsToolRound,
  NarsKernelContractError,
  normalizeIntelligenceKernelKind,
  normalizeNarsExecutionPolicy,
} from '@narada-core/nars-intelligence-kernel-contract';
import { createNarsNativeKernel } from '@narada-core/nars-intelligence-kernel-contract/native-kernel';
import { createPiSdkHost } from './pi/pi-sdk-host.ts';
import { createPiRpcHost } from './pi/pi-rpc-host.ts';
import { resolveAdmittedPiModelOptions } from './pi/pi-session-factory.ts';
import { assertPiRuntimeIsolation, createPiRuntimeIsolationConfig } from './pi/pi-runtime-isolation.ts';
import {
  negotiatePiCapabilities,
  PI_ADAPTER_VERSION,
  PI_EVENT_ADAPTER_VERSION,
  PI_TOOL_POSTURE_VERSION,
  SUPPORTED_PI_CAPABILITIES,
} from './pi/pi-version-capabilities.ts';
import { createPiEventAdapter } from './adapters/event-adapter.ts';
import { createNarsPiCapabilityGateway, normalizeNarsGatewayTool } from './adapters/tool-adapter.ts';
import { createNarsPiContextBuilder, buildPiContextFromNarsRecords } from './adapters/context-adapter.ts';
import { runProviderWithBoundedRetry } from './adapters/retry-adapter.ts';
import { createCompactionAdapter } from './adapters/compaction-adapter.ts';
import { createNarsArtifactAdapter } from './adapters/artifact-adapter.ts';
import { createCancellationAdapter } from './adapters/cancellation-adapter.ts';
import { createCorrelationRegistry } from './state/correlation-registry.ts';
import { createContinuationState } from './state/continuation-state.ts';

function nonEmpty(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeProviderOutcome(value: any) {
  if (value && typeof value === 'object' && ('admission' in value || 'transportSubmitted' in value || 'providerRequestRef' in value || 'error' in value)) {
    return value;
  }
  return { admission: 'acknowledged', transportSubmitted: true, response: value };
}

function publicResourceId(value: any) {
  if (typeof value === 'string') return value.replace(/^(?:model|inference-provider):/, '');
  if (!value || typeof value !== 'object') return null;
  return publicResourceId(value.id ?? null);
}

function compactError(error: any, fallback: any = 'pi_kernel_error') {
  const rawMessage: any = error instanceof Error ? error.message : error?.message ?? String(error ?? fallback);
  const message: any = String(rawMessage).replace(
    /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|bearer)["']?\s*[:=]\s*["']?)([^\s,'"`}]+)(["']?)/gi,
    '$1[redacted]$3',
  );
  return {
    code: error?.code ?? fallback,
    message,
  };
}

function correlationEvidence(record: any) {
  return Object.fromEntries([
    ['correlation_key', record?.correlation_key],
    ['pi_session_id', record?.pi_session_id],
    ['pi_request_id', record?.pi_request_id],
    ['pi_message_id', record?.pi_message_id],
    ['pi_tool_call_id', record?.pi_tool_call_id],
  ].filter(([, value]: any) => value != null));
}

function providerInputFromTurn(turn: any, signal: any, invocationEventSink: any, capabilityGateway: any = null) {
  const base: any = turn.provider_invocation && typeof turn.provider_invocation === 'object'
    ? turn.provider_invocation
    : {};
  const toolRound: any = createNarsToolRound({
    turn,
    messages: turn.messages ?? [],
    tools: turn.tools ?? [],
    capabilityGateway,
    abortSignal: signal,
    providerRequestAttempt: turn.provider_request_attempt ?? turn.providerRequestAttempt ?? null,
  });
  return {
    ...base,
    messages: toolRound.messages,
    tools: toolRound.tools,
    settings: turn.settings ?? {},
    turnId: turn.turn_id,
    inputEventId: turn.input_event_id ?? turn.input_id,
    runtimeRequestId: turn.runtime_request_id ?? turn.runtimeRequestId ?? turn.request_id ?? turn.requestId ?? null,
    runtime_request_id: turn.runtime_request_id ?? turn.runtimeRequestId ?? turn.request_id ?? turn.requestId ?? null,
    idempotencyKey: turn.idempotency_key ?? turn.idempotencyKey ?? null,
    idempotency_key: turn.idempotency_key ?? turn.idempotencyKey ?? null,
    turnAttempt: turn.turn_attempt ?? turn.turnAttempt ?? turn.attempt ?? 1,
    turn_attempt: turn.turn_attempt ?? turn.turnAttempt ?? turn.attempt ?? 1,
    providerRequestAttempt: turn.provider_request_attempt ?? turn.providerRequestAttempt ?? null,
    provider_request_attempt: turn.provider_request_attempt ?? turn.providerRequestAttempt ?? null,
    abortSignal: toolRound.abort_signal,
    executionPolicy: toolRound.execution_policy,
    execution_policy: toolRound.execution_policy,
    tool_loop: toolRound.tool_loop,
    invocationEventSink,
    ...(capabilityGateway ? {
      capabilityGateway: toolRound.capability_gateway,
      capability_gateway: toolRound.capability_gateway,
    } : {}),
  };
}

function kernelToolCatalog(tools: any) {
  if (!Array.isArray(tools)) {
    throw new NarsKernelContractError(
      'pi_gateway_catalog_invalid',
      'The NARS capability gateway must return an array tool catalog.',
    );
  }
  const normalized: any = tools.map((tool: any) => normalizeNarsGatewayTool(tool));
  const names: any = new Set();
  for (const tool of normalized) {
    const name: any = tool.function.name;
    if (names.has(name)) {
      throw new NarsKernelContractError(
        'pi_gateway_catalog_duplicate_tool',
        `The NARS capability gateway catalog contains duplicate tool '${name}'.`,
      );
    }
    names.add(name);
  }
  return normalized;
}

/**
 * Pi-backed implementation of the NARS intelligence-kernel contract.
 *
 * The object exposes one internal `invokeAdmitted` bridge for the canonical
 * invocation gateway. It accepts only a gateway-issued AdapterInvocation;
 * arbitrary client/provider-shaped input is not a supported kernel API.
 */
export function createNarsPiSdkKernel({
  providerAdapter,
  host = null,
  sdk = null,
  sessionFactory = null,
  runtimeContext = {},
  contextBuilder = null,
  readNarsRecords = async () => [],
  now = () => new Date().toISOString(),
  piVersion = null,
  kernelVersion = 'pi-sdk-0.1.0',
  fallbackToCompatibilityHost = null,
  maxRetryAttempts = 2,
  maxCorrelationEntries = 2048,
  maxContinuationMessages = 200,
  runtimeConfig = {},
  artifactRegistrar = null,
}: any = {}) {
  if (!providerAdapter || typeof providerAdapter.invoke !== 'function') {
    throw new NarsKernelContractError('pi_provider_adapter_required', 'Pi SDK kernel requires the canonical provider adapter.');
  }
  const configuredContextBuilder: any = contextBuilder ?? createNarsPiContextBuilder({ readNarsRecords, maxMessages: maxContinuationMessages });
  const activeHost: any = host ?? createPiSdkHost({
    providerInvoker: (input: any) => providerAdapter.invoke(input),
    sdk,
    sessionFactory,
    now,
    piVersion,
    runtimeConfig: {
      useBundledPiSdk: runtimeConfig.useBundledPiSdk ?? true,
      ...runtimeConfig,
    },
    fallbackToCompatibilityHost,
  });
  return createPiKernel({
    kind: 'pi-sdk',
    providerAdapter,
    host: activeHost,
    runtimeContext,
    contextBuilder: configuredContextBuilder,
    now,
    piVersion,
    kernelVersion,
    maxRetryAttempts,
    maxCorrelationEntries,
    maxContinuationMessages,
    runtimeConfig,
    artifactRegistrar,
  });
}

export function createNarsPiRpcKernel({
  host = null,
  rpc = {},
  runtimeContext = {},
  contextBuilder = null,
  readNarsRecords = async () => [],
  now = () => new Date().toISOString(),
  piVersion,
  kernelVersion = 'pi-rpc-0.1.0',
  maxRetryAttempts = 2,
  maxCorrelationEntries = 2048,
  maxContinuationMessages = 200,
  artifactRegistrar = null,
}: any = {}) {
  const effectivePiVersion: any = piVersion ?? rpc.piVersion;
  const activeHost: any = host ?? createPiRpcHost({ ...rpc, piVersion: effectivePiVersion, now });
  const configuredContextBuilder: any = contextBuilder ?? createNarsPiContextBuilder({ readNarsRecords, maxMessages: maxContinuationMessages });
  return createPiKernel({
    kind: 'pi-rpc',
    providerAdapter: null,
    host: activeHost,
    runtimeContext,
    contextBuilder: configuredContextBuilder,
    now,
    piVersion: effectivePiVersion,
    kernelVersion,
    maxRetryAttempts,
    maxCorrelationEntries,
    maxContinuationMessages,
    artifactRegistrar,
  });
}

export function createIntelligenceKernel({ kind = 'narada-native', ...options }: any = {}) {
  const normalized: any = normalizeIntelligenceKernelKind(kind);
  if (normalized === 'narada-native') return createNarsNativeKernel(options);
  if (normalized === 'pi-sdk') return createNarsPiSdkKernel(options);
  return createNarsPiRpcKernel(options);
}

function createPiKernel({
  kind,
  providerAdapter,
  host,
  runtimeContext,
  contextBuilder,
  now,
  piVersion,
  kernelVersion,
  maxRetryAttempts = 2,
  maxCorrelationEntries,
  maxContinuationMessages,
  runtimeConfig = {},
  artifactRegistrar = null,
}: any = {}) {
  let state: any = 'created';
  let startedContext: any = null;
  let startEvidence: any = null;
  let piSessionId: any = null;
  let activeTurnId: any = null;
  let activeTurnCompletion: any = null;
  let resolveActiveTurnCompletion: any = null;
  let lastError: any = null;
  let currentConfig: any = {
    provider: runtimeContext.provider ?? runtimeConfig.provider ?? null,
    model: runtimeContext.model ?? runtimeConfig.model ?? null,
    thinking: runtimeContext.thinking ?? runtimeConfig.thinking ?? null,
    executionPolicy: normalizeNarsExecutionPolicy(runtimeContext.executionPolicy ?? runtimeContext.execution_policy, {
      sourceKind: 'runtime-config',
    }),
  };
  let closed: any = false;
  let latestRecovery: any = null;
  let latestCompaction: any = null;
  let latestRetry: any = null;
  const correlation: any = createCorrelationRegistry({ maxEntries: maxCorrelationEntries });
  const continuation: any = createContinuationState({ sessionId: runtimeContext.session ?? null, maxMessages: maxContinuationMessages });
  const cancellation: any = createCancellationAdapter();
  const queuedSteering: any = [];
  const hostHealth: any = () => host.health?.() ?? {};
  const settleActiveTurn: any = (removeExternalAbortListener: any = null) => {
    resolveActiveTurnCompletion?.();
    resolveActiveTurnCompletion = null;
    activeTurnId = null;
    activeTurnCompletion = null;
    cancellation.clear();
    removeExternalAbortListener?.();
  };

  function health() {
    const hostSnapshot: any = hostHealth();
    const projection: any = buildKernelHealthProjection({
      kernelKind: kind,
      kernelVersion,
      piVersion: hostSnapshot.pi_version ?? piVersion ?? (kind === 'pi-sdk' ? 'narada-pi-compat' : null),
      piMode: hostSnapshot.pi_mode ?? (kind === 'pi-sdk' ? 'compat' : 'rpc'),
      provider: publicResourceId(currentConfig.provider),
      model: publicResourceId(currentConfig.model),
      thinking: nonEmpty(currentConfig.thinking),
      executionPolicy: currentConfig.executionPolicy,
      kernelState: state,
      activeTurnId,
      providerStreaming: Boolean(activeTurnId),
      compactionState: typeof latestCompaction?.state === 'function'
        ? latestCompaction.state()
        : latestCompaction?.state ?? 'idle',
      retryState: latestRetry?.state ?? 'idle',
      continuationStatePresent: continuation.hasState(),
      capabilityProfile: {
        gateway_tools_only: true,
        native_shell: false,
        native_filesystem_mutation: false,
        ambient_extensions: false,
        ambient_credentials: false,
        canonical_journal: 'nars-session-core',
        ...(hostSnapshot.isolation ? { isolation: hostSnapshot.isolation } : {}),
      },
      lastKernelError: lastError,
      supportedCapabilities: hostSnapshot.supported_capabilities ?? SUPPORTED_PI_CAPABILITIES,
      supportedProviderFeatures: startEvidence?.supported_provider_features
        ?? ['streaming', 'tool-calls', 'retry', 'compaction-evidence'],
      supportedThinkingLevels: startEvidence?.supported_thinking_levels ?? ['low', 'medium', 'high'],
      toolPostureVersion: startEvidence?.tool_posture_version ?? PI_TOOL_POSTURE_VERSION,
      eventAdapterVersion: startEvidence?.event_adapter_version ?? PI_EVENT_ADAPTER_VERSION,
      sessionPosture: startEvidence?.session_posture ?? 'nars-journal-canonical.v1',
      ambientResourceIsolation: startEvidence?.ambient_resource_isolation ?? 'strict-adapter-policy',
      ...(latestRecovery ? { recovery: latestRecovery } : {}),
      ...(latestRetry ? { retry: latestRetry } : {}),
      });
    return Object.freeze({
      ...projection,
      start_evidence: startEvidence,
    });
  }

  async function start(context: any = {}) {
    if (closed) throw new NarsKernelContractError('pi_kernel_closed', 'Pi kernel is closed.');
    const normalized: any = assertNarsKernelStartContext(context);
    if (startedContext) return startEvidence;
    const hasExplicitExecutionPolicy: any = context?.execution_policy != null || context?.executionPolicy != null;
    state = 'starting';
    try {
      const admittedTools: any = kernelToolCatalog(normalized.tools ?? []);
      currentConfig = {
        provider: normalized.provider ?? currentConfig.provider,
        model: normalized.model ?? currentConfig.model,
        thinking: normalized.thinking ?? currentConfig.thinking,
        executionPolicy: hasExplicitExecutionPolicy ? normalized.execution_policy : currentConfig.executionPolicy,
      };
      const isolation: any = createPiRuntimeIsolationConfig({
        provider: publicResourceId(currentConfig.provider),
        model: publicResourceId(currentConfig.model),
        thinking: nonEmpty(currentConfig.thinking),
        sdkVersion: piVersion ?? (kind === 'pi-sdk' ? 'narada-pi-compat' : 'pinned-rpc'),
        mode: kind === 'pi-sdk' ? 'sdk' : 'rpc',
        tools: admittedTools,
      });
      assertPiRuntimeIsolation(isolation);
      const hostEvidence: any = await host.start({
        ...normalized,
        provider: publicResourceId(currentConfig.provider),
        model: publicResourceId(currentConfig.model),
        thinking: nonEmpty(currentConfig.thinking),
        tools: admittedTools,
      });
      // A Pi host may expose a disposable session identifier.  If it does
      // not, the NARS session id is the deterministic derived-session
      // correlation value; neither value becomes canonical session identity.
      piSessionId = hostEvidence?.pi_session_id
        ?? hostEvidence?.piSessionId
        ?? hostEvidence?.session_id
        ?? hostEvidence?.sessionId
        ?? normalized.session_id;
      startedContext = normalized;
      const hostNegotiation: any = hostEvidence?.negotiation ?? {};
      const negotiated: any = negotiatePiCapabilities({
        piVersion: hostNegotiation.pi_version
          ?? piVersion
          ?? (kind === 'pi-sdk' ? 'narada-pi-compat' : 'pinned-rpc'),
        mode: hostNegotiation.mode ?? (kind === 'pi-sdk' ? 'compat' : 'rpc'),
        capabilities: hostNegotiation.capabilities ?? SUPPORTED_PI_CAPABILITIES,
        eventKinds: hostNegotiation.supported_event_kinds ?? undefined,
        required: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        peerAdvertised: hostNegotiation.capabilities_verified === true,
      });
      startEvidence = buildKernelStartEvidence({
        kernelKind: kind,
        kernelVersion,
        piVersion: negotiated.pi_version,
        piMode: negotiated.mode,
        capabilities: negotiated.capabilities,
        providerFeatures: ['streaming', 'tool-calls', 'retry', 'compaction-evidence'],
        thinkingLevels: ['low', 'medium', 'high'],
        toolPostureVersion: PI_TOOL_POSTURE_VERSION,
        eventAdapterVersion: PI_EVENT_ADAPTER_VERSION,
        sessionPosture: 'nars-journal-canonical.v1',
        ambientResourceIsolation: isolation.ambient_resource_isolation,
        sessionId: normalized.session_id,
        startedAt: now(),
      });
      state = 'ready';
      return startEvidence;
    } catch (error) {
      lastError = compactError(error, 'pi_kernel_start_failed');
      state = 'failed';
      try { await host.close?.(); } catch { /* startup failure cleanup is best effort */ }
      throw error;
    }
  }

  async function runTurn(turn: any, eventSink: any, capabilityGateway: any) {
    if (closed) throw new NarsKernelContractError('pi_kernel_closed', 'Pi kernel is closed.');
    if (!startedContext) throw new NarsKernelContractError('pi_kernel_not_started', 'Pi kernel has not started.');
    if (activeTurnId) throw new NarsKernelContractError('pi_kernel_turn_active', `Turn '${activeTurnId}' is already active.`);
    const normalizedTurn: any = assertNarsAdmittedTurn({
      ...(turn && typeof turn === 'object' ? turn : {}),
      execution_policy: turn?.execution_policy ?? turn?.executionPolicy ?? currentConfig.executionPolicy,
    });
    const sink: any = assertNarsKernelEventSink(eventSink);
    const gateway: any = assertNarsKernelCapabilityGateway(capabilityGateway);
    // Reserve the turn before any catalog/context/host await. NARS
    // cancellation, reconfiguration, and close must observe the reservation
    // even while Pi setup is still in progress.
    activeTurnId = normalizedTurn.turn_id;
    state = 'running';
    activeTurnCompletion = new Promise((resolve: any) => { resolveActiveTurnCompletion = resolve; });
    const controller: any = cancellation.begin();
    const signal: any = controller.signal;
    let removeExternalAbortListener: any = null;
    if (normalizedTurn.abortSignal?.aborted) {
      controller.abort(normalizedTurn.abortSignal.reason);
    } else if (typeof normalizedTurn.abortSignal?.addEventListener === 'function') {
      const relayAbort: any = () => controller.abort(normalizedTurn.abortSignal.reason);
      normalizedTurn.abortSignal.addEventListener('abort', relayAbort, { once: true });
      removeExternalAbortListener = () => normalizedTurn.abortSignal.removeEventListener?.('abort', relayAbort);
    }
    let visibleTools: any;
    let registered: any;
    let toolProxy: any;
    let contextProjection: any;
    let compaction: any;
    let eventAdapter: any;
    let artifacts: any;
    let admittedSteering: any;
    try {
      const admittedBinding: any = resolveAdmittedPiModelOptions(normalizedTurn);
      currentConfig = {
        ...currentConfig,
        ...(admittedBinding.provider ? { provider: admittedBinding.provider } : {}),
        ...(admittedBinding.model ? { model: admittedBinding.model } : {}),
        ...(admittedBinding.thinking ? { thinking: admittedBinding.thinking } : {}),
      };
      const canonicalToolCatalog: any = kernelToolCatalog(await gateway.toolCatalog());
      const requestedToolCatalog: any = normalizedTurn.tools.length > 0
        ? kernelToolCatalog(normalizedTurn.tools)
        : [];
      const canonicalToolNames: any = new Set(canonicalToolCatalog.map((tool: any) => tool.function.name));
      const undeclaredRequestedTool: any = requestedToolCatalog.find((tool: any) => !canonicalToolNames.has(tool.function.name));
      if (undeclaredRequestedTool) {
        throw new NarsKernelContractError(
          'pi_tool_not_in_admitted_catalog',
          `Tool '${undeclaredRequestedTool.function.name}' is not present in the NARS-admitted catalog.`,
        );
      }
      visibleTools = canonicalToolCatalog;
      registered = correlation.register({
        runtime_request_id: normalizedTurn.runtime_request_id ?? normalizedTurn.request_id,
        input_id: normalizedTurn.input_id,
        idempotency_key: normalizedTurn.idempotency_key,
        turn_id: normalizedTurn.turn_id,
        turn_attempt: normalizedTurn.turn_attempt ?? normalizedTurn.attempt ?? 1,
        provider_request_attempt: null,
        pi_session_id: piSessionId ?? startedContext.session_id,
        registered_at: now(),
      });
      toolProxy = createNarsPiCapabilityGateway({
        gateway,
        context: {
          agent_id: startedContext.agent_id,
          session_id: startedContext.session_id,
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
          runtime_request_id: normalizedTurn.runtime_request_id ?? normalizedTurn.request_id,
          idempotency_key: normalizedTurn.idempotency_key,
          turn_attempt: normalizedTurn.turn_attempt ?? normalizedTurn.attempt ?? 1,
          authority_posture: 'nars-admitted',
        },
        eventSink: async (event: any) => sink({
          ...event,
          ...correlationEvidence(registered),
          turn_id: normalizedTurn.turn_id,
        }),
        onCorrelation: (fields: any) => {
          registered = correlation.register({ ...registered, ...fields });
        },
      });
      contextProjection = await contextBuilder.buildContext({
        sessionSnapshot: { session_id: startedContext.session_id, agent_id: startedContext.agent_id },
        turn: { ...normalizedTurn, messages: normalizedTurn.messages },
      });
      eventAdapter = createPiEventAdapter({
      now,
      eventSink: async (event: any) => sink({
        ...event,
        ...correlationEvidence(registered),
        turn_id: normalizedTurn.turn_id,
        input_id: normalizedTurn.input_id,
      }),
      onObservation: async (observation: any) => {
        if (observation.duplicate || observation.classification !== 'compaction_telemetry') return;
        await compaction?.observe(observation.observation.payload ?? {}, {
          turn_id: normalizedTurn.turn_id,
        });
      },
    });
      compaction = createCompactionAdapter({
      eventSink: async (event: any) => sink({
        ...event,
        ...correlationEvidence(registered),
        turn_id: normalizedTurn.turn_id,
        input_id: normalizedTurn.input_id,
      }),
      now,
      });
      artifacts = createNarsArtifactAdapter({
      registerArtifact: artifactRegistrar,
      eventSink: async (event: any) => sink({
        ...event,
        ...correlationEvidence(registered),
        turn_id: normalizedTurn.turn_id,
        input_id: normalizedTurn.input_id,
      }),
      now,
      });
      latestCompaction = compaction;
      admittedSteering = queuedSteering.splice(0, queuedSteering.length);
      await sink({
        kind: 'kernel_turn_started',
        turn_id: normalizedTurn.turn_id,
        input_id: normalizedTurn.input_id,
        ...correlationEvidence(registered),
        capability_gateway_bound: Boolean(capabilityGateway?.invoke || capabilityGateway?.execute),
        visible_tool_count: visibleTools.length,
      });
    } catch (error) {
      lastError = compactError(error, 'pi_kernel_setup_failed');
      state = 'failed';
      try {
        await sink({
          kind: 'kernel_failure',
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
          error: lastError,
        });
      } catch { /* preserve the setup failure while still releasing the reservation */ }
      settleActiveTurn(removeExternalAbortListener);
      throw error;
    }
    let providerOutcomeObserved: any = null;
    const providerInvoker: any = async (hostInput: any) => {
      const providerInput: any = providerInputFromTurn({
        ...normalizedTurn,
        messages: contextProjection.messages,
        tools: visibleTools,
        provider_invocation: normalizedTurn.provider_invocation,
      }, signal, async (event: any) => eventAdapter.observe({ kind: 'provider_telemetry', ...event }, { turnId: normalizedTurn.turn_id, inputId: normalizedTurn.input_id }), toolProxy);
      const {
        providerInvoker: _providerInvoker,
        context_projection: _contextProjection,
        capability_gateway: _capabilityGateway,
        correlation: _correlation,
        // Pi's model runtime uses scalar provider/model fields for cognition
        // mechanics.  Once a canonical NARS plan is attached, those fields
        // must not overwrite the exact execution-resource graph that the
        // durable invocation gateway admitted.
        provider: _hostProvider,
        model: _hostModel,
        thinking: _hostThinking,
        ...admittedHostInput
      }: any = hostInput ?? {};
      const providerMessages: any = Array.isArray(admittedHostInput?.messages)
        ? admittedHostInput.messages
        : contextProjection.messages;
      const canonicalExecutionResources: any = {};
      for (const field of ['plan', 'model', 'modelProvider', 'offering', 'inferenceProvider', 'endpoint', 'adapter', 'credential']) {
        if (providerInput[field] !== undefined) canonicalExecutionResources[field] = providerInput[field];
      }
      const outcome: any = providerAdapter
        ? await providerAdapter.invoke({
          ...providerInput,
          ...admittedHostInput,
          ...canonicalExecutionResources,
          messages: providerMessages,
          tools: visibleTools,
          abortSignal: signal,
        })
        : normalizeProviderOutcome(hostInput);
      providerOutcomeObserved = outcome;
      // A canonical provider adapter may carry an explicit incremental
      // projection in its response.  The real Pi SDK reduces that response to
      // a Pi assistant message, so emit the already-admitted presentation
      // evidence at this NARS kernel boundary before Pi can discard the
      // transport extension.  These are not canonical assistant messages;
      // session-core still decides terminal assistant acceptance.
      const stream: any = outcome?.narada_stream ?? outcome?.response?.narada_stream;
      if (Array.isArray(stream)) {
        for (const [streamIndex, chunk] of stream.entries()) {
          if (!chunk || typeof chunk !== 'object' || typeof chunk.content !== 'string') continue;
          await sink({
            kind: 'assistant_message_stream',
            turn_id: normalizedTurn.turn_id,
            input_id: normalizedTurn.input_id,
            turn_attempt: hostInput?.turn_attempt ?? hostInput?.turnAttempt ?? normalizedTurn.turn_attempt ?? 1,
            content: chunk.content,
            done: chunk.done === true,
            stream_index: streamIndex,
            ...(typeof chunk.stream_id === 'string' && chunk.stream_id.trim()
              ? { stream_id: chunk.stream_id.trim() }
              : {}),
          });
        }
      }
      return outcome;
    };
    try {
      const retried: any = await runProviderWithBoundedRetry(
        async (attempt: any) => {
          providerOutcomeObserved = null;
          // Provider retries remain inside the same admitted NARS turn
          // attempt. Keep `turn_attempt` stable; expose the transport retry
          // separately so provider telemetry cannot masquerade as a new
          // session-core attempt.
          const attemptTurn: any = { ...normalizedTurn, provider_request_attempt: attempt };
          registered = correlation.register({
            ...registered,
            turn_attempt: normalizedTurn.turn_attempt,
            provider_request_attempt: attempt,
            // SDK sessions do not promise a transport request id.  This
            // adapter-owned deterministic id still correlates every provider
            // attempt without pretending to be a Pi canonical identifier;
            // RPC hosts replace it with their actual framed request id.
            pi_request_id: `${kind}:request:${normalizedTurn.turn_id}:attempt:${attempt}`,
          });
          const hostOutcome: any = await host.runTurn({
            ...providerInputFromTurn(attemptTurn, signal, async (event: any) => eventAdapter.observe({ kind: 'provider_telemetry', ...event }, { turnId: normalizedTurn.turn_id, inputId: normalizedTurn.input_id }), toolProxy),
            messages: contextProjection.messages,
            tools: visibleTools,
            context_projection: contextProjection,
            capability_gateway: toolProxy,
            correlation: registered,
            providerInvoker,
            // The SDK host uses providerInvoker; RPC receives only this
            // representation-neutral request and never a client protocol frame.
            provider_invocation: normalizedTurn.provider_invocation ?? null,
            steering: admittedSteering,
          }, async (event: any) => eventAdapter.observe(event, { turnId: normalizedTurn.turn_id, inputId: normalizedTurn.input_id }), toolProxy);
          // Pi may turn a provider error into a normal assistant error
          // message. Preserve the canonical adapter's failure admission so
          // NARS does not close a failed provider turn as completed.
          return providerOutcomeObserved?.error && !hostOutcome?.error
            ? providerOutcomeObserved
            : hostOutcome;
        },
        {
          maxAttempts: maxRetryAttempts,
          eventSink: async (event: any) => {
            latestRetry = { ...event, state: 'retrying' };
            await sink({
              ...event,
              ...correlationEvidence(registered),
              turn_id: normalizedTurn.turn_id,
              input_id: normalizedTurn.input_id,
            });
          },
          abortSignal: signal,
          now,
          // A thrown host/provider operation is a kernel failure. Adapters
          // that need to report an ambiguous transport outcome must return
          // an explicit `{ admission: 'uncertain' }` result instead.
          rethrowOperationErrors: true,
        },
      );
      let outcome: any = normalizeProviderOutcome(retried.outcome);
      // Some Pi SDK versions turn an aborted model stream into a normal
      // assistant message with an `aborted` stop reason instead of returning
      // the provider adapter's explicit error object. The NARS cancellation
      // boundary must not let that look like a successful carrier turn.
      if (signal.aborted && !outcome.error) {
        outcome = {
          ...outcome,
          admission: outcome.admission ?? 'uncertain',
          error: {
            code: 'aborted',
            message: 'provider operation aborted by NARS cancellation',
            retryable: false,
          },
        };
      }
      if (outcome.pi_request_id) {
        registered = correlation.register({ ...registered, pi_request_id: outcome.pi_request_id });
      }
      latestRetry = retried.attempts > 1
        ? {
          state: outcome.error ? 'exhausted' : 'settled',
          attempts: retried.attempts,
          terminal_error: outcome.error ? compactError(outcome.error, 'pi_provider_failure') : null,
        }
        : null;
      if (outcome.error && !signal.aborted) {
        lastError = compactError(outcome.error, 'pi_provider_failure');
        await sink({
          kind: 'kernel_provider_failure',
          turn_id: normalizedTurn.turn_id,
          input_id: normalizedTurn.input_id,
          attempts: retried.attempts,
          error: lastError,
        });
      }
      if (outcome?.response) {
        const assistantContent: any = outcome.response?.choices?.[0]?.message?.content ?? outcome.response?.content;
        if (typeof assistantContent === 'string') continuation.append({ role: 'assistant', content: assistantContent });
      }
      if (outcome?.response?.narada_compaction) await compaction.observe(outcome.response.narada_compaction, { turn_id: normalizedTurn.turn_id });
      const artifactEvidence: any = await artifacts.observe(outcome.response, {
        session_id: startedContext.session_id,
        agent_id: startedContext.agent_id,
        turn_id: normalizedTurn.turn_id,
        input_id: normalizedTurn.input_id,
      });
      const terminalState: any = signal.aborted ? 'interrupted' : outcome.error ? 'failed' : 'completed';
      await sink({ kind: 'kernel_turn_observed', turn_id: normalizedTurn.turn_id, input_id: normalizedTurn.input_id, terminal_state: terminalState, provider_admission: outcome.admission ?? null });
      return {
        terminal_state: terminalState,
        ...(outcome.response !== undefined ? { response: outcome.response } : {}),
        provider_outcome: outcome,
        attempts: retried.attempts,
        correlation: registered,
        ...(artifactEvidence.records.length ? { artifact_evidence: artifactEvidence.records } : {}),
      };
    } catch (error) {
      lastError = compactError(error, 'pi_kernel_turn_failed');
      if (!signal.aborted) state = 'failed';
      await sink({ kind: signal.aborted ? 'kernel_cancellation_evidence' : 'kernel_failure', turn_id: normalizedTurn.turn_id, input_id: normalizedTurn.input_id, error: lastError });
      if (signal.aborted) return { terminal_state: 'interrupted', error: lastError, correlation: registered };
      throw error;
    } finally {
      settleActiveTurn(removeExternalAbortListener);
      if (state !== 'failed') state = 'ready';
    }
  }

  async function invokeAdmitted(input: any = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new NarsKernelContractError('pi_admitted_invocation_invalid', 'The invocation gateway must provide a record.');
    }
    const turnId: any = nonEmpty(input.turnId) ?? nonEmpty(input.inputEventId) ?? nonEmpty(input.invocationId);
    if (!turnId) throw new NarsKernelContractError('pi_admitted_invocation_id_required', 'The admitted invocation requires a turn or invocation id.');
    if (!input.plan || typeof input.plan !== 'object' || Array.isArray(input.plan)) {
      throw new NarsKernelContractError('pi_admitted_plan_required', 'The invocation gateway must provide the resolver-admitted plan.');
    }
    if (!input.adapter || typeof input.adapter !== 'object' || Array.isArray(input.adapter)) {
      throw new NarsKernelContractError('pi_admitted_adapter_required', 'The invocation gateway must provide the admitted adapter resource.');
    }
    if (input.messages != null && !Array.isArray(input.messages)) {
      throw new NarsKernelContractError('pi_admitted_messages_invalid', 'The admitted invocation messages must be an array.');
    }
    const result: any = await runTurn({
      turn_id: turnId,
      input_id: input.inputEventId ?? turnId,
      input_event_id: input.inputEventId ?? turnId,
      runtime_request_id: input.runtimeRequestId ?? input.requestId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      turn_attempt: input.turnAttempt ?? 1,
      messages: input.messages ?? [],
      // Tool declarations are sourced from the NARS gateway catalog inside
      // runTurn. The request's caller-facing list is not allowed to become a
      // second catalog authority.
      tools: [],
      settings: input.requestedOptions && typeof input.requestedOptions === 'object'
        ? input.requestedOptions
        : {},
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

  async function steer(input: any) {
    if (closed) {
      return { accepted: false, input_id: String(input?.input_id ?? ''), reason: 'kernel_closed' };
    }
    const normalized: any = assertNarsAdmittedInput(input);
    if (activeTurnId) {
      queuedSteering.push(normalized);
      const result: any = await host.steer(normalized);
      return { accepted: true, input_id: normalized.input_id, reason: 'nars_admitted_steering_queued', pi_acceptance: result };
    }
    return { accepted: true, input_id: normalized.input_id, reason: 'nars_admitted_steering_queued_for_next_turn' };
  }

  async function cancel(request: any = {}) {
    if (closed) {
      return { accepted: false, cancellation_requested: false, confirmed: true, turn_id: null, reason: 'kernel_closed' };
    }
    if (!activeTurnId) {
      const queued: any = queuedSteering.length;
      queuedSteering.length = 0;
      return {
        accepted: true,
        cancellation_requested: queued > 0,
        confirmed: true,
        queued_inputs_cancelled: queued,
        reason: queued > 0 ? 'queued_steering_cancelled' : 'no_active_turn',
      };
    }
    state = 'cancelling';
    const queued: any = queuedSteering.splice(0, queuedSteering.length);
    const local: any = cancellation.request(request.reason ?? 'nars_cancel_requested');
    let hostResult: any = null;
    try { hostResult = await host.cancel(request.reason ?? 'nars_cancel_requested'); } catch (error) { lastError = compactError(error, 'pi_cancel_failed'); }
    return {
      accepted: true,
      cancellation_requested: true,
      confirmed: false,
      turn_id: activeTurnId,
      queued_inputs_cancelled: queued.length,
      reason: request.reason ?? 'nars_cancel_requested',
      host: hostResult,
      signal: local,
    };
  }

  async function reconfigure(request: any = {}) {
    if (closed) return { accepted: false, reason: 'kernel_closed' };
    if (activeTurnId) return { accepted: false, reason: 'runtime_not_at_clean_turn_boundary', active_turn_id: activeTurnId };
    state = 'reconfiguring';
    try {
      const admittedPlan: any = request.admitted_plan ?? request.admittedPlan ?? null;
      const requestedExecutionPolicy: any = request.execution_policy ?? request.executionPolicy ?? null;
      const hasExecutionPolicy: any = requestedExecutionPolicy != null;
      const hasAdmittedPlan: any = admittedPlan != null;
      if ((!hasAdmittedPlan || typeof admittedPlan !== 'object' || Array.isArray(admittedPlan)) && !hasExecutionPolicy) {
        state = 'ready';
        return { accepted: false, reason: 'admitted_plan_required' };
      }
      if (hasAdmittedPlan && (typeof admittedPlan !== 'object' || Array.isArray(admittedPlan))) {
        state = 'ready';
        return { accepted: false, reason: 'admitted_plan_invalid' };
      }
      const selected: any = admittedPlan?.selected && typeof admittedPlan.selected === 'object'
        ? admittedPlan.selected
        : {};
      const admittedProvider: any = selected.inference_provider ?? selected.inferenceProvider ?? null;
      const admittedModel: any = selected.model ?? null;
      if (hasAdmittedPlan && (!admittedProvider || !admittedModel)) {
        state = 'ready';
        return { accepted: false, reason: 'admitted_plan_binding_incomplete' };
      }
      const admittedThinking: any = typeof admittedPlan?.options?.thinking === 'string'
        ? admittedPlan.options.thinking
        : null;
      const next: any = {
        provider: admittedProvider ?? currentConfig.provider,
        model: admittedModel ?? currentConfig.model,
        thinking: admittedThinking ?? currentConfig.thinking,
        executionPolicy: hasExecutionPolicy
          ? normalizeNarsExecutionPolicy(requestedExecutionPolicy, { sourceKind: 'runtime-reconfigure' })
          : currentConfig.executionPolicy,
      };
      const isolation: any = createPiRuntimeIsolationConfig({
        provider: publicResourceId(next.provider),
        model: publicResourceId(next.model),
        thinking: nonEmpty(next.thinking),
        sdkVersion: piVersion ?? 'narada-pi-compat',
        mode: kind === 'pi-sdk' ? 'sdk' : 'rpc',
      });
      assertPiRuntimeIsolation(isolation);
      const hostConfig: any = {
        ...(admittedProvider
          ? { provider: publicResourceId(next.provider) }
          : {}),
        ...(next.provider && admittedModel
          ? { model: publicResourceId(next.model) }
          : {}),
        ...(admittedThinking
          ? { thinking: nonEmpty(next.thinking) }
          : {}),
      };
      const result: any = admittedProvider || admittedModel || admittedThinking
        ? await host.reconfigure(hostConfig)
        : null;
      currentConfig = next;
      state = 'ready';
      return { accepted: true, active: { provider: publicResourceId(next.provider), model: publicResourceId(next.model), thinking: nonEmpty(next.thinking), ...(hasExecutionPolicy ? { execution_policy: next.executionPolicy } : {}) }, host: { status: 'reconfigured', adapter_result_present: result != null } };
    } catch (error) {
      state = 'ready';
      lastError = compactError(error, 'pi_reconfigure_failed');
      return { accepted: false, reason: 'runtime_reconfiguration_failed', error: lastError };
    }
  }

  async function inspect() { return health(); }

  async function recover({ sessionSnapshot = null, journalEvents = [], turn = null }: any = {}) {
    if (closed) throw new NarsKernelContractError('pi_kernel_closed', 'Pi kernel is closed.');
    if (activeTurnId) {
      throw new NarsKernelContractError(
        'pi_recovery_turn_active',
        `Pi kernel cannot recover while turn '${activeTurnId}' is active.`,
      );
    }
    state = 'recovering';
    try {
      continuation.clear();
      const context: any = turn
        ? buildPiContextFromNarsRecords({ sessionSnapshot, turn, events: journalEvents, maxMessages: maxContinuationMessages })
        : null;
      for (const message of context?.messages ?? []) continuation.append(message);
      const hostRecovery: any = await host.recover?.({ context });
      latestRecovery = {
        schema: 'narada.nars.pi.recovery.evidence.v1',
        source: 'nars-owned-journal',
        canonical_history_reconstructable: true,
        pi_continuation_discarded: hostRecovery?.continuation_state_discarded ?? true,
        ...(hostRecovery ? { host_recovery: hostRecovery } : {}),
        duplicate_execution_prevented_by: 'nars-session-core-event-idempotency',
        context_message_count: context?.messages?.length ?? 0,
        recovered_at: now(),
      };
      state = 'ready';
      return latestRecovery;
    } catch (error) {
      lastError = compactError(error, 'pi_recovery_failed');
      state = 'failed';
      throw error;
    }
  }

  async function close(request: any = {}) {
    if (closed) return { closed: true, reason: request.reason ?? 'already_closed' };
    closed = true;
    const reason: any = request.reason ?? 'kernel_close';
    if (activeTurnId) {
      state = 'cancelling';
      cancellation.request(reason);
      try { await host.cancel?.(reason); } catch (error) { lastError = compactError(error, 'pi_close_cancel_failed'); }
      await activeTurnCompletion;
    }
    try { await host.close?.(); } finally {
      state = 'closed';
      activeTurnId = null;
      cancellation.clear();
      activeTurnCompletion = null;
      resolveActiveTurnCompletion = null;
    }
    return { closed: true, reason, recovery: latestRecovery, joined: true };
  }

  return Object.freeze({
    start,
    runTurn,
    invokeAdmitted,
    steer,
    cancel,
    reconfigure,
    inspect,
    health,
    recover,
    close,
    correlationRegistry: correlation,
    continuationState: continuation,
    get state() { return state; },
    get activeTurnId() { return activeTurnId; },
    get queuedSteeringCount() { return queuedSteering.length; },
    get startEvidence() { return startEvidence; },
    adapterVersion: PI_ADAPTER_VERSION,
  });
}

export { createPiKernel };
