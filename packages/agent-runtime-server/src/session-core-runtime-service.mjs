import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { resolveCommandInput } from '@narada2/carrier-command-contract';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { markNarsSessionIndexClosed, writeNarsSessionStartedIndex } from '@narada2/nars-session-core/session-index';
import { buildNarsRuntimeSurfaceContract } from '@narada2/nars-runtime-contract/runtime-surface-contract';
import { buildLaunchProcessOwnershipEvidence } from '@narada2/launch-process-ownership';
import { normalizeIntelligenceInvocationControl } from '@narada2/invokable-intelligence-contract';
import { createRuntimeSessionBinding } from './runtime-session-binding.mjs';
import { createNarsCapabilityGateway } from '@narada2/nars-capability-gateway/capability-gateway';
import { createNarsRuntimeRequestRegistry } from './runtime-request-state.mjs';
import { isNarsRuntimeServerMethod } from './runtime-control-contract.mjs';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_FRESH_MS = 30_000;
const NARS_HEARTBEAT_SCHEMA = 'narada.nars.heartbeat.v1';
const ADMITTED_RUNTIME_MCP_SCOPES = new Set(['all', 'host', 'user-site', 'local-site', 'site', 'none']);
const SESSION_CONTROL_METHODS = new Set([
  'session.submit',
  'session.command.execute',
  'session.health',
  'session.cancel',
  'session.recovery',
  'session.close',
]);

/** Unknown or malformed runtime scope input is inert; only launcher-admitted scopes can expose tools. */
export function normalizeRuntimeMcpScope(value) {
  const normalized = String(value ?? 'none').trim().toLowerCase();
  return ADMITTED_RUNTIME_MCP_SCOPES.has(normalized) ? normalized : 'none';
}
let heartbeatWriteSequence = 0;

function requestOutcomeForTurnResult(terminalState) {
  if (terminalState === 'completed') return 'completed';
  if (['blocked', 'failed', 'interrupted', 'refused'].includes(terminalState)) return `turn_${terminalState}`;
  return 'completed';
}

function buildLocalRuntimeSurfaceContract(runtimeContext, generatedAt = new Date().toISOString()) {
  const sessionId = runtimeContext?.session ?? runtimeContext?.launchSessionId ?? 'runtime';
  return buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'local',
    authority: {
      authority_runtime_host: 'local',
      authority_epoch: Number.isInteger(runtimeContext?.authorityEpoch) && runtimeContext.authorityEpoch >= 1
        ? runtimeContext.authorityEpoch
        : 1,
      authority_runtime_id: runtimeContext?.authorityRuntimeId?.trim() || `local-nars:${sessionId}`,
      canonicity: 'canonical',
      authority_transition_state: 'not_requested',
      source_write_admission: 'active',
    },
    generated_at: generatedAt,
  });
}

export function sessionCommandResult(command, value, supervisor, runtimeContext, intelligenceToolGateway, requestLifecycle, intelligenceRuntime) {
  const resolved = resolveCommandInput(command, value);
  if (!resolved) throw new Error('unsupported_session_command');
  const summary = resolved.name === 'status'
    ? `session ${supervisor.health().lifecycle_state ?? 'unknown'}`
    : resolved.record.help;
  return {
    command: resolved.primary,
    value: resolved.argument ?? '',
    command_name: resolved.name,
    status: 'ok',
    summary,
    terminal_state: 'completed',
    ...(resolved.name === 'status'
      ? { health: projectRuntimeHealth(supervisor.health(), runtimeContext, intelligenceToolGateway, requestLifecycle, intelligenceRuntime) }
      : {}),
  };
}

export function createDisabledIntelligenceToolGateway(reason = 'mcp_scope_none') {
  return Object.freeze({
    toolCatalog: async () => [],
    invoke: async () => ({
      schema: 'narada.nars.mcp-admission.v1',
      status: 'denied',
      admission_action: 'deny',
      admission_reason: reason,
      error: reason,
    }),
    operationalState: () => 'disabled',
    close: async () => {},
  });
}

