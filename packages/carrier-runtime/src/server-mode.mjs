import {
  classifyCarrierControlRequest,
  isNarsRuntimeEventKind,
  normalizeNarsRuntimeEventKind,
} from '../../carrier-protocol/src/carrier-protocol.mjs';

export async function runCarrierServerMode({
  input = process.stdin,
  output = process.stdout,
  callChatApiFn,
  config,
  dependencies,
} = {}) {
  const {
    identity,
    session,
    siteRoot,
    sessionPath,
    eventsPath,
    intelligenceProvider,
    narsDelegatedAuthorityHandoff = null,
    transcriptDisplaySettings = {},
    sessionSettings = {},
    operationHeartbeatDirectiveEnabled = false,
    operationHeartbeatDirectiveIntervalMs,
    operationHeartbeatDirectiveInitialDelayMs,
    healthUrl = null,
    eventStreamUrl = null,
  } = config ?? {};
  const {
    discoverAndStartMcpServers,
    aggregateTools,
    createMcpStatusSnapshot,
    readMcpPreflightArtifact,
    createMcpPreflightArtifactSnapshot,
    loadRolePrompt,
    loadSession,
    createInputQueue,
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
    normalizeCarrierGoalState,
    carrierGoalStatusLabel,
    recordCarrierDiagnostic = () => {},
    onOperationHeartbeatDirectiveStarted = () => {},
    onOperationHeartbeatDirectiveStopped = () => {},
  } = dependencies ?? {};

  const mcpServers = await discoverAndStartMcpServers(siteRoot);
  const allTools = aggregateTools(mcpServers);
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  const mcpPreflightArtifact = readMcpPreflightArtifact();
  const mcpPreflightSnapshot = createMcpPreflightArtifactSnapshot(mcpPreflightArtifact);
  const rolePrompt = loadRolePrompt(identity, siteRoot);
  const state = {
    activeTurn: null,
    closed: false,
    displaySettings: { ...transcriptDisplaySettings },
    sessionSettings: { ...sessionSettings },
    pendingRequests: new Set(),
    startedAt: new Date().toISOString(),
    sessionEventCount: 0,
    lastEventKind: null,
    lastEventAt: null,
    lastTerminalState: null,
    requestIssueCounts: {},
    requestOutcomeCounts: {},
  };
  let messages = loadSession(sessionPath);
  if (messages.length === 0 && rolePrompt) {
    messages.push({ role: 'system', content: rolePrompt });
  }

  const emit = (event, payload = {}) => {
    if (event === 'error' && payload?.code) recordSessionRequestIssue(state, payload.code);
    const lifecycleEvent = normalizeNarsRuntimeEventKind(event);
    return emitServerEvent(output, {
      event,
      ...(isNarsRuntimeEventKind(lifecycleEvent) ? { lifecycle_event: lifecycleEvent } : {}),
      agent_id: identity,
      session_id: session,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  };

  state.inputQueue = createInputQueue({
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
      });
    },
  });

  noteSessionActivity(state, 'session_started', state.startedAt);

  emit('session_started', {
    transport: 'jsonl_stdio',
    site_root: siteRoot,
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
    tool_count: allTools.length,
    mcp_servers: mcpServerSummaryEntries(mcpServers),
    tool_outputs: transcriptDisplaySettings.toolOutputs ? 'shown' : 'hidden',
    approvals: 'disabled',
    help: '/help',
    health_endpoint: healthUrl,
    event_endpoint: eventStreamUrl,
    websocket_endpoint: eventStreamUrl,
    delegated_authority_handoff: narsDelegatedAuthorityHandoff,
    delegated_authority_ref: narsDelegatedAuthorityHandoff?.authority_ref ?? null,
    session_path: sessionPath,
    events_path: eventsPath,
  });
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
  closeMcpServers(mcpServers);
}

export function isConcurrentServerRequestLine(line) {
  try {
    const request = JSON.parse(line);
    if (request?.method === 'conversation.interrupt') return true;
    if (request?.method === 'session.health') return true;
    if (request?.method === 'session.events.subscribe') return true;
    if (request?.method === 'session.operations') return false;
    if (request?.method === 'session.recovery') return false;
    if (request?.method === 'session.sync') return false;
    if (request?.method === 'preflight.recovery') return false;
    return classifyCarrierControlRequest(request).concurrent_allowed;
  } catch {
    return false;
  }
}
