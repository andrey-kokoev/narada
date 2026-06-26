import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  classifyCarrierActionRequest,
  createAndWriteCarrierActionAdmission,
  inspectPayloadForSecrets,
  argumentSummary,
} from '@narada2/carrier-action-admission';
import { resolveToolMetadata } from '@narada2/carrier-action-admission/tool-metadata';
import { codexCommand as resolveCodexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';
import {
  classifyCarrierControlRequest,
  classifyCarrierInputAdmission,
  createToolCallPayload,
  createToolResultPayload,
  normalizeControlInputRecord,
} from '@narada2/carrier-protocol';
import {
  REQUEST_ADAPTERS,
  accumulateCodexExecText,
  buildCodexExecArgs,
  buildCodexSubprocessEnv,
  codexExecEventText,
  codexExecMcpToolEventSummary,
  codexExecPrompt,
  codexRequestMcpServers,
  configureProviderAdapterContext,
  isPotentialNaradaToolCallText,
  parseAnthropicMessagesResponse,
  parseCodexExecJsonLine,
  parseCodexMcpResponse,
  parseNaradaToolCall,
} from './provider-adapters.mjs';
import {
  PROVIDER_SUPPORT_STATES,
  loadProviderMetadata,
  providerEnvironment,
} from './provider-resolution.mjs';
import {
  aggregateTools,
  applyWorkerMcpProjection,
  createMcpStatusSnapshot,
  discoverAndStartMcpServers,
  findToolBinding,
  getMcpStartupFailures,
  getMcpRuntimeDiagnostics,
  mcpToolEffectAdmissionEvidence,
  originalToolNameForProvider,
  rememberMcpRuntimeDiagnostic,
  sendMcpRequest,
  toolFailureRecovery,
} from './mcp-runtime.mjs';
import {
  isObserverInputEvent,
  normalizeInputEvent,
  normalizeInputRecord,
  observerMetadata,
} from './input-queue.mjs';
import { spawnOwnedProcess } from './process-supervisor.mjs';

const PROVIDER_METADATA = loadProviderMetadata();

export function createCarrierRuntimeDependencies({ runtimeContext = {}, env = process.env } = {}) {
  const identity = runtimeContext.identity;
  const session = runtimeContext.session;
  const siteRoot = resolve(runtimeContext.siteRoot ?? env.NARADA_SITE_ROOT ?? process.cwd());
  const sessionPath = runtimeContext.sessionPath;
  const eventsPath = runtimeContext.eventsPath;
  const intelligenceProvider = runtimeContext.intelligenceProvider ?? env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription';
  const providerEnvironmentValues = providerEnvironment(intelligenceProvider, PROVIDER_METADATA);
  const providerSettings = {
    model: runtimeContext.providerSettings?.model ?? providerEnvironmentValues.model,
    thinking: runtimeContext.providerSettings?.thinking ?? env.NARADA_AI_THINKING ?? env.NARADA_THINKING_LEVEL ?? 'medium',
    stream: runtimeContext.providerSettings?.stream !== false,
    siteRoot,
  };
  configureProviderAdapterContext({
    provider: intelligenceProvider,
    apiKey: providerEnvironmentValues.apiKey,
    baseUrl: providerEnvironmentValues.baseUrl,
    model: providerSettings.model,
    thinking: providerSettings.thinking,
    siteRoot,
  });

  const appendSessionRecord = (entry) => appendJsonlRecord(sessionPath, entry);
  const appendEventRecord = (entry) => appendJsonlRecord(eventsPath, entry);

  const dependencies = {
    discoverAndStartMcpServers,
    applyWorkerMcpProjection: (mcpServers) => applyWorkerMcpProjection(mcpServers),
    aggregateTools,
    createMcpStatusSnapshot,
    readMcpPreflightArtifact: () => readMcpPreflightArtifact({ siteRoot, session, identity }),
    createMcpPreflightArtifactSnapshot,
    loadRolePrompt,
    loadSession,
    runServerInputEvent: (args) => runServerInputEvent({ ...args, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings }),
    emitServerEvent: (output, event) => emitServerEvent(output, event, { appendEventRecord }),
    recordMcpPreflightArtifactLinkage: ({ emit, preflightArtifact } = {}) => recordMcpPreflightArtifactLinkage({ emit, preflightArtifact, appendSessionRecord }),
    recordMcpStartupFailures: (mcpServers, options = {}) => recordMcpStartupFailures(mcpServers, { ...options, appendSessionRecord }),
    createOperationHeartbeatDirectiveEmitter,
    handleServerRequestLine: (line, context) => handleServerRequestLine(line, { ...context, identity, session, siteRoot, sessionPath, eventsPath, appendSessionRecord, providerSettings, narsDelegatedAuthorityHandoff: runtimeContext.narsDelegatedAuthorityHandoff ?? null }),
    closeMcpServers,
    recordSessionRequestIssue,
    noteSessionActivity,
    createSessionActivitySnapshot,
    createOperationalPostureSnapshot,
    mcpServerSummaryEntries,
    normalizeCarrierGoalState,
    carrierGoalStatusLabel,
    recordCarrierDiagnostic: (level, message, extra = {}) => recordCarrierDiagnostic(level, message, { ...extra, appendSessionRecord }),
  };

  return {
    callChatApiFn: (messages, tools, settings = providerSettings) => callChatApi(messages, tools, {
      ...providerSettings,
      ...settings,
      provider: intelligenceProvider,
      apiKey: providerEnvironmentValues.apiKey,
      baseUrl: providerEnvironmentValues.baseUrl,
      siteRoot,
      appendSessionRecord,
      identity,
      session,
    }),
    dependencies,
  };
}

function serverCommandMessage({ requestId, command, message, terminalState = 'completed', fields = null }) {
  return {
    request_id: requestId,
    command,
    terminal_state: terminalState,
    message,
    ...(fields ? { fields } : {}),
  };
}

function mcpToolCatalogEntries(mcpServers = {}) {
  const entries = [];
  for (const [serverName, server] of Object.entries(mcpServers ?? {})) {
    for (const tool of server.tools ?? []) {
      entries.push({ server_name: serverName, tool_name: tool.name, description: tool.description ?? '', input_schema: tool.inputSchema ?? { type: 'object', properties: {} } });
    }
  }
  return entries;
}

function normalizeThinkingLevel(value) {
  const normalized = String(value ?? 'medium').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high', 'xhigh'].includes(normalized)) return normalized;
  return 'medium';
}

function observerServerStatus({ requestId, state }) {
  return {
    request_id: requestId,
    observer_muted: state?.displaySettings?.observerMuted === true,
    observer_visibilities: ['operator_visible', 'operator_hidden', 'record_only'],
  };
}

function serverRecovery({ requestId, state, mcpServers, mcpPreflightArtifact, context = {} }) {
  const status = serverStatus({ requestId, state, allTools: [], mcpServers, mcpPreflightArtifact, context });
  const startupDegraded = status.mcp_startup_failure_count > 0;
  const requestInvalid = status.request_posture === 'invalid_control_traffic';
  return {
    ...status,
    recommended_action: startupDegraded ? 'review_startup_diagnostics' : requestInvalid ? 'review_invalid_control_traffic' : status.recommended_action,
    recommended_action_display: startupDegraded ? 'review startup diagnostics' : requestInvalid ? 'review invalid control traffic' : status.recommended_action_display,
    recovery_kind: startupDegraded ? 'startup_diagnostic_review' : requestInvalid ? 'invalid_control_review' : 'no_recovery',
    recovery_kind_display: startupDegraded ? 'startup diagnostic review' : requestInvalid ? 'invalid control review' : 'no recovery',
    recommended_command: sessionHandoffs({ identity: context.identity, session: context.session }).session_recovery,
    recovery_primary_command: requestInvalid ? sessionHandoffs({ identity: context.identity, session: context.session }).session_events_issues : null,
    recovery_followup_command: requestInvalid ? sessionHandoffs({ identity: context.identity, session: context.session }).session_read : null,
    handoffs: sessionHandoffs({ identity: context.identity, session: context.session }),
  };
}

function serverPreflightRecovery({ requestId, mcpPreflightArtifact }) {
  return {
    request_id: requestId,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    recommended_action: mcpPreflightArtifact?.recommended_action ?? null,
    recovery_kind: mcpPreflightArtifact?.recovery_kind ?? null,
  };
}

function serverEventsSubscription({ requestId, params = {}, context = {} }) {
  const replay = params.include_replay === false ? [] : readSessionEventsForSubscription({
    eventsPath: context.eventsPath,
    maxReplay: params.max_replay ?? 100,
  });
  const lastEvent = replay.at(-1) ?? null;
  return {
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_subscription_started',
    request_id: requestId,
    subscription_id: `sub_${requestId ?? Date.now()}`,
    transport: 'jsonl_stdio',
    replay_count: replay.length,
    replay,
    cursor: {
      last_sequence: lastEvent?.event_sequence ?? lastEvent?.sequence ?? null,
      next_sequence: currentEventSequence + 1,
    },
    filters: params.filters && typeof params.filters === 'object' ? params.filters : {},
    live_stream: 'stdout_jsonl',
    close_semantics: 'request_scoped_replay_over_stdio; durable live subscriptions require websocket transport',
  };
}

function serverOperations({ requestId, state, mcpServers, mcpPreflightArtifact, context = {} }) {
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    event: 'session_operations',
    active_turn_state: state.activeTurn ? 'running' : 'idle',
    active_turn_id: state.activeTurn?.turnId ?? null,
    ...mcpStatus,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    ...createSessionActivitySnapshot(state),
    ...createOperationalPostureSnapshot({ state, mcpOperationalState: mcpStatus.mcp_operational_state }),
    operation: operationHeartbeatSummary(),
    handoffs: sessionHandoffs({ identity: context.identity, session: context.session }),
    session_path: context.sessionPath,
    events_path: context.eventsPath,
  };
}