export function createScopedIntelligenceToolGateway({ mcpScope = 'none', gateway = null, toolGateway = null } = {}) {
  const normalizedScope = normalizeRuntimeMcpScope(mcpScope);
  if (normalizedScope === 'none') return createDisabledIntelligenceToolGateway();
  if (toolGateway) return toolGateway;
  if (!gateway) throw new Error('mcp_capability_gateway_required');
  return {
    toolCatalog: async () => (await gateway.start()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.provider_tool_name ?? tool.tool_name,
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
      nars_gateway_proxy: true,
      capability_identity: tool.capability_identity ?? tool.capabilityIdentity ?? null,
    })),
    invoke: ({ toolName, tool_name: toolNameAlias, arguments: args, abortSignal, turnId, turn_id: turnIdAlias, inputEventId, input_event_id: inputEventIdAlias, agentId, agent_id: agentIdAlias, sessionId, session_id: sessionIdAlias, inputId, input_id: inputIdAlias, runtimeRequestId, runtime_request_id: runtimeRequestIdAlias, idempotencyKey, idempotency_key: idempotencyKeyAlias, turnAttempt, turn_attempt: turnAttemptAlias, toolCallId, tool_call_id: toolCallIdAlias, piMessageId, pi_message_id: piMessageIdAlias, capabilityIdentity, capability_identity: capabilityIdentityAlias, authorityPosture, authority_posture: authorityPostureAlias, admissionEvidence, admission_evidence: admissionEvidenceAlias, executionEvidence, execution_evidence: executionEvidenceAlias, resultReference, result_reference: resultReferenceAlias, reconciliationState, reconciliation_state: reconciliationStateAlias, correlationKey, correlation_key: correlationKeyAlias }) => gateway.invoke({
      toolName,
      tool_name: toolNameAlias ?? toolName,
      arguments: args,
      abortSignal,
      turnId: turnId ?? turnIdAlias,
      turn_id: turnId ?? turnIdAlias,
      inputEventId: inputEventId ?? inputEventIdAlias,
      input_event_id: inputEventId ?? inputEventIdAlias,
      agentId: agentId ?? agentIdAlias,
      agent_id: agentId ?? agentIdAlias,
      sessionId: sessionId ?? sessionIdAlias,
      session_id: sessionId ?? sessionIdAlias,
      inputId: inputId ?? inputIdAlias,
      input_id: inputId ?? inputIdAlias,
      runtimeRequestId: runtimeRequestId ?? runtimeRequestIdAlias,
      runtime_request_id: runtimeRequestId ?? runtimeRequestIdAlias,
      idempotencyKey: idempotencyKey ?? idempotencyKeyAlias,
      idempotency_key: idempotencyKey ?? idempotencyKeyAlias,
      turnAttempt: turnAttempt ?? turnAttemptAlias,
      turn_attempt: turnAttempt ?? turnAttemptAlias,
      toolCallId: toolCallId ?? toolCallIdAlias,
      tool_call_id: toolCallId ?? toolCallIdAlias,
      piMessageId: piMessageId ?? piMessageIdAlias,
      pi_message_id: piMessageId ?? piMessageIdAlias,
      capabilityIdentity: capabilityIdentity ?? capabilityIdentityAlias,
      capability_identity: capabilityIdentity ?? capabilityIdentityAlias,
      authorityPosture: authorityPosture ?? authorityPostureAlias,
      authority_posture: authorityPosture ?? authorityPostureAlias,
      admissionEvidence: admissionEvidence ?? admissionEvidenceAlias,
      admission_evidence: admissionEvidence ?? admissionEvidenceAlias,
      executionEvidence: executionEvidence ?? executionEvidenceAlias,
      execution_evidence: executionEvidence ?? executionEvidenceAlias,
      resultReference: resultReference ?? resultReferenceAlias,
      result_reference: resultReference ?? resultReferenceAlias,
      reconciliationState: reconciliationState ?? reconciliationStateAlias,
      reconciliation_state: reconciliationState ?? reconciliationStateAlias,
      correlationKey: correlationKey ?? correlationKeyAlias,
      correlation_key: correlationKey ?? correlationKeyAlias,
    }),
    operationalState: () => gateway.operationalState?.() ?? 'unknown',
    close: () => gateway.close(),
  };
}

/** Build the one runtime-owned capability gateway shared by kernel startup and turns. */
export function createRuntimeCapabilityGateway({
  runtimeContext = {},
  admitCapability = null,
  recordEvidence = () => {},
} = {}) {
  const mcpScope = normalizeRuntimeMcpScope(runtimeContext?.mcpScope);
  const gateway = mcpScope === 'none'
    ? null
    : createNarsCapabilityGateway({
      siteRoot: runtimeContext.siteRoot,
      ownershipContext: {
        launch_session_id: runtimeContext.launchSessionId,
        ownership: runtimeContext.processOwnership,
        process_role: runtimeContext.processRole,
        created_by_pid: runtimeContext.createdByPid,
      },
      ...(typeof admitCapability === 'function' ? { admit: admitCapability } : {}),
      recordEvidence,
    });
  return createScopedIntelligenceToolGateway({ mcpScope, gateway });
}

export function shouldPersistNarsRuntimeRequestTransition(record) {
  if (record?.method !== 'session.health') return true;
  return record.request_state === 'failed'
    || record.request_state === 'rejected'
    || record.terminal_state === 'failed'
    || record.terminal_state === 'rejected';
}

