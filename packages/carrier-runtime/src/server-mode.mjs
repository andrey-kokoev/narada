import { buildNarsAttachCommands } from '@narada2/nars-client-projection-contract';
import {
  classifyCarrierControlRequest,
  isNarsRuntimeEventKind,
  normalizeNarsRuntimeEventKind,
} from '@narada2/carrier-protocol';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCarrierRuntimeContext } from './carrier-runtime-context.mjs';
import { createInputQueue } from './input-queue.mjs';
import { markNarsSessionIndexClosed, writeNarsSessionStartedIndex } from './nars-session-index.mjs';
import {
  operatorInputQueueStatePathFromSessionPath,
  readOperatorInputQueueState,
  writeOperatorInputQueueState,
} from './operator-input-queue-state.mjs';
import {
  authorityTransitionSourceStateSnapshot,
  authorityTransitionStatePathFromSessionPath,
  readAuthorityTransitionSourceState,
} from './authority-transition-state.mjs';
import { mcpToolCatalogEntries as defaultMcpToolCatalogEntries } from './session-status-snapshots.mjs';
import { buildMcpSurfaceAffordanceProjection } from './surface-affordances.mjs';

export async function runCarrierServerMode({
  input = process.stdin,
  output = process.stdout,
  callChatApiFn,
  config,
  runtimeContext,
  dependencies,
} = {}) {
  const ctx = createCarrierRuntimeContext(runtimeContext ?? config);
  const {
    identity,
    session,
    siteId,
    siteRoot,
    siteConfig,
    sessionPath,
    eventsPath,
    intelligenceProvider,
    narsDelegatedAuthorityHandoff = null,
    displaySettings = {},
    providerSettings = {},
    operationHeartbeatDirectiveEnabled = false,
    operationHeartbeatDirectiveIntervalMs,
    operationHeartbeatDirectiveInitialDelayMs,
    healthUrl = null,
    eventStreamUrl = null,
    operatorSurfaceKind = 'agent-cli',
    authorityRuntimeHost = 'local',
  } = ctx;
  const launchOperatorSurfaceKind = operatorSurfaceKind || 'agent-cli';
  const {
    discoverAndStartMcpServers,
    applyWorkerMcpProjection = (mcpServers) => mcpServers,
    aggregateTools,
    createMcpStatusSnapshot,
    readMcpPreflightArtifact,
    createMcpPreflightArtifactSnapshot,
    loadRolePrompt,
    loadSession,
    runServerInputEvent,
    emitServerEvent,
    recordMcpPreflightArtifactLinkage,
    recordMcpStartupFailures,
    createOperationHeartbeatDirectiveEmitter,
    handleServerRequestLine,
    closeMcpServers,
    recordSessionRequestIssue = () => {},
    noteSessionActivity,
    createSessionActivitySnapshot,
    createOperationalPostureSnapshot,
    mcpServerSummaryEntries,
    mcpToolCatalogEntries = defaultMcpToolCatalogEntries,
    normalizeCarrierGoalState,
    carrierGoalStatusLabel,
    recordCarrierDiagnostic = () => {},
    appendSessionRecord = () => {},
    sessionEventEntry = (event, payload) => ({ event, ...payload }),
    carrierSessionEventEntry = (event_kind, payload) => ({ event_kind, payload }),
    classifyInputRuntimeQueueAdmission = () => ({ queue_events: [] }),
    classifyInputRuntimeAdmission = () => ({ admission_events: [] }),
    onOperationHeartbeatDirectiveStarted = () => {},
    onOperationHeartbeatDirectiveStopped = () => {},
  } = dependencies ?? {};

  const mcpServers = applyWorkerMcpProjection(await discoverAndStartMcpServers(siteRoot));
  const allTools = aggregateTools(mcpServers);
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  const surfaceAffordances = buildMcpSurfaceAffordanceProjection(mcpServers);
  const mcpPreflightArtifact = readMcpPreflightArtifact();
  const mcpPreflightSnapshot = createMcpPreflightArtifactSnapshot(mcpPreflightArtifact);
  const rolePrompt = loadRolePrompt(identity, siteRoot);
  const authorityTransitionStatePath = authorityTransitionStatePathFromSessionPath(sessionPath);
  const state = {
    activeTurn: null,
    sessionPath,
    authorityTransitionStatePath,
    authorityTransition: readAuthorityTransitionSourceState(authorityTransitionStatePath),
    closed: false,
    displaySettings: { ...displaySettings },
    sessionSettings: { ...providerSettings },
    pendingRequests: new Set(),
    startedAt: new Date().toISOString(),
    sessionEventCount: 0,
    lastEventKind: null,
    lastEventAt: null,
    lastTerminalState: null,
    requestIssueCounts: {},
    requestOutcomeCounts: {},
  };
  let messages = messagesWithRolePrompt(loadSession(sessionPath), rolePrompt);

  const emit = (event, payload = {}) => {
    if (event === 'error' && payload?.code) recordSessionRequestIssue(state, payload.code);
    const lifecycleEvent = normalizeNarsRuntimeEventKind(event);
    const envelope = {
      event,
      ...(isNarsRuntimeEventKind(lifecycleEvent) ? { lifecycle_event: lifecycleEvent } : {}),
      agent_id: identity,
      session_id: session,
      timestamp: new Date().toISOString(),
      ...payload,
    };
    const result = emitServerEvent(output, envelope);
    if (event === 'session_started') {
      writeNarsSessionStartedIndex({ sessionStartedEvent: envelope, sessionPath, siteRoot });
    } else if (event === 'session_closed') {
      markNarsSessionIndexClosed({
        sessionPath,
        siteRoot,
        terminalState: envelope.terminal_state ?? 'closed',
        terminalReason: 'session_closed',
        closedAt: envelope.timestamp,
      });
    }
    return result;
  };

  const queueStatePath = operatorInputQueueStatePathFromSessionPath(sessionPath);
  const queueState = readOperatorInputQueueState(queueStatePath);
  state.operatorInputQueueStatePath = queueStatePath;
  const appendQueueSessionRecord = (entry) => {
    appendSessionRecord(entry);
    if (entry?.event) {
      emit(entry.event, entry);
      return;
    }
    if (entry?.event_kind) {
      emit(entry.event_kind, entry.payload ?? {});
    }
  };
  state.inputQueue = createInputQueue({
    initialPending: queueState.pending,
    drain: (event) => {
      const requestId = event.request_id ?? event.event_id;
      if (state.closed) {
        noteSessionActivity(state, 'input_rejected_closed');
        emit('error', {
          request_id: requestId,
          code: 'session_closed',
          message: 'Session is closed.',
        });
        return { terminal_state: 'rejected' };
      }
      return runServerInputEvent({
        requestId,
        state,
        messages,
        allTools,
        mcpServers,
        emit,
        callChatApiFn,
        input: event,
        directiveId: event.directive_id ?? null,
        identity,
        session,
        siteRoot,
        sessionPath,
        providerSettings: state.sessionSettings,
      });
    },
    appendSessionFn: appendQueueSessionRecord,
    sessionEventEntryFn: sessionEventEntry,
    carrierSessionEventEntryFn: carrierSessionEventEntry,
    noteSessionActivityFn: noteSessionActivity,
    classifyInputRuntimeQueueAdmissionFn: classifyInputRuntimeQueueAdmission,
    classifyInputRuntimeAdmissionFn: classifyInputRuntimeAdmission,
    onQueueStateChangedFn: ({ pending, transition, event }) => {
      const previous = readOperatorInputQueueState(queueStatePath);
      writeOperatorInputQueueState(queueStatePath, {
        revision: previous.revision,
        pending,
        last_transition: {
          transition,
          input_event_id: event?.event_id ?? null,
          occurred_at: new Date().toISOString(),
        },
      });
    },
  });
  if (queueStatePath && !queueState.corrupt && queueState.pending_count === 0) {
    writeOperatorInputQueueState(queueStatePath, { revision: queueState.revision, pending: [] });
  }

  noteSessionActivity(state, 'session_started', state.startedAt);
  const heartbeat = startCarrierHeartbeat({
    path: sessionPath ? join(dirname(sessionPath), 'heartbeat.json') : null,
    session,
    identity,
    runtime: 'narada-agent-runtime-server',
    carrier_kind: launchOperatorSurfaceKind,
    launch_operator_surface_kind: launchOperatorSurfaceKind,
    operator_surface_kind: launchOperatorSurfaceKind,
    mode: 'server',
    sessionDir: sessionPath ? dirname(sessionPath) : null,
  });

  emit('session_started', {
    transport: 'jsonl_stdio',
    runtime_session_id: session,
    nars_session_id: session,
    runtime: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    carrier_kind: launchOperatorSurfaceKind,
    launch_operator_surface_kind: launchOperatorSurfaceKind,
    operator_surface_kind: launchOperatorSurfaceKind,
    mode: 'server',
    site_id: siteId,
    site_root: siteRoot,
    site_config: siteConfig,
    authority_runtime_host: authorityRuntimeHost,
    provider: intelligenceProvider,
    model: state.sessionSettings.model,
    thinking: state.sessionSettings.thinking,
    stream: state.sessionSettings.stream,
    goal: normalizeCarrierGoalState(state.sessionSettings.goal).value || null,
    goal_display: carrierGoalStatusLabel(state.sessionSettings.goal),
    mcp_server_count: Object.keys(mcpServers).length,
    ...mcpStatus,
    ...mcpPreflightSnapshot,
    ...createSessionActivitySnapshot(state),
    ...createOperationalPostureSnapshot({ state, mcpOperationalState: mcpStatus.mcp_operational_state }),
    authority_transition_state: state.authorityTransition.authority_transition_state,
    source_write_admission: state.authorityTransition.source_write_admission,
    authority_transition: authorityTransitionSourceStateSnapshot(state.authorityTransition),
    authority_transition_target: {
      target_write_admission: state.authorityTransition.target_write_admission,
      target_first_sequence: state.authorityTransition.target_first_sequence ?? null,
      activation_id: state.authorityTransition.activation_id ?? null,
    },
    tool_count: allTools.length,
    mcp_tools: mcpToolCatalogEntries(mcpServers),
    mcp_servers: mcpServerSummaryEntries(mcpServers),
    surface_affordances: surfaceAffordances,
    tool_outputs: displaySettings.toolOutputs ? 'shown' : 'hidden',
    approvals: 'disabled',
    help: '/help',
    health_endpoint: healthUrl,
    event_endpoint: eventStreamUrl,
    websocket_endpoint: eventStreamUrl,
    attach_commands: buildNarsAttachCommands({ eventEndpoint: eventStreamUrl, healthEndpoint: healthUrl }),
    delegated_authority_handoff: narsDelegatedAuthorityHandoff,
    delegated_authority_ref: narsDelegatedAuthorityHandoff?.authority_ref ?? null,
    session_path: sessionPath,
    events_path: eventsPath,
  });
  if (state.inputQueue.pendingCount > 0) {
    const restoredDrain = state.inputQueue.drainUntilIdle().catch((error) => {
      emit('error', {
        code: 'operator_input_queue_restore_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    state.pendingRequests.add(restoredDrain);
    restoredDrain.finally(() => state.pendingRequests.delete(restoredDrain));
  }
  recordMcpPreflightArtifactLinkage({ emit, preflightArtifact: mcpPreflightArtifact });
  recordMcpStartupFailures(mcpServers, { emit });

  let activeOperationHeartbeatDirectiveEmitter = null;
  if (operationHeartbeatDirectiveEnabled) {
    activeOperationHeartbeatDirectiveEmitter = createOperationHeartbeatDirectiveEmitter({
      inputQueue: state.inputQueue,
      intervalMs: operationHeartbeatDirectiveIntervalMs,
      initialDelayMs: operationHeartbeatDirectiveInitialDelayMs,
    }).start();
    onOperationHeartbeatDirectiveStarted(activeOperationHeartbeatDirectiveEmitter);
  }

  input.setEncoding('utf8');
  let buffer = '';
  let orderedServerRequests = Promise.resolve();
  let orderedServerRequestActive = false;
  const dispatchRequestLine = (line) => {
    const runRequest = () => handleServerRequestLine(line, {
      state,
      messages,
      allTools,
      mcpServers,
      mcpPreflightArtifact,
      emit,
      callChatApiFn,
      activeOperationHeartbeatDirectiveEmitter,
      recordCarrierDiagnostic,
    });
    let pending;
    if (isConcurrentServerRequestLine(line)) {
      pending = runRequest();
    } else {
      const runOrderedRequest = async () => {
        orderedServerRequestActive = true;
        try {
          return await runRequest();
        } finally {
          orderedServerRequestActive = false;
        }
      };
      pending = orderedServerRequestActive
        ? (orderedServerRequests = orderedServerRequests.then(runOrderedRequest, runOrderedRequest))
        : (orderedServerRequests = runOrderedRequest());
    }
    const tracked = pending
      .catch((error) => {
        emit('error', {
          request_id: null,
          code: 'request_dispatch_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    state.pendingRequests.add(tracked);
    tracked.finally(() => {
      state.pendingRequests.delete(tracked);
    });
    return tracked;
  };
  for await (const chunk of input) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      dispatchRequestLine(line);
    }
    if (state.closed) break;
  }
  if (!state.closed && buffer.trim()) {
    dispatchRequestLine(buffer);
  }
  await Promise.allSettled([...state.pendingRequests]);
  activeOperationHeartbeatDirectiveEmitter?.stop?.();
  onOperationHeartbeatDirectiveStopped();
  heartbeat.stop?.('closed');
  markNarsSessionIndexClosed({
    sessionPath,
    siteRoot,
    terminalState: 'closed',
    terminalReason: state.lastTerminalState === 'closed' ? 'session_closed' : 'runtime_process_exit',
    closedAt: new Date().toISOString(),
  });
  closeMcpServers(mcpServers);
}

function messagesWithRolePrompt(messages, rolePrompt) {
  if (!rolePrompt) return messages;
  const history = messages[0]?.role === 'system' ? messages.slice(1) : messages;
  return [{ role: 'system', content: rolePrompt }, ...history];
}

function startCarrierHeartbeat({ path, session, identity, runtime, carrier_kind, launch_operator_surface_kind, operator_surface_kind, mode, sessionDir, intervalMs = 5000 } = {}) {
  if (!path) return { stop() {} };
  const startedAt = new Date().toISOString();
  const write = (status = 'alive') => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      schema: 'narada.carrier_heartbeat.v1',
      status,
      session_id: session,
      runtime_session_id: session,
      nars_session_id: session,
      carrier_session_id: session,
      agent_id: identity,
      runtime,
      runtime_substrate_kind: runtime,
      carrier_kind,
      launch_operator_surface_kind,
      operator_surface_kind,
      mode,
      pid: process.pid,
      session_dir: sessionDir,
      carrier_session_dir: sessionDir,
      started_at: startedAt,
      heartbeat_at: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8');
  };
  write();
  const timer = setInterval(() => write(), intervalMs);
  timer.unref?.();
  return {
    stop(status = 'closed') {
      clearInterval(timer);
      write(status);
    },
  };
}

export function isConcurrentServerRequestLine(line) {
  try {
    const request = JSON.parse(line);
    if (request?.method === 'conversation.interrupt') return true;
    if (request?.method === 'session.health') return true;
    if (request?.method === 'session.events.subscribe') return true;
    if (request?.method === 'session.sop.summary') return true;
    if (request?.method === 'session.surface.affordances') return true;
    if (request?.method === 'session.operations') return false;
    if (request?.method === 'session.recovery') return false;
    if (request?.method === 'session.sync') return false;
    if (request?.method === 'preflight.recovery') return false;
    return classifyCarrierControlRequest(request).concurrent_allowed;
  } catch {
    return false;
  }
}