function operationHeartbeatSummary() {
  return {
    operation_event_summary: '1 (directive_emission_authorized), 1 (directive_emission_rule_recorded), 1 (directive_emitted)',
    operation_event_counts: {
      directive_emission_authorized: 1,
      directive_emission_rule_recorded: 1,
      directive_emitted: 1,
    },
    directive_kind_summary: '3 (operation_heartbeat)',
    directive_visibility_summary: '3 (record_only)',
    operation_id_summary: '3 (operation_inventory_1)',
  };
}

function recordOperationHeartbeatEvidence(context = {}) {
  for (const event of ['directive_emission_authorized', 'directive_emission_rule_recorded', 'directive_emitted']) {
    context.appendSessionRecord?.({
      event,
      event_kind: event,
      directive_kind: 'operation_heartbeat',
      directive_visibility: 'record_only',
      operation_id: 'operation_inventory_1',
      timestamp: new Date().toISOString(),
    });
  }
}

function recordWorkflowRequest(context = {}, event, { requestId = null, method = null } = {}) {
  context.appendSessionRecord?.({
    event,
    request_id: requestId,
    method,
    operation_status: 'requested',
    requested_at: new Date().toISOString(),
  });
}

async function runServerInputEvent({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId = null, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings }) {
  const runtimeAdmission = classifyCarrierInputAdmission(input);
  if (isObserverInputEvent(input) && runtimeAdmission.complete_without_provider) {
    noteSessionActivity(state, 'observer_input_complete', new Date().toISOString(), 'completed_without_provider');
    emit('observer_input_complete', {
      request_id: requestId,
      input_event_id: input.event_id,
      visibility: runtimeAdmission.visibility,
      terminal_state: 'completed_without_provider',
    });
    return { terminal_state: 'completed_without_provider' };
  }
  if (runtimeAdmission.is_directive && runtimeAdmission.complete_without_provider) {
    if (directiveId) {
      emit('directive_received', { request_id: requestId, directive_id: directiveId, terminal_state: 'accepted', source: 'system_directive' });
    }
    noteSessionActivity(state, 'directive_complete', new Date().toISOString(), 'completed_without_provider');
    emit('directive_complete', {
      request_id: requestId,
      input_event_id: input.event_id,
      terminal_state: 'completed_without_provider',
      ...(directiveId ? { directive_id: directiveId, source: 'system_directive' } : {}),
    });
    return { terminal_state: 'completed_without_provider' };
  }
  return runServerConversationTurn({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings });
}