function createJsonLineWriter(output) {
  let failure = null;
  let tail = Promise.resolve();
  const onError = (error) => { failure ??= error; };
  output.on?.('error', onError);
  function write(value) {
    const line = `${JSON.stringify(value)}\n`;
    tail = tail.then(() => {
      if (failure) throw failure;
      return new Promise((resolve, reject) => {
        try {
          output.write(line, (error) => {
            if (error) {
              failure ??= error;
              reject(error);
            } else resolve();
          });
        } catch (error) {
          failure ??= error;
          reject(error);
        }
      });
    });
    tail.catch(() => {});
    return tail;
  }
  return {
    write,
    async flush() {
      await tail;
      if (failure) throw failure;
    },
    close() {
      output.off?.('error', onError);
    },
  };
}

function heartbeatPathForRuntimeContext(runtimeContext) {
  if (runtimeContext?.siteRoot && runtimeContext?.session) {
    return resolveNaradaSitePaths({ siteRoot: runtimeContext.siteRoot, sessionId: runtimeContext.session }).narsHeartbeatPath ?? null;
  }
  return runtimeContext?.sessionPath ? join(dirname(String(runtimeContext.sessionPath)), 'heartbeat.json') : null;
}

function writeRuntimeHeartbeat(runtimeContext, { reason = 'runtime_heartbeat', status = 'alive', now = new Date().toISOString() } = {}) {
  const path = heartbeatPathForRuntimeContext(runtimeContext);
  if (!path) return null;
  const record = {
    schema: NARS_HEARTBEAT_SCHEMA,
    session_id: runtimeContext.session ?? null,
    agent_id: runtimeContext.identity ?? null,
    site_id: runtimeContext.siteId ?? null,
    runtime: 'narada-agent-runtime-server',
    pid: process.pid,
    status,
    heartbeat_at: now,
    last_written_at: now,
    reason,
  };
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${++heartbeatWriteSequence}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The atomic rename already removed the temporary path.
    }
  }
  return record;
}

function markSessionClosed(runtimeContext, reason, now = new Date().toISOString()) {
  writeRuntimeHeartbeat(runtimeContext, { reason, status: 'stopped', now });
  markNarsSessionIndexClosed({
    sessionPath: runtimeContext.sessionPath,
    siteRoot: runtimeContext.siteRoot,
    terminalState: 'closed',
    terminalReason: reason,
    closedAt: now,
  });
}

function runtimeHostSnapshot(runtimeContext) {
  if (typeof runtimeContext.runtimeHostState === 'function') return runtimeContext.runtimeHostState();
  return runtimeContext.runtimeHostState ?? null;
}

function currentIntelligenceSnapshot(intelligenceRuntime, runtimeContext) {
  return intelligenceRuntime?.snapshot?.() ?? {
    schema: 'narada.nars.intelligence_runtime_snapshot.v1',
    authority: 'unavailable',
    principal: runtimeContext.intelligence?.principal ?? null,
    requested_model: runtimeContext.intelligence?.requestedModel ?? null,
    requested_options: runtimeContext.intelligence?.requestedOptions ?? {},
    latest_plan: null,
    latest_outcome: null,
    latest_attempt_id: null,
    latest_replayed: null,
    reconfiguration: null,
    intelligence_kernel_kind: runtimeContext.intelligenceKernelKind ?? null,
    kernel: null,
  };
}

function canonicalStartupIntelligenceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const {
    intelligence_kernel_kind: _kernelKind,
    kernel: _kernelHealth,
    kernel_start_evidence: _kernelStartEvidence,
    ...canonical
  } = snapshot;
  return canonical;
}

function requestContent(request) {
  if (typeof request === 'string') return request;
  if (!request || typeof request !== 'object') return null;
  return request.content ?? request.params?.content ?? request.params?.message ?? null;
}

function providerContentPart(part) {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  if (part.type === 'text' && typeof part.text === 'string') return part.text;
  if (part.type === 'artifact_ref') {
    const title = typeof part.title === 'string' && part.title.trim() ? ` ${part.title.trim()}` : '';
    const kind = typeof part.kind === 'string' && part.kind.trim() ? ` (${part.kind.trim()})` : '';
    const artifactId = typeof part.artifact_id === 'string' && part.artifact_id.trim()
      ? part.artifact_id.trim()
      : 'unknown';
    return `[Artifact${title}${kind}; id=${artifactId}]`;
  }
  if (typeof part.text === 'string') return part.text;
  return JSON.stringify(part);
}

export function normalizeProviderConversationContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(providerContentPart).filter(Boolean).join('\n').trim();
  }
  if (content == null) return '';
  return providerContentPart(content).trim();
}

