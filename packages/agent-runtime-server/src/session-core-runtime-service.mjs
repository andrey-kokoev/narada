import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { admittedProviderNames, loadProviderMetadata } from '@narada2/carrier-provider-contract';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { markNarsSessionIndexClosed, writeNarsSessionStartedIndex } from '@narada2/nars-session-core/session-index';
import { buildNarsRuntimeSurfaceContract } from '@narada2/nars-runtime-contract/runtime-surface-contract';
import { buildLaunchProcessOwnershipEvidence } from '@narada2/launch-process-ownership';
import { createRuntimeSessionBinding } from './runtime-session-binding.mjs';
import { createNarsCapabilityGateway } from '@narada2/nars-capability-gateway/capability-gateway';
import { createNarsRuntimeRequestRegistry } from './runtime-request-state.mjs';
import { isNarsRuntimeServerMethod } from './runtime-control-contract.mjs';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_FRESH_MS = 30_000;
const NARS_HEARTBEAT_SCHEMA = 'narada.nars.heartbeat.v1';
const PROVIDER_METADATA = loadProviderMetadata();
const ADMITTED_PROVIDER_NAMES = admittedProviderNames();
const SESSION_CONTROL_METHODS = new Set([
  'session.submit',
  'session.health',
  'session.cancel',
  'session.recovery',
  'session.close',
]);
let heartbeatWriteSequence = 0;

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