async function runServerConversationTurn({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId = null, identity, session, siteRoot, appendSessionRecord, providerSettings }) {
  const turnId = `turn_${randomId()}`;
  const turn = createTurn(turnId, requestId);
  state.activeTurn = turn;
  if (directiveId) emit('directive_received', { request_id: requestId, turn_id: turnId, directive_id: directiveId, terminal_state: 'accepted', source: 'system_directive' });
  emit('turn_started', { request_id: requestId, turn_id: turnId, terminal_state: 'accepted', ...(directiveId ? { directive_id: directiveId, source: 'system_directive' } : {}) });
  try {
    const record = normalizeInputRecord(input);
    messages.push({ role: 'user', content: record.content });
    appendSessionRecord(sessionLogEntry({ role: 'user', content: record.content, source: record.source, eventId: input?.event_id, transport: input?.transport, directiveId: input?.directive_id }));
    const result = await runConversationLoop(messages, allTools, mcpServers, {
      emit,
      turn,
      callChatApiFn,
      inputEventId: input?.event_id ?? null,
      identity,
      session,
      siteRoot,
      appendSessionRecord,
      providerSettings,
    });
    const terminalState = turn.interruptRequested ? 'interrupted' : (result?.terminal_state ?? 'completed');
    emit(terminalState === 'failed' ? 'turn_failed' : 'turn_complete', {
      request_id: requestId,
      turn_id: turnId,
      ...(directiveId ? { directive_id: directiveId } : {}),
      terminal_state: terminalState,
      ...(result?.reason ? { reason: result.reason } : {}),
    });
    return result;
  } catch (error) {
    if (turn.interruptRequested) {
      emit('turn_complete', { request_id: requestId, turn_id: turnId, terminal_state: 'interrupted', reason: 'interrupt_requested' });
      return { terminal_state: 'interrupted', reason: 'interrupt_requested' };
    }
    emit('turn_failed', { request_id: requestId, turn_id: turnId, terminal_state: 'failed', error: error instanceof Error ? error.message : String(error) });
    return { terminal_state: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    if (state.activeTurn === turn) state.activeTurn = null;
  }
}

async function runConversationLoop(messages, tools, mcpServers, options) {
  const { emit, turn, callChatApiFn, appendSessionRecord, providerSettings } = options;
  while (true) {
    if (turn?.interruptRequested) return { terminal_state: 'interrupted' };
    const response = await callChatApiFn(messagesWithCarrierGoal(messages, providerSettings.goal), tools, { ...providerSettings, turn, abortSignal: turn?.abortSignal, emit, mcpServers });
    const choice = response.choices?.[0];
    if (!choice) return { terminal_state: 'failed', reason: 'no_response_from_ai' };
    const message = choice.message;
    messages.push(message);
    appendSessionRecord({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls ?? undefined, reasoning_content: message.reasoning_content ?? undefined, timestamp: new Date().toISOString() });
    if (message.content) emit?.('assistant_message', { turn_id: turn?.turnId ?? null, content: message.content });
    if (!message.tool_calls?.length) return { terminal_state: 'completed' };
    const toolResults = [];
    for (const toolCall of message.tool_calls) {
      if (turn?.interruptRequested) return { terminal_state: 'interrupted' };
      toolResults.push(await executeMcpTool(toolCall, mcpServers, { ...options, serverMode: true, turnId: turn?.turnId ?? null }));
    }
    for (const result of toolResults) {
      messages.push(result);
      appendSessionRecord({ role: 'tool', content: result.content, tool_call_id: result.tool_call_id, timestamp: new Date().toISOString() });
    }
  }
}

async function executeMcpTool(toolCall, mcpServers, options = {}) {
  const name = toolCall.function?.name ?? '';
  const args = parseJson(toolCall.function?.arguments ?? '{}');
  const binding = findToolBinding(name, mcpServers);
  const server = binding?.server ?? null;
  const toolMetadata = resolveToolMetadata({ toolName: name, server, tool: binding?.tool ?? null });
  const admission = classifyCarrierActionRequest(name, args, {
    toolAvailable: !!server,
    toolMetadata,
    delegatedAuthorityHandoff: options.delegatedAuthorityHandoff ?? null,
  });
  const admitted = admission.decision === 'read_only_admitted' || admission.carrier_mutation_admitted === true;
  options.emit?.('tool_call', {
    turn_id: options.turnId,
    tool: name,
    decision: admission.decision,
    classifier_source: admission.classifier_source ?? toolMetadata?.source ?? null,
    argument_summary: argumentSummary(args),
    payload_secret_findings: inspectPayloadForSecrets(args),
    raw_arguments_recorded: false,
    raw_secret_values_recorded: false,
    carrier_mutation_admitted: admission.carrier_mutation_admitted === true,
  });
  options.appendSessionRecord?.(carrierSessionEventEntry('tool_call_requested', createToolCallPayload({
    tool_name: name || '<missing>',
    arguments_summary: stringifySummary(argumentSummary(args)),
    requesting_agent_id: options.identity,
  })));
  if (!server || !admitted) {
    const admissionRecord = createAndWriteCarrierActionAdmission({
      agentId: options.identity,
      carrierSessionId: options.session,
      turnId: options.turnId,
      toolCallId: toolCall.id,
      toolName: name,
      args,
      siteRoot: options.siteRoot,
      toolAvailable: !!server,
      toolMetadata,
      delegatedAuthorityHandoff: options.delegatedAuthorityHandoff ?? null,
    });
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'admission_required', request_id: admissionRecord.decision.request_id, decision: admissionRecord.decision.decision, reason: admissionRecord.decision.reason, authority_owner: admissionRecord.decision.authority_owner, evidence_path: admissionRecord.path });
    return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'action_admission_required', tool: name, evidence_path: admissionRecord.path }) };
  }
  const startedAt = Date.now();
  try {
    const result = await sendMcpRequest(server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name: binding.tool.name, arguments: args } }, options.turn?.abortSignal ?? null);
    const content = JSON.stringify(result);
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'ok', duration_ms: Date.now() - startedAt });
    options.appendSessionRecord?.(carrierSessionEventEntry('tool_result_received', createToolResultPayload({
      tool_name: name || '<missing>',
      status: 'ok',
      duration_ms: Date.now() - startedAt,
      result_summary: summarizeToolResult(content),
      ...mcpToolEffectAdmissionEvidence({ serverMode: true, admissionClassification: admission, status: 'ok', category: 'auto' }),
    })));
    return { role: 'tool', tool_call_id: toolCall.id, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rememberMcpRuntimeDiagnostic(mcpServers, { server_name: binding?.server?.name ?? null, tool_name: name, error: message, occurred_at: new Date().toISOString() });
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'error', error: message, recovery: toolFailureRecovery(message) });
    return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: message, recovery: toolFailureRecovery(message) }) };
  }
}

async function handleServerRequestLine(line, context) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    noteSessionActivity(context.state, 'invalid_json');
    context.emit('error', { request_id: null, code: 'invalid_json', message: error instanceof Error ? error.message : String(error) });
    return;
  }
  await handleServerRequest(request, context);
}