export function requestRejectionCode(method, message) {
  if (message === 'invalid_json') return 'invalid_json';
  if (String(message).includes('IntelligenceInvocationControlError')
    || String(message).includes('invalid-intelligence-invocation-control')
    || (method === 'session.submit' && String(message).startsWith('$.'))) {
    return 'invalid_intelligence_invocation_control';
  }
  if (method === 'session.submit') return 'request_dispatch_failed';
  if (method === 'runtime.intelligence.reconfigure') return 'runtime_reconfiguration_failed';
  if (SESSION_CONTROL_METHODS.has(method) || isNarsRuntimeServerMethod(method)) return 'session_control_failed';
  return 'unsupported_session_control';
}

function providerConversationMessages({ eventsPath, currentInput } = {}) {
  const currentInputId = currentInput?.event_id == null ? null : String(currentInput.event_id);
  const messages = [];
  for (const event of readNarsEventLog(eventsPath).events) {
    const eventTurnId = String(event.turn_id ?? event.input_event_id ?? event.event_id ?? '');
    if (event?.event === 'user_message' && eventTurnId !== currentInputId) {
      const content = normalizeProviderConversationContent(event.content);
      if (content) messages.push({ role: 'user', content });
    }
    if (event?.event === 'assistant_message') {
      const content = normalizeProviderConversationContent(event.content);
      if (content) messages.push({ role: 'assistant', content });
    }
  }
  const content = String(currentInput?.content ?? '').trim();
  if (content) messages.push({ role: 'user', content });
  return messages;
}

const CURRENT_INPUT_ONLY_MODES = new Set(['retry', 'resume', 'replay']);

export function sessionSubmitInvocationControl(request) {
  const value = request?.params?.intelligence_invocation;
  return value === undefined ? null : normalizeIntelligenceInvocationControl(value);
}

export function buildProviderTurnContext({ eventsPath, input } = {}) {
  const control = input?.metadata?.intelligence_invocation ?? null;
  const content = String(input?.content ?? '').trim();
  const messages = control && (control.intent_id || CURRENT_INPUT_ONLY_MODES.has(control.mode))
    ? (content ? [{ role: 'user', content }] : [])
    : providerConversationMessages({ eventsPath, currentInput: input });
  return {
    turnId: input.event_id,
    runtimeRequestId: input.runtime_request_id
      ?? input.runtimeRequestId
      ?? input.metadata?.runtime_request_id
      ?? input.metadata?.runtimeRequestId
      ?? input.request_id
      ?? null,
    runtime_request_id: input.runtime_request_id
      ?? input.runtimeRequestId
      ?? input.metadata?.runtime_request_id
      ?? input.metadata?.runtimeRequestId
      ?? input.request_id
      ?? null,
    idempotencyKey: input.idempotency_key ?? input.idempotencyKey ?? null,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey ?? null,
    turnAttempt: input.turn_attempt ?? input.turnAttempt ?? input.metadata?.turn_attempt ?? 1,
    turn_attempt: input.turn_attempt ?? input.turnAttempt ?? input.metadata?.turn_attempt ?? 1,
    messages,
    ...(control ? {
      settings: {
        ...(control.intent_id ? { intentId: control.intent_id } : {}),
        ...(control.operation_id ? { operationId: control.operation_id } : {}),
        mode: control.mode,
        allowReplan: control.allow_replan,
        ...(input.request_id ? { requestId: input.request_id } : {}),
      },
    } : {}),
  };
}

function parseRequest(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { method: null, parse_error: 'invalid_json' };
    }
    return { method: 'session.submit', content: trimmed };
  }
}