function writeRuntimeHeartbeat(runtimeContext, { reason = 'runtime_heartbeat', now = new Date().toISOString() } = {}) {
  const path = heartbeatPathForRuntimeContext(runtimeContext);
  if (!path) return null;
  const record = {
    schema: NARS_HEARTBEAT_SCHEMA,
    session_id: runtimeContext.session ?? null,
    agent_id: runtimeContext.identity ?? null,
    site_id: runtimeContext.siteId ?? null,
    runtime: 'narada-agent-runtime-server',
    pid: process.pid,
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
  writeRuntimeHeartbeat(runtimeContext, { reason, now });
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

export function intelligenceChoices(provider, currentModel, currentThinking) {
  const metadata = PROVIDER_METADATA[provider] ?? {};
  return {
    providerChoices: ADMITTED_PROVIDER_NAMES.filter((name) => PROVIDER_METADATA[name]),
    modelChoices: uniqueStrings([
      currentModel,
      ...(Array.isArray(metadata.available_models) ? metadata.available_models : []),
    ]),
    thinkingChoices: uniqueStrings([
      currentThinking,
      ...Object.keys(metadata.cognition_defaults ?? {}),
    ]),
  };
}

function currentIntelligenceSnapshot(providerRuntime, runtimeContext) {
  const snapshot = providerRuntime?.snapshot?.() ?? {};
  return {
    ...snapshot,
    provider: snapshot.provider ?? runtimeContext.intelligenceProvider ?? null,
    model: snapshot.model ?? runtimeContext.providerSettings?.model ?? null,
    thinking: snapshot.thinking ?? runtimeContext.providerSettings?.thinking ?? null,
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
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

function projectRuntimeHealth(snapshot, runtimeContext, toolGateway, requestLifecycle = null, providerRuntime = null) {
  // MCP authority is opt-in. A runtime that did not receive an explicit scope
  // must report disabled rather than silently projecting the composed fabric.
  const mcpScope = runtimeContext.mcpScope ?? 'none';
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
  const intelligence = currentIntelligenceSnapshot(providerRuntime, runtimeContext);
  const intelligenceProvider = intelligence.provider;
  const intelligenceModel = intelligence.model;
  const intelligenceThinking = intelligence.thinking;
  const choices = intelligenceChoices(intelligenceProvider, intelligenceModel, intelligenceThinking);
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
    intelligence: {
      provider: intelligenceProvider,
      model: intelligenceModel,
      thinking: intelligenceThinking,
      provider_choices: choices.providerChoices,
      model_choices: choices.modelChoices,
      thinking_choices: choices.thinkingChoices,
      provider_runtime_binding: intelligence.provider_runtime_binding ?? null,
      reconfiguration: intelligence.reconfiguration ?? null,
    },
    mcp_operational_state: mcpOperationalState,
    mcp_scope: mcpScope,
    mcp: {
      operational_state: mcpOperationalState,
      scope: mcpScope,
      server_count: null,
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
 * the runtime server supplies only the provider callable and tool gateway.
 */
export function createSessionCoreRuntimeService({
  runtimeContext,
  callChatApiFn,
  providerRuntime = null,
  toolGateway = null,
  admitCapability = null,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  now = () => new Date().toISOString(),
} = {}) {
  const heartbeatCadenceMs = Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
    ? heartbeatIntervalMs
    : 0;
  let supervisor = null;
  const requestLifecycle = createNarsRuntimeRequestRegistry({
    metadata: { transport: 'jsonl_stdio' },
    onTransition: (record) => {
      if (shouldPersistNarsRuntimeRequestTransition(record)) supervisor?.core.appendEvent(record);
    },
  });
  const gateway = toolGateway ? null : createNarsCapabilityGateway({
    siteRoot: runtimeContext.siteRoot,
    ownershipContext: {
      launch_session_id: runtimeContext.launchSessionId,
      ownership: runtimeContext.processOwnership,
      process_role: runtimeContext.processRole,
      created_by_pid: runtimeContext.createdByPid,
    },
    ...(admitCapability ? { admit: admitCapability } : {}),
    recordEvidence: async (event) => supervisor?.core.appendEvent({ event: event.kind, ...event }),
  });
  const providerToolGateway = toolGateway ?? {
    toolCatalog: async () => (await gateway.start()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.provider_tool_name ?? tool.tool_name,
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
    })),
    invoke: ({ toolName, arguments: args, abortSignal, turnId, inputEventId }) => gateway.invoke({
      toolName,
      arguments: args,
      abortSignal,
      turnId,
      inputEventId,
    }),
    operationalState: () => gateway.operationalState?.() ?? 'unknown',
    close: () => gateway.close(),
  };
  const runtimeCall = providerRuntime?.callProvider ?? callChatApiFn;
  supervisor = createRuntimeSessionBinding({
    runtimeContext,
    callChatApiFn: runtimeCall,
    toolGateway: providerToolGateway,
    buildTurnContext: (input) => {
      const intelligence = currentIntelligenceSnapshot(providerRuntime, runtimeContext);
      return {
        turnId: input.event_id,
        messages: providerConversationMessages({ eventsPath: runtimeContext.eventsPath, currentInput: input }),
        provider: intelligence.provider ?? runtimeContext.intelligenceProvider ?? null,
        settings: {
          model: intelligence.model ?? runtimeContext.providerSettings?.model ?? null,
          thinking: intelligence.thinking ?? runtimeContext.providerSettings?.thinking ?? null,
        },
      };
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
        if (!providerRuntime?.reconfigure) throw new Error('runtime_intelligence_reconfiguration_unavailable');
        const result = await providerRuntime.reconfigure(request?.params ?? {}, {
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
          ...projectRuntimeHealth(supervisor.health(), runtimeContext, providerToolGateway, requestLifecycle, providerRuntime),
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
      supervisor.core.appendEvent({
        event: 'session_control_accepted',
        request_id: requestId,
        method,
        idempotency_key: idempotencyKey,
        acceptance_state: 'accepted',
        transport: 'jsonl_stdio',
      });
      const result = await supervisor.dispatch(request);
      supervisor.core.appendEvent({
        event: 'session_control_response',
        request_id: requestId,
        method,
        idempotency_key: idempotencyKey,
        terminal_state: result?.terminal_state ?? 'completed',
      });
      requestState.transition('completed', { terminal_state: result?.terminal_state ?? 'completed' });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
    const initialIntelligence = currentIntelligenceSnapshot(providerRuntime, runtimeContext);
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
      provider: initialIntelligence.provider ?? runtimeContext.intelligenceProvider ?? null,
      model: initialIntelligence.model ?? runtimeContext.providerSettings?.model ?? null,
      thinking: initialIntelligence.thinking ?? runtimeContext.providerSettings?.thinking ?? null,
      mcp_scope: runtimeContext.mcpScope ?? 'none',
      mcp_server_count: runtimeContext.mcpScope === 'none' ? 0 : null,
      mcp_operational_state: runtimeContext.mcpScope === 'none' ? 'disabled' : 'starting',
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
      writeRuntimeHeartbeat(runtimeContext, { reason: 'session_started', now: now() });
      if (heartbeatCadenceMs > 0) {
        heartbeatTimer = setInterval(() => {
          try {
            writeRuntimeHeartbeat(runtimeContext, { now: now() });
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
    providerRuntime,
    requestLifecycle,
    run,
  });
}