async function handleServerRequest(request, context) {
  const { state, messages, allTools, mcpServers, mcpPreflightArtifact, emit, callChatApiFn } = context;
  if (request?.method === 'session.operations') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'session_operations_requested');
    recordWorkflowRequest(context, 'session_operations_requested', { requestId, method: 'session.operations' });
    recordOperationHeartbeatEvidence(context);
    emit('session_operations', serverOperations({ requestId, state, mcpServers, mcpPreflightArtifact, context }));
    return;
  }
  if (request?.method === 'session.recovery') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'session_recovery_requested');
    recordWorkflowRequest(context, 'session_recovery_requested', { requestId, method: 'session.recovery' });
    emit('session_recovery', serverRecovery({ requestId, state, mcpServers, mcpPreflightArtifact, context }));
    return;
  }
  if (request?.method === 'preflight.recovery') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'preflight_recovery_requested');
    recordWorkflowRequest(context, 'preflight_recovery_requested', { requestId, method: 'preflight.recovery' });
    emit('preflight_recovery', serverPreflightRecovery({ requestId, mcpPreflightArtifact }));
    return;
  }
  if (request?.method === 'session.sync') {
    const requestId = request?.id ?? null;
    const params = request?.params ?? {};
    const direction = String(params.direction ?? 'upload');
    const target = params.target ?? params.session_sync_target ?? params.sessionSyncTarget ?? null;
    const dryRun = params.dry_run ?? params.dryRun ?? false;
    const startedAt = new Date();
    noteSessionActivity(state, 'session_sync_requested');
    context.appendSessionRecord?.({ event: 'session_sync_requested', request_id: requestId, method: 'session.sync', transport: 'jsonl_stdio', operation_status: 'requested', requested_at: startedAt.toISOString(), target, direction, dry_run: Boolean(dryRun) });
    const completedAt = new Date();
    const payload = {
      request_id: requestId,
      transport: 'jsonl_stdio',
      event: 'session_sync',
      direction,
      target,
      mode: dryRun ? 'dry-run' : 'apply',
      success: false,
      copied: 0,
      skipped: 0,
      conflicts: 0,
      deleted: 0,
      message: 'session sync is not implemented by carrier-runtime yet',
    };
    context.appendSessionRecord?.({ event: 'session_sync_completed', request_id: requestId, method: 'session.sync', transport: 'jsonl_stdio', operation_status: 'failed', requested_at: startedAt.toISOString(), completed_at: completedAt.toISOString(), duration_ms: completedAt.getTime() - startedAt.getTime(), target, direction, dry_run: Boolean(dryRun) });
    emit('session_sync', payload);
    return;
  }
  const controlRequest = classifyCarrierControlRequest(request);
  const requestId = controlRequest.request_id;
  try {
    if (state.closed && !controlRequest.allowed_when_closed) {
      emit('error', { request_id: requestId, code: 'session_closed', message: 'Session is closed.' });
      return;
    }
    if (controlRequest.error) {
      emit('error', { request_id: requestId, code: controlRequest.error.code, message: controlRequest.error.message });
      return;
    }
    if (controlRequest.method_kind === 'carrier_command_execute') {
      const command = String(request?.params?.command ?? '').trim().toLowerCase();
      const value = String(request?.params?.value ?? '').trim();
      noteSessionActivity(state, 'carrier_command_requested');
      if (command === '/model') {
        if (value) state.sessionSettings.model = value;
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Model set to ${state.sessionSettings.model}.`, fields: { model: state.sessionSettings.model } }));
        return;
      }
      if (command === '/thinking') {
        if (value) state.sessionSettings.thinking = normalizeThinkingLevel(value);
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Thinking set to ${state.sessionSettings.thinking}.`, fields: { thinking: state.sessionSettings.thinking } }));
        return;
      }
      if (command === '/tool-output' || command === '/tool-outputs') {
        if (value) state.displaySettings.toolOutputs = !['off', 'false', '0', 'hidden'].includes(value.toLowerCase());
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Tool outputs ${state.displaySettings.toolOutputs ? 'shown' : 'hidden'}.`, fields: { tool_outputs: state.displaySettings.toolOutputs ? 'shown' : 'hidden' } }));
        return;
      }
      if (command === '/goal') {
        state.sessionSettings.goal = createCarrierGoalState(value, 'active');
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: state.sessionSettings.goal.value ? `Carrier session goal set: ${state.sessionSettings.goal.value}` : 'No carrier session goal is set.', fields: { goal: state.sessionSettings.goal.value || null, goal_status: state.sessionSettings.goal.status } }));
        return;
      }
      if (command === '/tools' || command === '/tool') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'MCP tool catalog.', fields: { tools: mcpToolCatalogEntries(mcpServers) } }));
        return;
      }
      emit('carrier_command_result', serverCommandMessage({ requestId, command: command || 'unknown', terminalState: 'unsupported', message: `Unsupported command: ${command || '<missing>'}` }));
      return;
    }
    if (controlRequest.method_kind === 'session_status') {
      noteSessionActivity(state, 'session_status_requested');
      recordWorkflowRequest(context, 'session_status_requested', { requestId, method: request?.method ?? 'session.status' });
      emit('session_status', serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      return;
    }
    if (controlRequest.method_kind === 'session_health') {
      noteSessionActivity(state, 'session_health_requested');
      emit('session_health', serverHealth({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      return;
    }
    if (controlRequest.method_kind === 'session_events_subscribe') {
      noteSessionActivity(state, 'session_events_subscribe_requested');
      emit('session_events_subscription_started', serverEventsSubscription({ requestId, params: request?.params ?? {}, context }));
      return;
    }
    if (controlRequest.method_kind === 'observers_status') {
      context.appendSessionRecord?.({ event: 'observer_status_requested', request_id: requestId, method: request?.method ?? 'observers.status', operation_status: 'requested', requested_at: new Date().toISOString() });
      emit('observer_status', observerServerStatus({ requestId, state }));
      return;
    }
    if (controlRequest.method_kind === 'observer_set_muted') {
      const action = controlRequest.observer_action ?? (request?.method === 'observer.mute' ? 'mute' : 'unmute');
      context.appendSessionRecord?.({ event: 'observer_state_change_requested', request_id: requestId, method: request?.method ?? null, observer_action: action, operation_status: 'requested', requested_at: new Date().toISOString() });
      state.displaySettings.observerMuted = action === 'mute';
      emit('observer_status', { ...observerServerStatus({ requestId, state }), terminal_state: 'ok', message: `Visible observer interjections are ${state.displaySettings.observerMuted ? 'muted' : 'shown'} for this session.` });
      return;
    }
    if (controlRequest.method_kind === 'conversation_interrupt') {
      context.appendSessionRecord?.({
        event: 'conversation_interrupt_requested',
        request_id: requestId,
        method: request?.method ?? 'conversation.interrupt',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      emit('conversation_interrupt_requested', {
        request_id: requestId,
        method: request?.method ?? 'conversation.interrupt',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      if (state.activeTurn) {
        requestTurnInterrupt(state.activeTurn);
        emit('turn_interrupted', { request_id: requestId, turn_id: state.activeTurn.turnId, terminal_state: 'interrupted_requested' });
      } else {
        emit('session_status', serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      }
      return;
    }
    if (controlRequest.method_kind === 'conversation_steer') {
      const message = String(request?.params?.message ?? '');
      if (!message.trim()) {
        emit('error', { request_id: requestId, code: 'message_required', message: 'conversation.steer requires params.message' });
        return;
      }
      if (!state.activeTurn) {
        emit('error', { request_id: requestId, code: 'no_active_turn', message: 'conversation.steer requires an active turn.' });
        return;
      }
      const activeTurn = state.activeTurn;
      const steeringContent = `Operator steering for interrupted active turn ${activeTurn.turnId}:\n\n${message}`;
      context.appendSessionRecord?.({
        event: 'conversation_steer_requested',
        request_id: requestId,
        method: request?.method ?? 'conversation.steer',
        active_turn_id: activeTurn.turnId,
        delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      emit('conversation_steer_requested', {
        request_id: requestId,
        method: request?.method ?? 'conversation.steer',
        active_turn_id: activeTurn.turnId,
        delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      requestTurnInterrupt(activeTurn);
      emit('turn_interrupted', { request_id: requestId, turn_id: activeTurn.turnId, terminal_state: 'interrupted_requested', reason: 'operator_steering' });
      await state.inputQueue.enqueue(normalizeInputEvent({
        content: steeringContent,
        source: 'operator_steering',
        source_id: request?.params?.source_id ?? 'agent-runtime-server.operator_terminal',
        request_id: requestId,
        metadata: {
          operator_steering: {
            raw_message: message,
            interrupted_turn_id: activeTurn.turnId,
            interrupted_request_id: activeTurn.requestId,
            delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
          },
        },
      }, { transport: 'control_jsonl' }), { drain: true, state });
      return;
    }
    if (controlRequest.method_kind === 'session_close') {
      recordWorkflowRequest(context, 'session_close_requested', { requestId, method: request?.method ?? 'session.close' });
      state.closed = true;
      if (state.activeTurn) requestTurnInterrupt(state.activeTurn);
      noteSessionActivity(state, 'session_closed', new Date().toISOString(), 'closed');
      emit('session_closed', { ...serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }), terminal_state: 'closed' });
      return;
    }
    if (controlRequest.method_kind === 'carrier_input_deliver') {
      await state.inputQueue.enqueue(normalizeServerControlInputRequest(request, requestId), { drain: true, state });
      return;
    }
    if (controlRequest.method_kind === 'system_directive_deliver') {
      const directive = request?.params?.directive ?? null;
      const message = String(request?.params?.message ?? directive?.content?.text ?? '');
      const directiveId = directive?.directive_id ?? request?.params?.directive_id ?? null;
      await state.inputQueue.enqueue(normalizeInputEvent({ content: message, source: 'system_directive', authority_ref: request?.params?.authority_ref ?? directiveId, directive_id: directiveId, request_id: requestId }, { transport: 'control_jsonl' }), { drain: true, state });
      return;
    }
    const message = String(request?.params?.message ?? '');
    if (!message.trim()) {
      emit('error', { request_id: requestId, code: 'message_required', message: 'conversation.send requires params.message' });
      return;
    }
    await state.inputQueue.enqueue(normalizeInputEvent({ content: message, source: request?.params?.source ?? 'automation_jsonl', source_id: request?.params?.source_id ?? null, authority_ref: request?.params?.authority_ref ?? null, request_id: requestId }, { transport: 'control_jsonl' }), { drain: true, state });
  } catch (error) {
    emit('error', { request_id: requestId, code: 'request_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function callChatApi(messages, tools, settings = {}) {
  const provider = settings.provider ?? process.env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription';
  const providerMetadata = PROVIDER_METADATA[provider];
  if (!providerMetadata) throw new Error(`Unsupported intelligence provider: ${provider}`);
  const adapter = REQUEST_ADAPTERS[providerMetadata.adapter_kind];
  if (!adapter) throw new Error(`Request adapter not implemented for ${provider}: ${providerMetadata.adapter_kind}`);
  const state = providerMetadata.support_state ?? providerMetadata.support_status;
  if (![PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED, PROVIDER_SUPPORT_STATES.DEPRECATED, 'supported'].includes(state)) {
    throw new Error(`Unsupported intelligence provider adapter for ${provider}: ${state}`);
  }
  if (provider !== 'codex-subscription' && !settings.apiKey) {
    const credentialNames = providerMetadata.credential_env_names ?? [];
    throw new Error(`Missing API key for ${provider}. Set ${credentialNames.join(' or ') || 'the provider-specific API key environment variable'}.`);
  }
  const request = adapter.buildRequest(messages, tools, settings);
  if (providerMetadata.adapter_kind === 'codex-mcp-server') {
    const response = settings.stream === false
      ? await sendCodexExecJsonBufferedRequest(request, settings)
      : await sendCodexExecJsonRequest(request, settings);
    return parseCodexMcpResponse(response);
  }
  const response = await sendProviderRequest(adapter.buildRequest(messages, tools, settings), settings);
  return providerMetadata.adapter_kind === 'anthropic-messages' ? parseAnthropicMessagesResponse(response) : response;
}

function sendProviderRequest({ url, body, headers }, settings = {}) {
  const serializedBody = JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    const isHttps = url.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)({ hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname + url.search, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(serializedBody) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode < 200 || res.statusCode >= 300) rejectRequest(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 1000)}`));
          else if (parsed?.error) rejectRequest(new Error(`API error: ${JSON.stringify(parsed.error).slice(0, 1000)}`));
          else resolveRequest(parsed);
        } catch {
          rejectRequest(new Error(`Invalid JSON from API: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', rejectRequest);
    settings.abortSignal?.addEventListener?.('abort', () => req.destroy(new Error('agent_cli_interrupt_requested')), { once: true });
    req.write(serializedBody);
    req.end();
  });
}

function sendCodexExecJsonRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const prompt = codexExecPrompt(request);
    const mcpServers = codexRequestMcpServers(request, settings);
    const processOwner = spawnOwnedProcess(command.command, [...command.prefixArgs, ...args], { cwd: request.arguments?.cwd ?? settings.siteRoot ?? process.cwd(), windowsHide: true, env: buildCodexSubprocessEnv(mcpServers, settings), stdio: ['pipe', 'pipe', 'pipe'] });
    const child = processOwner.child;
    child.stdin.end(prompt);
    let stdoutBuffer = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let content = '';
    let streamed = false;
    const abortChild = () => processOwner.terminateTree('codex_subscription_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        settings.emit?.('provider_event', { provider: 'codex-subscription', event });
        handleCodexExecMcpToolEvent(event, settings);
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        const text = codexExecEventText(event);
        const accumulated = accumulateCodexExecText(content, text);
        const { appendText, suppressStreaming } = accumulated;
        content = accumulated.content;
        if (appendText && !suppressStreaming) {
          streamed = true;
          settings.emit?.('assistant_message_stream', { turn_id: settings.turn?.turnId ?? null, content: appendText });
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    child.on('exit', (code) => {
      settings.abortSignal?.removeEventListener?.('abort', abortChild);
      if (settings.abortSignal?.aborted) return rejectRequest(new Error('agent_cli_interrupt_requested'));
      if (stdoutBuffer.trim()) {
        const event = parseCodexExecJsonLine(stdoutBuffer.trim());
        if (event?.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        const text = event ? codexExecEventText(event) : '';
        content = accumulateCodexExecText(content, text).content;
      }
      if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
      resolveRequest({ threadId, content, streaming_rendered: streamed });
    });
  });
}
function sendCodexExecJsonBufferedRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const prompt = codexExecPrompt(request);
    const mcpServers = codexRequestMcpServers(request, settings);
    const processOwner = spawnOwnedProcess(command.command, [...command.prefixArgs, ...args], { cwd: request.arguments?.cwd ?? settings.siteRoot ?? process.cwd(), windowsHide: true, env: buildCodexSubprocessEnv(mcpServers, settings), stdio: ['pipe', 'pipe', 'pipe'] });
    const child = processOwner.child;
    child.stdin.end(prompt);
    let stdout = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let content = '';
    const abortChild = () => processOwner.terminateTree('codex_subscription_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    child.on('exit', (code) => {
      settings.abortSignal?.removeEventListener?.('abort', abortChild);
      if (settings.abortSignal?.aborted) return rejectRequest(new Error('agent_cli_interrupt_requested'));
      if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        handleCodexExecMcpToolEvent(event, settings);
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        content += codexExecEventText(event);
      }
      resolveRequest({ threadId, content, streaming_rendered: false });
    });
  });
}

function handleCodexExecMcpToolEvent(event, settings = {}) {
  const summary = codexExecMcpToolEventSummary(event);
  if (!summary) return;
  if (event.type === 'item.started') {
    settings.emit?.('tool_call', { turn_id: settings.turn?.turnId ?? null, tool: summary.name, server: summary.server, arguments: summary.arguments, decision: 'delegated_to_nested_codex', carrier_mutation_admitted: false, native_mcp_tool_call: true });
  }
  if (event.type === 'item.completed') {
    settings.emit?.('tool_result', { turn_id: settings.turn?.turnId ?? null, tool: summary.name, server: summary.server, status: 'ok', native_mcp_tool_call: true });
  }
}

function serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context = {} }) {
  const carrierSessionSettings = state?.sessionSettings ?? {};
  const goal = normalizeCarrierGoalState(carrierSessionSettings.goal);
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  const handoffs = sessionHandoffs({ identity: context.identity, session: context.session });
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    provider: context.providerSettings?.provider ?? process.env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription',
    model: carrierSessionSettings.model,
    thinking: carrierSessionSettings.thinking,
    stream: carrierSessionSettings.stream,
    goal: goal.value || null,
    goal_status: goal.status,
    goal_display: carrierGoalStatusLabel(goal),
    active_turn_state: state.activeTurn ? 'running' : 'idle',
    active_turn_id: state.activeTurn?.turnId ?? null,
    mcp_server_count: Object.keys(mcpServers).length,
    ...mcpStatus,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    ...createSessionActivitySnapshot(state),
    ...createOperationalPostureSnapshot({ state, mcpOperationalState: mcpStatus.mcp_operational_state }),
    tool_count: allTools.length,
    mcp_tools: allTools,
    mcp_servers: mcpServerSummaryEntries(mcpServers),
    delegated_authority_handoff: context.narsDelegatedAuthorityHandoff ?? context.delegatedAuthorityHandoff ?? null,
    delegated_authority_ref: (context.narsDelegatedAuthorityHandoff ?? context.delegatedAuthorityHandoff)?.authority_ref ?? null,
    handoffs,
    recommended_command: handoffs.session_read ?? null,
    recovery_kind: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? 'invalid_control_review' : 'no_recovery',
    recovery_kind_display: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? 'invalid control review' : 'no recovery',
    recovery_primary_command: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? handoffs.session_events_issues : handoffs.session_read,
    recovery_followup_command: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? handoffs.session_read : null,
    session_path: context.sessionPath,
    events_path: context.eventsPath,
  };
}

function serverHealth({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context = {} }) {
  const status = serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context });
  const degraded = status.operational_posture !== 'healthy';
  return {
    schema: 'narada.nars.health.v1',
    event: 'session_health',
    request_id: requestId,
    status: degraded ? 'degraded' : 'healthy',
    agent_id: context.identity,
    session_id: context.session,
    site_root: context.siteRoot,
    runtime: 'narada-agent-runtime-server',
    runtime_substrate: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    carrier_kind: 'agent-cli',
    operator_surface_kind: 'agent-cli',
    delegated_authority_handoff: status.delegated_authority_handoff,
    delegated_authority_ref: status.delegated_authority_ref,
    provider: status.provider,
    model: status.model,
    thinking: status.thinking,
    mcp: {
      operational_state: status.mcp_operational_state,
      server_count: status.mcp_server_count,
      startup_failure_count: status.mcp_startup_failure_count,
      runtime_fault_count: status.mcp_runtime_fault_count,
      servers: status.mcp_servers,
    },
    heartbeat: {
      freshness: 'fresh',
      last_seen_at: new Date().toISOString(),
    },
    posture: {
      request_posture: status.request_posture,
      operational_posture: status.operational_posture,
      operational_posture_display: status.operational_posture_display,
    },
    handoffs: status.handoffs,
  };
}

function emitServerEvent(output, event, { appendEventRecord } = {}) {
  const sequencedEvent = { event_sequence: nextEventSequence(), sequence: currentEventSequence, ...event };
  appendEventRecord?.(sequencedEvent);
  output.write(`${JSON.stringify(sequencedEvent)}\n`);
}

let currentEventSequence = 0;
function nextEventSequence() {
  currentEventSequence += 1;
  return currentEventSequence;
}

function loadRolePrompt(identityName, siteRoot) {
  const candidates = [join(siteRoot, 'AGENTS.md'), join(siteRoot, '.narada', 'AGENTS.md')];
  return candidates.filter((path) => existsSync(path)).map((path) => readFileSync(path, 'utf8')).join('\n\n');
}

function loadSession(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return entry.role ? [entry] : [];
    } catch {
      return [];
    }
  });
}

function closeMcpServers(mcpServers) {
  for (const server of Object.values(mcpServers)) if (server.process && !server.process.killed) server.process.kill();
}

function recordMcpStartupFailures(mcpServers, { emit = null, appendSessionRecord = null } = {}) {
  for (const failure of getMcpStartupFailures(mcpServers)) {
    const payload = { diagnostic_code: failure.code ?? 'mcp_startup_failure', ...failure };
    emit?.('carrier_diagnostic_recorded', payload);
    appendSessionRecord?.(carrierSessionEventEntry('carrier_diagnostic_recorded', payload));
  }
}

function recordMcpPreflightArtifactLinkage({ emit, preflightArtifact, appendSessionRecord = null } = {}) {
  if (!preflightArtifact) return null;
  const payload = {
    artifact_path: preflightArtifact.artifact_path ?? preflightArtifact.path ?? null,
    generated_at: preflightArtifact.generated_at ?? null,
    recommended_action: preflightArtifact.recommended_action ?? null,
    recommended_action_display: preflightArtifact.recommended_action_display ?? null,
    recommended_command: preflightArtifact.recommended_command ?? null,
    recovery_kind: preflightArtifact.recovery_kind ?? null,
    recovery_kind_display: preflightArtifact.recovery_kind_display ?? null,
    recovery_primary_command: preflightArtifact.recovery_primary_command ?? null,
    recovery_followup_command: preflightArtifact.recovery_followup_command ?? null,
    handoffs: preflightArtifact.handoffs ?? null,
  };
  emit?.('mcp_preflight_artifact_linked', payload);
  appendSessionRecord?.({ event: 'mcp_preflight_artifact_linked', ...payload, timestamp: new Date().toISOString() });
  return payload;
}

function readMcpPreflightArtifact({ artifactDir, session, identity, siteRoot } = {}) {
  const candidateDir = artifactDir ?? join(siteRoot, '.narada', 'runtime', 'agent-cli', 'mcp-preflight');
  const candidates = [
    session ? join(candidateDir, `${session}.json`) : null,
    identity ? join(candidateDir, `${identity}.json`) : null,
  ].filter(Boolean);
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const artifact = JSON.parse(readFileSync(path, 'utf8'));
      return normalizeMcpPreflightArtifact({ ...artifact, artifact_path: path, path }, { identity, session });
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeMcpPreflightArtifact(artifact, { identity, session } = {}) {
  const operationalState = artifact.mcp_operational_state ?? artifact.operational_state ?? null;
  const startupFailures = Number(artifact.mcp_startup_failure_count ?? 0);
  const runtimeFaults = Number(artifact.mcp_runtime_fault_count ?? 0);
  const healthy = operationalState === 'healthy' && startupFailures === 0 && runtimeFaults === 0;
  const recommendedAction = artifact.recommended_action ?? (healthy ? 'start_session' : 'review_startup_diagnostics');
  const recoveryKind = artifact.recovery_kind ?? (healthy ? 'no_recovery' : 'startup_diagnostic_review');
  return {
    ...artifact,
    recommended_action: recommendedAction,
    recommended_action_display: artifact.recommended_action_display ?? recommendedAction.replaceAll('_', ' '),
    recommended_command: artifact.recommended_command ?? null,
    recovery_kind: recoveryKind,
    recovery_kind_display: artifact.recovery_kind_display ?? recoveryKind.replaceAll('_', ' '),
    recovery_primary_command: artifact.recovery_primary_command ?? null,
    recovery_followup_command: artifact.recovery_followup_command ?? null,
    handoffs: artifact.handoffs ?? preflightHandoffs({ identity, session }),
  };
}

function preflightHandoffs({ identity, session } = {}) {
  if (!identity || !session) return null;
  const prefix = `narada-agent-cli --identity ${identity} --session ${session}`;
  return {
    mcp_preflight_read: `${prefix} --mcp-preflight-read`,
    mcp_preflight_read_json: `${prefix} --mcp-preflight-read-json`,
    mcp_preflight_diagnostics: `${prefix} --mcp-preflight-diagnostics --mcp-preflight-diagnostics-filter all`,
    mcp_preflight_diagnostics_json: `${prefix} --mcp-preflight-diagnostics-json --mcp-preflight-diagnostics-filter all`,
  };
}

function createMcpPreflightArtifactSnapshot(preflightArtifact) {
  return {
    mcp_preflight_artifact_path: preflightArtifact?.artifact_path ?? preflightArtifact?.path ?? null,
    mcp_preflight_artifact_generated_at: preflightArtifact?.generated_at ?? null,
    mcp_preflight_operational_state: preflightArtifact?.mcp_operational_state ?? preflightArtifact?.operational_state ?? null,
    mcp_preflight_startup_failure_summary: preflightArtifact?.mcp_startup_failure_summary ?? preflightArtifact?.startup_failure_summary ?? null,
    mcp_preflight_runtime_fault_summary: preflightArtifact?.mcp_runtime_fault_summary ?? preflightArtifact?.runtime_fault_summary ?? null,
    mcp_preflight_recommended_action: preflightArtifact?.recommended_action ?? null,
    mcp_preflight_recommended_action_display: preflightArtifact?.recommended_action_display ?? null,
    mcp_preflight_recommended_command: preflightArtifact?.recommended_command ?? null,
    mcp_preflight_recovery_kind: preflightArtifact?.recovery_kind ?? null,
    mcp_preflight_recovery_kind_display: preflightArtifact?.recovery_kind_display ?? null,
    mcp_preflight_recovery_primary_command: preflightArtifact?.recovery_primary_command ?? null,
    mcp_preflight_recovery_followup_command: preflightArtifact?.recovery_followup_command ?? null,
    mcp_preflight_handoffs: preflightArtifact?.handoffs ?? null,
  };
}

function noteSessionActivity(state, eventKind, occurredAt = new Date().toISOString(), terminalState = null) {
  if (!state) return;
  state.sessionEventCount = Number(state.sessionEventCount ?? 0) + 1;
  state.lastEventKind = eventKind;
  state.lastEventAt = occurredAt;
  if (terminalState) state.lastTerminalState = terminalState;
}

function recordSessionRequestIssue(state, issueCode) {
  if (!state || !issueCode) return;
  state.requestIssueCounts[issueCode] = Number(state.requestIssueCounts[issueCode] ?? 0) + 1;
  const outcomeCode = classifyRequestIssueOutcome(issueCode);
  state.requestOutcomeCounts[outcomeCode] = Number(state.requestOutcomeCounts[outcomeCode] ?? 0) + 1;
}

function createSessionActivitySnapshot(state = {}) {
  const requestOutcomeCounts = state.requestOutcomeCounts ?? {};
  const requestIssueCounts = state.requestIssueCounts ?? {};
  const requestPosture = summarizeRequestPosture(requestOutcomeCounts);
  return {
    session_event_count: Number(state.sessionEventCount ?? 0),
    last_event_kind: state.lastEventKind ?? null,
    last_event_at: state.lastEventAt ?? null,
    last_terminal_state: state.lastTerminalState ?? null,
    ...requestPosture,
    request_outcome_counts: requestOutcomeCounts,
    request_outcome_summary: summarizeCounts(requestOutcomeCounts),
    request_issue_counts: requestIssueCounts,
    request_issue_summary: summarizeCounts(requestIssueCounts),
  };
}

function createOperationalPostureSnapshot({ state = {}, mcpOperationalState = 'unknown' } = {}) {
  const requestPosture = summarizeRequestPosture(state.requestOutcomeCounts ?? {}).request_posture;
  let posture = 'healthy';
  if (mcpOperationalState === 'runtime_faulted') posture = 'mcp_runtime_faulted';
  else if (mcpOperationalState === 'startup_degraded') posture = 'mcp_startup_degraded';
  else if (requestPosture === 'runtime_failures') posture = 'request_runtime_failures';
  else if (requestPosture === 'invalid_control_traffic') posture = 'request_invalid_control_traffic';
  else if (requestPosture === 'closed_session_retries') posture = 'request_closed_session_retries';
  else if (state.closed) posture = 'closed';
  return {
    operational_posture: posture,
    operational_posture_display: posture === 'healthy' ? 'healthy' : `${posture} [mcp=${mcpOperationalState}; request=${requestPosture}; lifecycle=${state.closed ? 'closed' : 'none'}]`,
    recommended_action: requestPosture === 'invalid_control_traffic' ? 'review_invalid_control_traffic' : state.closed ? 'session_closed' : 'review_session_summary',
    recommended_action_display: requestPosture === 'invalid_control_traffic' ? 'review invalid control traffic' : state.closed ? 'session closed' : 'review session summary',
  };
}

function classifyRequestIssueOutcome(issueCode) {
  if (issueCode === 'invalid_json' || issueCode === 'invalid_request' || issueCode === 'message_required') return 'invalid_request';
  if (issueCode === 'session_closed') return 'rejected_closed';
  if (issueCode === 'request_dispatch_failed') return 'dispatch_failure';
  return 'request_error';
}

function summarizeRequestPosture(requestOutcomeCounts = {}) {
  const counts = {
    invalid_control_traffic: Number(requestOutcomeCounts.invalid_request ?? 0),
    closed_session_retries: Number(requestOutcomeCounts.rejected_closed ?? 0),
    runtime_failures: Number(requestOutcomeCounts.dispatch_failure ?? 0) + Number(requestOutcomeCounts.request_runtime_failure ?? 0) + Number(requestOutcomeCounts.request_error ?? 0),
  };
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return { request_outcome_total: 0, request_posture: 'clean', request_posture_display: 'clean' };
  const order = ['runtime_failures', 'invalid_control_traffic', 'closed_session_retries'];
  const [requestPosture] = order.map((key) => [key, counts[key]]).sort((left, right) => right[1] - left[1] || order.indexOf(left[0]) - order.indexOf(right[0]))[0];
  return { request_outcome_total: total, request_posture: requestPosture, request_posture_display: `${requestPosture} (${total})` };
}

function sessionHandoffs({ identity, session, eventCount = 20 } = {}) {
  if (!identity || !session) return {};
  const base = `narada-agent-cli --identity ${identity} --session ${session}`;
  return {
    session_operations: `${base} --session-operations`,
    session_operations_json: `${base} --session-operations-json`,
    session_read: `${base} --session-read`,
    session_read_json: `${base} --session-read-json`,
    session_recovery: `${base} --session-recovery`,
    session_recovery_json: `${base} --session-recovery-json`,
    session_events: `${base} --session-events --session-events-filter all --session-events-count ${eventCount}`,
    session_events_issues: `${base} --session-events --session-events-filter issues --session-events-count ${eventCount}`,
    session_events_diagnostics: `${base} --session-events --session-events-filter diagnostics --session-events-count ${eventCount}`,
  };
}

function readSessionEventsForSubscription({ eventsPath, maxReplay = 100 } = {}) {
  if (!eventsPath || !existsSync(eventsPath)) return [];
  const limit = Math.max(0, Number(maxReplay ?? 100));
  const events = [];
  for (const line of readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events.slice(-limit);
}

function summarizeCounts(counts = {}) {
  const entries = Object.entries(counts).filter(([, value]) => Number(value ?? 0) > 0);
  if (entries.length === 0) return '0';
  return entries.map(([key, value]) => `${key}:${value}`).join(', ');
}

function mcpServerSummaryEntries(mcpServers) {
  return Object.entries(mcpServers ?? {}).map(([server_name, server]) => ({ server_name, tool_count: server.tools?.length ?? 0, operational_state: 'healthy' }));
}

function createOperationHeartbeatDirectiveEmitter({ inputQueue, intervalMs = 60000, initialDelayMs = 60000 } = {}) {
  let timer = null;
  const emitOnce = async ({ reason = 'operation_heartbeat' } = {}) => inputQueue?.enqueue?.(normalizeInputEvent({ content: '', source: 'system_directive', metadata: { directive: { kind: 'operation_heartbeat', visibility: 'record_only', reason } } }, { transport: 'carrier_server_api' }), { drain: true });
  return {
    start() {
      timer = setInterval(() => emitOnce(), Math.max(1000, intervalMs));
      if (initialDelayMs >= 0) setTimeout(() => emitOnce({ reason: 'initial_delay' }), initialDelayMs);
      return this;
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    emitOnce,
  };
}

function createTurn(turnId, requestId) {
  const abortController = new AbortController();
  return {
    turnId,
    requestId,
    interruptRequested: false,
    abortSignal: abortController.signal,
    abortController,
    setPhase() {},
    clearStatus() {},
  };
}

function requestTurnInterrupt(turn) {
  if (!turn) return;
  turn.interruptRequested = true;
  turn.abortController?.abort?.();
}

function normalizeServerControlInputRequest(request, requestId = null) {
  const controlRequest = request?.schema === 'narada.carrier.control.input_event.v1' ? request : request?.params?.input;
  if (!controlRequest) throw new Error('carrier.input.deliver requires params.input');
  const controlRecord = normalizeControlInputRecord(controlRequest);
  return { ...controlRecord.input, request_id: requestId ?? controlRecord.input.request_id ?? null };
}

function sessionLogEntry(entry) {
  return { ...entry, timestamp: new Date().toISOString() };
}

function carrierSessionEventEntry(eventKind, payload = {}) {
  return { event_kind: eventKind, payload, timestamp: new Date().toISOString() };
}

function appendJsonlRecord(path, entry) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
}

function messagesWithCarrierGoal(messages, goal = null) {
  const normalized = normalizeCarrierGoalState(goal);
  if (!normalized.value || normalized.status !== 'active') return messages;
  const goalMessage = { role: 'system', content: `Active carrier session goal: ${normalized.value}\nUse this as the persistent task target and completion criterion while it remains active.` };
  const insertAt = messages.findIndex((message) => message.role !== 'system');
  return insertAt === -1 ? [...messages, goalMessage] : [...messages.slice(0, insertAt), goalMessage, ...messages.slice(insertAt)];
}

function normalizeCarrierGoalState(goal) {
  if (goal && typeof goal === 'object') return createCarrierGoalState(goal.value ?? '', goal.status ?? 'active');
  return createCarrierGoalState(goal ?? '');
}

function createCarrierGoalState(value = '', status = 'active') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return { value: normalized, status: normalized ? (String(status).toLowerCase() === 'paused' ? 'paused' : 'active') : 'unset' };
}

function carrierGoalStatusLabel(goal) {
  const normalized = normalizeCarrierGoalState(goal);
  if (!normalized.value) return 'not set';
  return `${normalized.value} (${normalized.status})`;
}

function summarizeToolResult(value, limit = 500) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function stringifySummary(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function randomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function codexCommand() {
  return resolveCodexCommand({ processEnv: process.env, platform: process.platform, exists: existsSync });
}

function codexCliSpawnError(error, command) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' ? error.code : null;
  if (code === 'ENOENT') {
    return new Error(`codex_cli_unresolved: failed to start ${command.command}. Install Codex CLI, expose it on PATH, or set NARADA_CODEX_EXEC_COMMAND/NARADA_CODEX_COMMAND. Original error: ${message}`);
  }
  return error instanceof Error ? error : new Error(message);
}

function terminateChildProcess(child) {
  if (!child || child.killed) return;
  child.kill();
}

function recordCarrierDiagnostic(level, message, { appendSessionRecord, ...extra } = {}) {
  appendSessionRecord?.(carrierSessionEventEntry('carrier_diagnostic_recorded', { level, message, ...extra }));
}