function projectRuntimeHealth(snapshot, runtimeContext, toolGateway, requestLifecycle = null, intelligenceRuntime = null) {
  // MCP authority is opt-in. A runtime that did not receive an explicit scope
  // must report disabled rather than silently projecting the composed fabric.
  const mcpScope = normalizeRuntimeMcpScope(runtimeContext?.mcpScope);
  const mcpOperationalState = mcpScope === 'none'
    ? 'disabled'
    : snapshot.mcp_operational_state
      ?? toolGateway.operationalState?.()
      ?? 'unknown';
  const lifecycleState = snapshot.lifecycle_state ?? 'starting';
  const status = lifecycleState === 'starting'
    ? 'starting'
    : lifecycleState === 'closing' || lifecycleState === 'closed'
      ? 'closing'
      : snapshot.operational_posture === 'healthy'
        ? 'healthy'
        : 'degraded';
  const heartbeat = readHeartbeatProjection(heartbeatPathForRuntimeContext(runtimeContext));
  const generatedAt = new Date().toISOString();
  const intelligence = currentIntelligenceSnapshot(intelligenceRuntime, runtimeContext);
  return {
    ...snapshot,
    schema: 'narada.nars.health.v1',
    status,
    generated_at: generatedAt,
    health_observed_at: generatedAt,
    agent_id: runtimeContext.identity ?? null,
    session_id: snapshot.session_id ?? runtimeContext.session ?? null,
    site_root: runtimeContext.siteRoot ?? null,
    runtime: 'narada-agent-runtime-server',
    runtime_mode: 'server',
    runtime_origin: 'local',
    authority_runtime_host: 'local',
    runtime_surface_contract: buildLocalRuntimeSurfaceContract(runtimeContext, generatedAt),
    health_endpoint: runtimeContext.healthUrl ?? null,
    event_endpoint: runtimeContext.eventStreamUrl ?? null,
    runtime_host_state: runtimeHostSnapshot(runtimeContext),
    heartbeat,
    intelligence,
    intelligence_kernel_kind: intelligence.intelligence_kernel_kind
      ?? runtimeContext.intelligenceKernelKind
      ?? null,
    kernel: intelligence.kernel ?? null,
    mcp_operational_state: mcpOperationalState,
    mcp_scope: mcpScope,
    mcp: {
      operational_state: mcpOperationalState,
      scope: mcpScope,
      server_count: mcpScope === 'none' ? 0 : null,
      startup_failure_count: 0,
      runtime_fault_count: 0,
    },
    activity: {
      last_event_kind: snapshot.last_event_kind ?? null,
      last_event_at: snapshot.last_event_at ?? null,
      active_turn_state: snapshot.active_turn_state ?? null,
      last_terminal_state: snapshot.last_terminal_state ?? null,
    },
    posture: {
      request_posture: snapshot.request_posture ?? null,
      operational_posture: snapshot.operational_posture ?? null,
    },
    control_input_bridge: typeof runtimeContext.controlInputBridgeState === 'function'
      ? runtimeContext.controlInputBridgeState()
      : null,
    runtime_requests: requestLifecycle?.snapshot?.() ?? null,
    request_accounting: {
      schema: 'narada.nars.request_accounting.v1',
      source: 'narada-agent-runtime-server',
      correlation_fields: ['runtime_request_id', 'request_id', 'input_event_id', 'turn_id'],
      runtime_requests: requestLifecycle?.snapshot?.() ?? null,
      operator_input_queue: snapshot.operator_input_queue ?? null,
    },
  };
}

function readHeartbeatProjection(path) {
  if (!path || !existsSync(path)) {
    return { path: path ?? null, last_written_at: null, age_ms: null, freshness: 'missing' };
  }
  try {
    const heartbeat = JSON.parse(readFileSync(path, 'utf8'));
    const lastWrittenAt = heartbeat?.last_written_at
      ?? heartbeat?.timestamp
      ?? heartbeat?.heartbeat_at
      ?? null;
    const parsedAt = lastWrittenAt ? Date.parse(lastWrittenAt) : Number.NaN;
    return {
      path,
      last_written_at: lastWrittenAt,
      age_ms: Number.isFinite(parsedAt) ? Math.max(0, Date.now() - parsedAt) : null,
      freshness: Number.isFinite(parsedAt)
        ? Date.now() - parsedAt <= HEARTBEAT_FRESH_MS ? 'fresh' : 'stale'
        : 'unknown',
      freshness_threshold_ms: HEARTBEAT_FRESH_MS,
    };
  } catch {
    return { path, last_written_at: null, age_ms: null, freshness: 'unknown', freshness_threshold_ms: HEARTBEAT_FRESH_MS };
  }
}

/**
 * Narrow JSONL control service. Session-core owns all durable session state;
 * the runtime server supplies only the canonical intelligence callable and tool gateway.
 */
export function createSessionCoreRuntimeService({
  runtimeContext,
  invokeIntelligenceFn,
  intelligenceRuntime = null,
  toolGateway = null,
  admitCapability = null,
  onAuthorityHeartbeat = null,
  onAuthorityClose = null,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  now = () => new Date().toISOString(),
} = {}) {
  const mcpScope = normalizeRuntimeMcpScope(runtimeContext?.mcpScope);
  const heartbeatCadenceMs = Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
    ? heartbeatIntervalMs
    : 0;
  let supervisor = null;
  let authorityFailureReported = false;
  const notifyAuthorityHeartbeat = async (reason, at) => {
    if (typeof onAuthorityHeartbeat !== 'function') return;
    try {
      await onAuthorityHeartbeat({
        pid: process.pid,
        now: at,
        evidence: { runtime_heartbeat_reason: reason },
      });
    } catch (error) {
      if (!authorityFailureReported) {
        authorityFailureReported = true;
        supervisor?.core.appendEvent({
          event: 'runtime_session_authority_heartbeat_failed',
          error: error instanceof Error ? error.message : String(error),
          reason,
        });
      }
      throw error;
    }
  };
  const requestLifecycle = createNarsRuntimeRequestRegistry({
    metadata: { transport: 'jsonl_stdio' },
    onTransition: (record) => {
      if (shouldPersistNarsRuntimeRequestTransition(record)) supervisor?.core.appendEvent(record);
    },
  });
  const intelligenceToolGateway = toolGateway
    ? createScopedIntelligenceToolGateway({ mcpScope, toolGateway })
    : createRuntimeCapabilityGateway({
      runtimeContext,
      admitCapability,
      recordEvidence: async (event) => supervisor?.core.appendEvent({ event: event.kind, ...event }),
    });
  // Bind the scoped NARS gateway at the session-core crossing as well as
  // carrying it through the carrier turn context.  The kernel must never
  // have to guess whether a capability gateway was supplied; a transport or
  // carrier that drops the optional override must still fail closed through
  // this canonical runtime-owned binding.
  const runtimeCall = intelligenceRuntime?.callIntelligence
    ? (messages, tools, overrides = {}) => intelligenceRuntime.callIntelligence(messages, tools, {
      ...overrides,
      capabilityGateway: overrides.capabilityGateway ?? intelligenceToolGateway,
    })
    : invokeIntelligenceFn;
  supervisor = createRuntimeSessionBinding({
    runtimeContext,
    invokeIntelligenceFn: runtimeCall,
    toolGateway: intelligenceToolGateway,
    buildTurnContext: (input) => {
      return buildProviderTurnContext({ eventsPath: runtimeContext.eventsPath, input });
    },
  });

  async function handleRequest(request, writer, requestState) {
    const requestId = request?.id ?? request?.request_id ?? null;
    const method = request?.method ?? (requestContent(request) != null ? 'session.submit' : null);
    const idempotencyKey = typeof request?.idempotency_key === 'string' && request.idempotency_key.trim()
      ? request.idempotency_key.trim()
      : (typeof request?.params?.idempotency_key === 'string' && request.params.idempotency_key.trim() ? request.params.idempotency_key.trim() : null);
    requestState.transition('running');
    try {
      if (isNarsRuntimeServerMethod(method)) {
        if (!intelligenceRuntime?.reconfigure) throw new Error('runtime_intelligence_reconfiguration_unavailable');
        const result = await intelligenceRuntime.reconfigure(request?.params ?? {}, {
          isBusy: () => Boolean(supervisor.activeTurnId)
            || Number(supervisor.health().operator_input_queue?.pending_count ?? 0) > 0,
        });
        supervisor.core.appendEvent({
          event: 'runtime_intelligence_reconfiguration',
          request_id: requestId,
          ...result,
        });
        requestState.transition('completed', { terminal_state: result.terminal_state });
        return false;
      }
      if (method === 'session.health') {
        await writer.write({
          event: 'session_health',
          request_id: requestId,
          ...projectRuntimeHealth(supervisor.health(), runtimeContext, intelligenceToolGateway, requestLifecycle, intelligenceRuntime),
        });
        requestState.transition('completed');
        return false;
      }
      if (method === 'session.cancel') {
        const cancelled = await supervisor.cancel({ request_id: requestId });
        await writer.write({ event: 'session_cancel', request_id: requestId, cancelled });
        requestState.transition('completed');
        return false;
      }
      if (method === 'session.recovery') {
        await writer.write({ event: 'session_recovery', request_id: requestId, ...supervisor.recovery() });
        requestState.transition('completed');
        return false;
      }
      if (method === 'session.command.execute') {
        const command = String(request?.params?.command ?? request?.command ?? '').trim();
        const value = String(request?.params?.value ?? request?.value ?? '').trim();
        if (!command) throw new Error('missing_session_command');
        supervisor.core.appendEvent({
          event: 'session_control_accepted',
          request_id: requestId,
          method,
          command,
          value,
          idempotency_key: idempotencyKey,
          acceptance_state: 'accepted',
          transport: 'jsonl_stdio',
        });
        const result = sessionCommandResult(
          command,
          value,
          supervisor,
          runtimeContext,
          intelligenceToolGateway,
          requestLifecycle,
          intelligenceRuntime,
        );
        supervisor.core.appendEvent({
          event: 'carrier_command_executed',
          request_id: requestId,
          method,
          idempotency_key: idempotencyKey,
          ...result,
        });
        await writer.write({ event: 'command_result', request_id: requestId, ...result });
        supervisor.core.appendEvent({
          event: 'session_control_response',
          request_id: requestId,
          method,
          idempotency_key: idempotencyKey,
          terminal_state: 'completed',
        });
        requestState.transition('completed', { terminal_state: 'completed' });
        return false;
      }
      if (method === 'session.close') {
        supervisor.core.appendEvent({
          event: 'session_control_accepted',
          request_id: requestId,
          method,
          idempotency_key: idempotencyKey,
          acceptance_state: 'accepted',
          transport: 'jsonl_stdio',
        });
        await supervisor.close({ request_id: requestId, reason: 'control_request' }, {
          beforeSessionClosed: () => {
            supervisor.core.appendEvent({
              event: 'session_control_response',
              request_id: requestId,
              method,
              idempotency_key: idempotencyKey,
              terminal_state: 'completed',
            });
            requestState.transition('completed', { terminal_reason: 'control_request' });
          },
        });
        markSessionClosed(runtimeContext, 'control_request', now());
        return true;
      }
      if (request?.parse_error === 'invalid_json') throw new Error('invalid_json');
      if (method !== 'session.submit') throw new Error('unsupported_session_control');
      if (requestContent(request) == null) throw new Error('unsupported_session_control');
      const invocationControl = sessionSubmitInvocationControl(request);
      supervisor.core.appendEvent({
        event: 'session_control_accepted',
        request_id: requestId,
        method,
        idempotency_key: idempotencyKey,
        acceptance_state: 'accepted',
        transport: 'jsonl_stdio',
        ...(invocationControl ? { intelligence_invocation: invocationControl } : {}),
      });
      const dispatchRequest = {
        ...request,
        request_id: request?.request_id ?? request?.id ?? requestId ?? null,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
        metadata: {
          ...(request?.metadata ?? {}),
          runtime_request_id: requestState.runtimeRequestId,
          ...(invocationControl ? { intelligence_invocation: invocationControl } : {}),
        },
      };
      const result = await supervisor.dispatch(dispatchRequest);
      const terminalState = result?.terminal_state ?? 'completed';
      const requestOutcome = requestOutcomeForTurnResult(terminalState);
      supervisor.core.appendEvent({
        event: 'session_control_response',
        request_id: requestId,
        method,
        idempotency_key: idempotencyKey,
        terminal_state: terminalState,
        request_outcome: requestOutcome,
      });
      // The control request was handled even when the turn itself reached a failed terminal state.
      requestState.transition('completed', { turn_terminal_state: terminalState, request_outcome: requestOutcome });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (method === 'session.command.execute') {
        const command = String(request?.params?.command ?? request?.command ?? '').trim() || 'unknown';
        supervisor.core.appendEvent({
          event: 'carrier_command_executed',
          request_id: requestId,
          method,
          command,
          status: 'error',
          summary: message,
          terminal_state: 'failed',
        });
      }
      supervisor.core.appendEvent({
        event: 'session_control_rejected',
        request_id: requestId,
        method,
        idempotency_key: idempotencyKey,
        code: requestRejectionCode(method, message),
        error: message,
      });
      const terminalState = message === 'invalid_json' || method !== 'session.submit' ? 'rejected' : 'failed';
      requestState.transition(terminalState, { error: message });
      if (method === 'session.close') throw error;
      return false;
    }
  }

  async function run({ input = process.stdin, output = process.stdout } = {}) {
    const writer = createJsonLineWriter(output);
    const subscription = supervisor.core.eventHub.subscribe({
      subscriptionId: 'runtime-jsonl',
      send: (envelope) => writer.write(envelope.payload),
    });
    subscription.markLive({ source: 'jsonl_stdio_ready' });
    const initialIntelligence = canonicalStartupIntelligenceSnapshot(
      currentIntelligenceSnapshot(intelligenceRuntime, runtimeContext),
    );
    const sessionStartedEvent = supervisor.core.appendEvent({
      event: 'session_started',
      runtime: 'narada-agent-runtime-server',
      transport: 'jsonl_stdio',
      runtime_contract: 'nars_session_core_control.v1',
      runtime_origin: 'local',
      authority_runtime_host: 'local',
      runtime_surface_contract: buildLocalRuntimeSurfaceContract(runtimeContext, now()),
      agent_identity_ref: runtimeContext.agentIdentityRef ?? null,
      site_id: runtimeContext.siteId ?? null,
      site_root: runtimeContext.siteRoot ?? null,
      control_path: runtimeContext.controlPath ?? null,
      session_path: runtimeContext.sessionPath ?? null,
      events_path: runtimeContext.eventsPath ?? null,
      operator_surface_kind: runtimeContext.operatorSurfaceKind ?? null,
      provider: initialIntelligence.latest_plan?.inference_provider?.id?.replace(/^inference-provider:/, '') ?? null,
      intelligence: initialIntelligence,
      mcp_scope: mcpScope,
      mcp_server_count: mcpScope === 'none' ? 0 : null,
      mcp_operational_state: mcpScope === 'none' ? 'disabled' : 'starting',
      delegated_authority_handoff: runtimeContext.narsDelegatedAuthorityHandoff ?? null,
      delegated_authority_ref: runtimeContext.narsDelegatedAuthorityHandoff?.authority_ref ?? null,
      health_endpoint: runtimeContext.healthUrl ?? null,
      event_endpoint: runtimeContext.eventStreamUrl ?? null,
      runtime_host_state: runtimeHostSnapshot(runtimeContext),
      launch_session_id: runtimeContext.launchSessionId ?? null,
      process_role: runtimeContext.processRole ?? null,
      process_ownership: runtimeContext.launchSessionId
        ? buildLaunchProcessOwnershipEvidence({
          launchSessionId: runtimeContext.launchSessionId,
          ownership: runtimeContext.processOwnership,
          processRole: runtimeContext.processRole,
          siteRoot: runtimeContext.siteRoot,
          ownerSiteRoot: runtimeContext.siteRoot,
          createdByPid: runtimeContext.createdByPid,
          pid: process.pid,
          serverName: 'narada-agent-runtime-server',
        })
        : null,
    });
    writeNarsSessionStartedIndex({
      sessionStartedEvent,
      sessionPath: runtimeContext.sessionPath,
      siteRoot: runtimeContext.siteRoot,
    });
    supervisor.start();
    let heartbeatTimer = null;
    input.setEncoding?.('utf8');
    let buffer = '';
    let closed = false;
    const schedule = (request) => {
      const method = request?.method ?? null;
      const requestId = request?.id ?? request?.request_id ?? null;
      const requestState = requestLifecycle.receive({
        requestId,
        method: method ?? (requestContent(request) != null ? 'session.submit' : null),
      });
      requestState.transition('scheduled');
      if (method === 'session.cancel') {
        const operation = handleRequest(request, writer, requestState);
        requestLifecycle.track(requestState.runtimeRequestId, operation);
        return operation;
      }
      if (method === 'session.close') {
        requestState.transition('waiting');
        const pendingBeforeClose = requestLifecycle.pendingOperations();
        const operation = Promise.allSettled(pendingBeforeClose)
          .then(() => handleRequest(request, writer, requestState));
        requestLifecycle.track(requestState.runtimeRequestId, operation);
        return operation;
      }
      const operation = handleRequest(request, writer, requestState);
      requestLifecycle.track(requestState.runtimeRequestId, operation);
      return Promise.resolve(false);
    };
    const drainInputLines = async () => {
      while (true) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) return false;
        const request = parseRequest(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (request) closed = await schedule(request);
        if (closed) return true;
      }
    };
    try {
      const startedAt = now();
      writeRuntimeHeartbeat(runtimeContext, { reason: 'session_started', now: startedAt });
      await notifyAuthorityHeartbeat('session_started', startedAt);
      if (heartbeatCadenceMs > 0) {
        heartbeatTimer = setInterval(() => {
          const heartbeatAt = now();
          try {
            writeRuntimeHeartbeat(runtimeContext, { now: heartbeatAt });
            void notifyAuthorityHeartbeat('runtime_heartbeat', heartbeatAt).catch(() => {});
          } catch (error) {
            supervisor?.core.appendEvent({
              event: 'runtime_heartbeat_write_failed',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }, heartbeatCadenceMs);
        heartbeatTimer.unref?.();
      }
      for await (const chunk of input) {
        buffer += String(chunk);
        if (await drainInputLines()) return;
      }
      const request = parseRequest(buffer);
      if (request) closed = await schedule(request);
      await Promise.allSettled(requestLifecycle.pendingOperations());
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (!closed && supervisor.core.lifecycleState === 'ready') {
        await supervisor.close({ reason: 'runtime_process_exit' });
        markSessionClosed(runtimeContext, 'runtime_process_exit', now());
      }
      try {
        await onAuthorityClose?.({
          reason: closed ? 'runtime_closed' : 'runtime_process_exit',
          now: now(),
          evidence: { runtime_closed: true },
        });
      } catch (error) {
        supervisor?.core.appendEvent({
          event: 'runtime_session_authority_close_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        await intelligenceToolGateway.close?.();
      } catch (error) {
        supervisor?.core.appendEvent({
          event: 'runtime_capability_gateway_close_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        await writer.flush();
      } finally {
        subscription.unsubscribe();
        writer.close();
      }
    }
  }

  return Object.freeze({
    supervisor,
    runtimeContext,
    intelligenceRuntime,
    requestLifecycle,
    run,
  });
}
