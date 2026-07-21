import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { createProjectedTerminalBridge } from '@narada2/carrier-terminal-projection/projected-terminal';
import { createControlInputBridge } from './control-input-bridge.mjs';
import { createSessionCoreRuntimeService, normalizeRuntimeMcpScope } from './session-core-runtime-service.mjs';
import { createNarsIntelligenceRuntimeController } from './intelligence-runtime-controller.mjs';
import { createNarsRuntimeContext } from './runtime-context.mjs';
import { createLocalIntelligenceRuntime } from './local-intelligence-runtime.mjs';
import {
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatHostStatusEvent,
  formatControlInputBridgeErrorEvent,
  formatControlInputBridgeErrorSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatRuntimeOutputFailureEvent,
  formatRuntimeOutputFailureSummary,
  formatRuntimeProjectionFailureEvent,
  formatRuntimeProjectionFailureSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
} from './runtime-server-events.mjs';
import {
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  loadNarsLifecycleHookDispatcher,
} from './lifecycle-hooks.mjs';
import { startEventStreamProjection, parseEventStreamOptions } from './runtime-server-event-stream.mjs';
import { createEventHub } from './runtime-server-event-hub.mjs';
import { createDelegatedAuthorityHandoff } from './runtime-server-authority.mjs';
import { handleArtifactHttpRequest } from './runtime-server-artifacts.mjs';
import { createNarsRuntimeHostStateMachine } from './runtime-host-state.mjs';
import { createNarsHealthProjectionRequestStateMachine } from './health-projection-request-state.mjs';
import { parseEndpointOptions, valueAfterFlag } from './runtime-server-options.mjs';

export { formatHostStatusEvent } from './runtime-server-events.mjs';

export function shouldUseInteractiveTerminalProjection({
  rawJsonl = false,
  operatorSurfaceKind = 'agent-cli',
  input = process.stdin,
  output = process.stdout,
} = {}) {
  return !rawJsonl
    && operatorSurfaceKind === 'agent-cli'
    && input?.isTTY === true
    && output?.isTTY === true;
}

function agentIdentitySiteId(agentIdentityRef) {
  if (!agentIdentityRef || typeof agentIdentityRef !== 'object') return null;
  const siteId = typeof agentIdentityRef.site_id === 'string' && agentIdentityRef.site_id.trim() ? agentIdentityRef.site_id.trim() : null;
  if (siteId) return siteId;
  const identityScopeSiteId = agentIdentityRef.identity_scope && typeof agentIdentityRef.identity_scope === 'object'
    ? agentIdentityRef.identity_scope.site_id
    : null;
  return typeof identityScopeSiteId === 'string' && identityScopeSiteId.trim() ? identityScopeSiteId.trim() : null;
}

function localExecutionEvidence({ lifecycleBinding, launchProcessContext }) {
  const session = lifecycleBinding.session_id;
  const executionLocusId = 'execution-locus:operator-pc';
  const processEvidence = (componentKind, processId, resourceId = null) => ({
    schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
    component_kind: componentKind,
    execution_locus_id: executionLocusId,
    ...(resourceId ? { resource_id: resourceId } : {}),
    status: processId ? 'ready' : 'unknown',
    observed_for_session: session,
    ...(processId ? { process_id: String(processId) } : {}),
    evidence_ref: `local-execution:${session}:${componentKind}:${processId ?? 'missing'}`,
    evidence_class: 'observed-process',
  });
  return [
    processEvidence('launcher', launchProcessContext.createdByPid),
    processEvidence('carrier', process.pid),
    processEvidence('runtime', process.pid),
    processEvidence('adapter', process.pid, process.env.NARADA_INTELLIGENCE_ADAPTER_ID ?? 'adapter:openai-compatible-http'),
  ];
}

function baseRuntimeContextOptions({ lifecycleBinding, operatorSurfaceKind, launchProcessContext, runtimeHost }) {
  return {
    identity: lifecycleBinding.agent_id,
    agentIdentityRef: lifecycleBinding.agent_identity_ref,
    session: lifecycleBinding.session_id,
    siteRoot: lifecycleBinding.metadata.site_root,
    siteId: agentIdentitySiteId(lifecycleBinding.agent_identity_ref) ?? process.env.NARADA_SITE_ID ?? null,
    siteConfig: parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG),
    operatorSurfaceKind,
    mcpScope: normalizeRuntimeMcpScope(process.env.NARADA_MCP_SCOPE),
    executionEvidence: localExecutionEvidence({ lifecycleBinding, launchProcessContext }),
    runtimeHostState: () => runtimeHost.snapshot(),
    ...launchProcessContext,
  };
}

async function loadRuntimeDependencies(runtimeContext = {}) {
  const deniedTools = new Set(String(process.env.NARADA_DENIED_CAPABILITY_TOOLS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  let appendRuntimeEvent = () => {};
  const intelligenceRuntime = await createLocalIntelligenceRuntime({ runtimeContext });
  try {
    const intelligenceController = createNarsIntelligenceRuntimeController({
      runtimeContext,
      gateway: intelligenceRuntime.gateway,
      validateSelection: intelligenceRuntime.preflightSelection,
      close: intelligenceRuntime.close,
      onTransition: (event) => appendRuntimeEvent(event),
    });
    // Fail fast if the default invocation context cannot resolve an eligible
    // canonical route. This preserves the historic startup-time binding check.
    const preflight = await intelligenceRuntime.preflightSelection({ requestedModel: null, requestedOptions: {} });
    intelligenceController.primePreflight(preflight);
    const runtimeService = createSessionCoreRuntimeService({
      runtimeContext,
      intelligenceRuntime: intelligenceController,
      admitCapability: ({ toolName }) => deniedTools.has(toolName)
        ? { admitted: false, reason: 'denied_by_runtime_policy' }
        : { admitted: true, reason: 'admitted_by_runtime_policy' },
    });
    appendRuntimeEvent = (event) => runtimeService.supervisor.core.appendEvent(event);
    return runtimeService;
  } catch (error) {
    await intelligenceRuntime.close();
    throw error;
  }
}

function parseHealthOptions(args, env = process.env) {
  return parseEndpointOptions(args, env, {
    disableFlag: '--no-health',
    hostFlag: '--health-host',
    portFlag: '--health-port',
    enabledEnv: 'NARADA_AGENT_RUNTIME_HEALTH_ENABLED',
    hostEnv: 'NARADA_AGENT_RUNTIME_HEALTH_HOST',
    portEnv: 'NARADA_AGENT_RUNTIME_HEALTH_PORT',
    resultKey: 'health',
  });
}

function parseSiteConfigEnv(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function compactHealthForHttp(health) {
  if (!health || typeof health !== 'object') return health;
  const {
    mcp_tools: _mcpTools,
    operator_affordances: _operatorAffordances,
    affordance_document: _affordanceDocument,
    ...compact
  } = health;
  if (health.mcp && typeof health.mcp === 'object') {
    const { tools: _tools, ...mcp } = health.mcp;
    compact.mcp = mcp;
  }
  return compact;
}

function startHealthProjection({ childStdin, host, port, timeoutMs = 2000, runtimeContext, sessionSupervisor = null, onRequestTransition = () => {} }) {
  const pending = new Map();
  let sequence = 0;
  const requestHealth = async () => {
    sequence += 1;
    const requestId = `http-health-${Date.now()}-${sequence}`;
    const requestState = createNarsHealthProjectionRequestStateMachine({
      requestId,
      metadata: { transport: 'http', endpoint: '/health' },
      onTransition: onRequestTransition,
    });
    requestState.transition('requested');
    const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
    if (!sessionSupervisor && !stdin?.writable) {
      requestState.transition('failed', { error: 'child_stdin_unavailable' });
      throw new Error('child_stdin_unavailable');
    }
    requestState.transition('dispatched');
    if (sessionSupervisor) {
      requestState.transition('awaiting_response');
      try {
        const health = await sessionSupervisor.health();
        requestState.transition('resolved');
        return health;
      } catch (error) {
        requestState.transition('failed', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('session_health_timeout'));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer, requestState });
    });
    requestState.transition('awaiting_response');
    try {
      stdin.write(`${JSON.stringify({ id: requestId, method: 'session.health', params: {} })}\n`);
      const health = await responsePromise;
      requestState.transition('resolved');
      return health;
    } catch (error) {
      const entry = pending.get(requestId);
      if (entry) {
        pending.delete(requestId);
        clearTimeout(entry.timer);
      }
      const nextState = error?.message === 'session_health_timeout' ? 'timed_out' : 'failed';
      requestState.transition(nextState, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  const server = createServer(async (request, response) => {
    if (await handleArtifactHttpRequest({ request, response, runtimeContext })) return;
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
    if (request.method !== 'GET' || url.pathname !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ error: 'not_found' })}\n`);
      return;
    }
    try {
      const health = await requestHealth();
      const responseHealth = url.searchParams.get('detail') === 'full' ? health : compactHealthForHttp(health);
      response.writeHead(health.status === 'unhealthy' ? 503 : 200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify(responseHealth)}\n`);
    } catch (error) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ schema: 'narada.nars.health.v1', status: 'unhealthy', error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}/health`,
        observe(event) {
          if (event?.event !== 'session_health' || !pending.has(event.request_id)) return;
          const entry = pending.get(event.request_id);
          pending.delete(event.request_id);
          clearTimeout(entry.timer);
          entry.resolve(event);
        },
        rejectAll(error) {
          for (const [requestId, entry] of pending.entries()) {
            pending.delete(requestId);
            clearTimeout(entry.timer);
            entry.reject(error);
          }
        },
      });
    });
  });
}

function renderWrapperEvents({ event, wrapperEventsJsonl, state }) {
  if (wrapperEventsJsonl) {
    const statusEvent = formatWrapperStatusEvent(event);
    if (statusEvent) console.error(JSON.stringify(statusEvent));
  }
  const summary = formatStartupMcpSummary(event);
  if (summary && !state.startupSummaryPrinted) {
    console.error(summary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatStartupMcpEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.startupSummaryPrinted = true;
  }
  const runtimeFaultSummary = formatRuntimeMcpFaultSummary(event);
  if (runtimeFaultSummary && !state.runtimeFaultSummaries.has(runtimeFaultSummary)) {
    console.error(runtimeFaultSummary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatRuntimeMcpFaultEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.runtimeFaultSummaries.add(runtimeFaultSummary);
  }
  for (const [failureSummary, wrapperEvent, summarySet] of [
    [formatRuntimeProjectionFailureSummary(event), formatRuntimeProjectionFailureEvent(event), state.projectionFailureSummaries],
    [formatControlInputBridgeErrorSummary(event), formatControlInputBridgeErrorEvent(event), state.projectionFailureSummaries],
    [formatRuntimeOutputFailureSummary(event), formatRuntimeOutputFailureEvent(event), state.outputFailureSummaries],
  ]) {
    if (!failureSummary || summarySet.has(failureSummary)) continue;
    console.error(failureSummary);
    if (wrapperEventsJsonl && wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    summarySet.add(failureSummary);
  }
  for (const [workflowSummary, wrapperEvent] of [
    [formatSessionWorkflowSummary(event), formatSessionWorkflowEvent(event)],
    [formatSessionOperationsSummary(event), formatSessionOperationsEvent(event)],
    [formatPreflightWorkflowSummary(event), formatPreflightWorkflowEvent(event)],
  ]) {
    if (!workflowSummary || state.workflowSummaries.has(workflowSummary)) continue;
    console.error(workflowSummary);
    if (wrapperEventsJsonl && wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    state.workflowSummaries.add(workflowSummary);
  }
}

function handleRuntimeOutputEvent({
  event,
  healthProjection,
  eventHub,
  dispatchLifecycleEvent,
  useInteractiveTerminalProjection,
  renderProjectedEvent,
  writeProjectedOutput,
  rawJsonl,
  wrapperEventsJsonl,
  state,
}) {
  healthProjection?.observe(event);
  const durableSequence = Number(event?.event_sequence ?? event?.sequence);
  eventHub.publish(Number.isFinite(durableSequence)
    ? { ...event, durable_event_sequence: durableSequence }
    : event);
  dispatchLifecycleEvent(event);
  if (useInteractiveTerminalProjection) {
    for (const rendered of renderProjectedEvent(event)) {
      if (typeof rendered === 'string') {
        writeProjectedOutput(`${rendered}\n`, { preserveCurrentLine: rendered.startsWith('\n') });
      } else if (rendered?.raw) {
        writeProjectedOutput(rendered.raw, { preserveCurrentLine: rendered.raw.startsWith('\n'), prompt: rendered.newline !== false });
        if (rendered.newline) writeProjectedOutput('\n', { preserveCurrentLine: true });
      }
    }
  } else if (!rawJsonl) {
    for (const rendered of formatHostStatusEvent(event)) process.stdout.write(`${rendered}\n`);
  }
  renderWrapperEvents({ event, wrapperEventsJsonl, state });
}

async function main() {
  const requestedArgs = process.argv.slice(2);
  const wrapperEventsJsonl = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl = requestedArgs.includes('--raw-jsonl');
  const parsedHealth = parseHealthOptions(requestedArgs.filter((arg) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl'));
  const parsedEvents = parseEventStreamOptions(parsedHealth.forwardedArgs);
  const args = parsedEvents.forwardedArgs;
  const operatorSurfaceKind = valueAfterFlag(args, '--operator-surface') ?? process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli';
  const lifecycleBinding = lifecycleBindingFromArgs(args, process.env);
  const delegatedAuthorityHandoff = createDelegatedAuthorityHandoff({ args, env: process.env, binding: lifecycleBinding });
  const launchProcessContext = {
    launchSessionId: process.env.NARADA_LAUNCH_SESSION_ID ?? null,
    processOwnership: process.env.NARADA_PROCESS_OWNERSHIP ?? null,
    processRole: process.env.NARADA_PROCESS_ROLE ?? null,
    // Direct launches still have a real launcher boundary: the operating
    // system parent is the creator when no governed launcher supplied an
    // explicit PID. Keep the evidence observed rather than inventing a
    // catalog-side launcher resource.
    createdByPid: process.env.NARADA_CREATED_BY_PID ?? (process.ppid > 0 ? String(process.ppid) : null),
  };
  const eventHub = createEventHub();
  const runtimeHost = createNarsRuntimeHostStateMachine({
    metadata: {
      agent_id: lifecycleBinding.agent_id,
      session_id: lifecycleBinding.session_id,
      site_root: lifecycleBinding.metadata.site_root,
    },
    onTransition: (event) => eventHub.publish(event),
  });
  let lifecycleDispatcher;
  try {
    lifecycleDispatcher = await loadNarsLifecycleHookDispatcher({ args, env: process.env });
    const result = await dispatchNarsLifecycleHook(lifecycleDispatcher, 'beforeSessionBind', lifecycleBinding);
    for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
  } catch (error) {
    runtimeHost.transition('failed', {
      reason: 'before_session_bind_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    runtimeHost.transition('stopped', { reason: 'startup_failed' });
    console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  runtimeHost.transition('binding', { reason: 'before_session_bind_completed' });
  let healthProjection = null;
  let healthRuntimeContext = null;
  let eventStreamProjection = null;
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  let preliminaryRuntimeContext;
  try {
    preliminaryRuntimeContext = createNarsRuntimeContext(baseRuntimeContextOptions({
      lifecycleBinding,
      operatorSurfaceKind,
      launchProcessContext,
      runtimeHost,
    }));
  } catch (error) {
    runtimeHost.transition('failed', {
      reason: 'runtime_context_binding_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    runtimeHost.transition('stopped', { reason: 'startup_cleanup_complete' });
    throw error;
  }
  try {
    if (parsedHealth.health.enabled) {
      healthRuntimeContext = { ...preliminaryRuntimeContext, eventHub };
      healthProjection = await startHealthProjection({
        childStdin: () => runtimeInput,
        host: parsedHealth.health.host,
        port: parsedHealth.health.port,
        runtimeContext: healthRuntimeContext,
        onRequestTransition: (transition) => {
          if (transition.request_state !== 'timed_out' && transition.request_state !== 'failed') return;
          eventHub.publish({
            ...transition,
            schema: 'narada.nars.runtime_projection_failure.v1',
            event: 'runtime_projection_failure',
            projection: 'health',
          });
        },
      });
      process.env.NARADA_HEALTH_URL = healthProjection.url;
    }
    if (parsedEvents.events.enabled) {
      eventStreamProjection = await startEventStreamProjection({
        childStdin: () => runtimeInput,
        eventHub,
        host: parsedEvents.events.host,
        port: parsedEvents.events.port,
        eventsPath: preliminaryRuntimeContext.eventsPath,
      });
      process.env.NARADA_EVENT_STREAM_URL = eventStreamProjection.url;
      process.env.NARADA_WEBSOCKET_URL = eventStreamProjection.url;
    }
    runtimeHost.transition('projections_ready', {
      reason: 'projections_started',
      health_enabled: parsedHealth.health.enabled,
      events_enabled: parsedEvents.events.enabled,
      health_endpoint: healthProjection?.url ?? null,
      event_endpoint: eventStreamProjection?.url ?? null,
    });
  } catch (error) {
    runtimeHost.transition('failed', {
      reason: 'projection_start_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    await closeProjections({ healthProjection, eventStreamProjection });
    runtimeHost.transition('stopped', { reason: 'startup_cleanup_complete' });
    throw error;
  }
  process.env.NARADA_NARS_AUTHORITY_HANDOFF = JSON.stringify(delegatedAuthorityHandoff);

  let runtimeContext;
  let runtimeService;
  let controlInputBridge = null;
  try {
    // Launch transports only explicit Site/principal/request context. Runtime
    // provider/model selection occurs per invocation through the canonical
    // registry and gateway; no provider binding or startup-time plan exists.
    const siteIdForLoci = agentIdentitySiteId(lifecycleBinding.agent_identity_ref) ?? process.env.NARADA_SITE_ID ?? null;
    const canonicalSiteId = (value) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      const id = value.trim();
      return id.startsWith('site:') ? id : `site:${id}`;
    };
    const targetSiteId = canonicalSiteId(process.env.NARADA_INTELLIGENCE_TARGET_SITE) ?? canonicalSiteId(siteIdForLoci);
    const userSiteId = canonicalSiteId(process.env.NARADA_INTELLIGENCE_USER_SITE);
    const hostSiteId = canonicalSiteId(process.env.NARADA_INTELLIGENCE_HOST_SITE);
    const loci = {
      targetSite: { kind: 'site', id: targetSiteId },
      userSite: { kind: 'site', id: userSiteId },
      hostSite: { kind: 'site', id: hostSiteId },
    };
    if (!loci.targetSite.id || !loci.userSite.id || !loci.hostSite.id) {
      throw new Error('intelligence_site_context_required');
    }
    const registryDbPath = process.env.NARADA_INTELLIGENCE_REGISTRY_DB?.trim() || null;
    const principal = process.env.NARADA_INTELLIGENCE_PRINCIPAL_ID?.trim() || null;
    if (!principal) throw new Error('intelligence_principal_required');

    runtimeContext = createNarsRuntimeContext({
      ...baseRuntimeContextOptions({
        lifecycleBinding,
        operatorSurfaceKind,
        launchProcessContext,
        runtimeHost,
      }),
      narsDelegatedAuthorityHandoff: delegatedAuthorityHandoff,
      intelligence: {
        registryDbPath,
        sites: loci,
        principal,
        access: {
          action: 'invoke',
          requested_region: 'global',
          data_classification: 'internal',
          requested_retention_days: 0,
          provider_training: 'prohibited',
          expected_usage: { amount: 1, unit: 'requests' },
          expected_cost: { amount: 1, currency: 'USD' },
        },
        topologyObservationSource: {
          schema: 'narada.invokable-intelligence.local-topology-observation-source.v1',
          authority_ref: `runtime:${lifecycleBinding.session_id}`,
          probe_timeout_ms: 1500,
          observation_validity_ms: 1000,
        },
      },
      displaySettings: {
        toolOutputs: process.env.NARADA_AGENT_CLI_TOOL_OUTPUTS !== '0',
      },
      operationHeartbeatDirectiveEnabled: process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_ENABLED === '1',
      operationHeartbeatDirectiveIntervalMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INTERVAL_MS ?? '60000', 10),
      operationHeartbeatDirectiveInitialDelayMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INITIAL_DELAY_MS ?? '60000', 10),
      healthUrl: process.env.NARADA_HEALTH_URL ?? null,
      eventStreamUrl: process.env.NARADA_EVENT_STREAM_URL ?? null,
      eventsPath: preliminaryRuntimeContext.eventsPath,
      sessionPath: preliminaryRuntimeContext.sessionPath,
      controlInputBridgeState: () => controlInputBridge?.state ?? null,
    });
    runtimeService = await loadRuntimeDependencies(runtimeContext);
    if (healthRuntimeContext) healthRuntimeContext.sessionCore = runtimeService.supervisor.core;
    controlInputBridge = createControlInputBridge({
      path: runtimeContext.controlPath,
      output: runtimeInput,
      onError: (error, _line, diagnostic) => {
        const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
        eventHub.publish({
          schema: 'narada.nars.runtime_control_input_bridge_error.v1',
          event: 'runtime_control_input_bridge_error',
          timestamp: new Date().toISOString(),
          agent_id: runtimeContext.identity,
          session_id: runtimeContext.session,
          control_path: runtimeContext.controlPath,
          error_code: diagnostic?.code ?? error?.code ?? (error instanceof SyntaxError ? 'control_input_record_invalid' : 'control_input_bridge_error'),
          error: diagnostic?.message ?? message.slice(0, 240),
          error_at: diagnostic?.at ?? null,
        });
        console.error(`[agent-runtime-server] carrier control input rejected: ${message}`);
      },
    });
    await controlInputBridge.start();
  } catch (error) {
    runtimeHost.transition('failed', {
      reason: 'runtime_binding_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    await runtimeService?.intelligenceRuntime?.close?.();
    await closeProjections({ healthProjection, eventStreamProjection });
    runtimeHost.transition('stopped', { reason: 'startup_cleanup_complete' });
    throw error;
  }
  let shutdownSignal = null;
  const requestGracefulShutdown = (signal) => {
    if (shutdownSignal) return;
    shutdownSignal = signal;
    process.stdin.unpipe?.(runtimeInput);
    controlInputBridge?.close();
    if (runtimeInput.writableEnded || runtimeInput.destroyed) return;
    runtimeInput.end(`${JSON.stringify({
      id: `signal-cancel-${signal.toLowerCase()}`,
      method: 'session.cancel',
      params: { reason: 'process_signal', signal },
    })}\n${JSON.stringify({
      id: `signal-close-${signal.toLowerCase()}`,
      method: 'session.close',
      params: { reason: 'process_signal', signal },
    })}\n`);
  };
  const onSigint = () => requestGracefulShutdown('SIGINT');
  const onSigterm = () => requestGracefulShutdown('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  const state = {
    startupSummaryPrinted: false,
    runtimeFaultSummaries: new Set(),
    projectionFailureSummaries: new Set(),
    outputFailureSummaries: new Set(),
    workflowSummaries: new Set(),
  };
  let stdoutBuffer = '';
  let writeProjectedOutput = (text) => process.stdout.write(text);
  let renderProjectedEvent = () => [];
  let projectedTerminal = null;
  const useInteractiveTerminalProjection = shouldUseInteractiveTerminalProjection({
    rawJsonl,
    operatorSurfaceKind,
  });

  if (useInteractiveTerminalProjection) {
    projectedTerminal = createProjectedTerminalBridge({
      input: process.stdin,
      output: process.stdout,
      childStdin: runtimeInput,
    });
    writeProjectedOutput = projectedTerminal.writeProjectedOutput;
    renderProjectedEvent = projectedTerminal.renderEvent;
  } else {
    if (rawJsonl) {
      if (controlInputBridge) process.stdin.pipe(runtimeInput, { end: false });
      else process.stdin.pipe(runtimeInput);
    }
    else process.stdin.resume?.();
  }
  let runtimeOutputFailure = null;
  let exitCode = 0;
  let lifecycleDispatchTail = Promise.resolve();
  const dispatchLifecycleEvent = (event) => {
    lifecycleDispatchTail = lifecycleDispatchTail
      .then(() => dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event))
      .then((result) => {
        for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
      })
      .catch((error) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
    return lifecycleDispatchTail;
  };
  const reportRuntimeOutputFailure = (error, line, errorCode = null) => {
    const code = errorCode
      ?? (error instanceof SyntaxError ? 'runtime_output_invalid_json' : 'runtime_output_handler_failed');
    const failure = {
      schema: 'narada.nars.runtime_output_failure.v1',
      event: 'runtime_output_failure',
      timestamp: new Date().toISOString(),
      agent_id: runtimeContext.identity,
      session_id: runtimeContext.session,
      error_code: code,
      error: (error instanceof Error ? error.message : String(error ?? 'unknown_error')).slice(0, 240),
      line_length: String(line ?? '').length,
    };
    runtimeOutputFailure ??= failure;
    eventHub.publish(failure);
    renderWrapperEvents({ event: failure, wrapperEventsJsonl, state });
    if (!runtimeInput.destroyed && !runtimeInput.writableEnded) {
      runtimeInput.destroy(new Error(`${code}:${failure.error}`));
    }
  };
  runtimeOutput.on('data', (chunk) => {
    const text = String(chunk);
    if (rawJsonl) process.stdout.write(text);
    stdoutBuffer += text;
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        handleRuntimeOutputEvent({
          event,
          healthProjection,
          eventHub,
          dispatchLifecycleEvent,
          useInteractiveTerminalProjection,
          renderProjectedEvent,
          writeProjectedOutput,
          rawJsonl,
          wrapperEventsJsonl,
          state,
        });
      } catch (error) {
        reportRuntimeOutputFailure(error, line);
        break;
      }
    }
  });

  try {
    runtimeHost.transition('serving', { reason: 'runtime_service_started' });
    await runtimeService.run({
      input: runtimeInput,
      output: runtimeOutput,
    });
    if (stdoutBuffer.trim()) {
      reportRuntimeOutputFailure(new Error('runtime_output_incomplete_line'), stdoutBuffer, 'runtime_output_incomplete_line');
    }
    if (runtimeOutputFailure) exitCode = 1;
  } catch (error) {
    exitCode = 1;
    if (runtimeHost.state !== 'failed') {
      runtimeHost.transition('failed', {
        reason: 'runtime_service_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    healthProjection?.rejectAll(error);
    console.error(`[agent-runtime-server] carrier runtime failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await lifecycleDispatchTail;
    await lifecycleDispatcher?.taskExecutabilityDispatch?.close?.({ reason: 'runtime_shutdown' });
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.stdin.unpipe?.(runtimeInput);
    controlInputBridge?.close();
    projectedTerminal?.close();
    healthProjection?.rejectAll(new Error('carrier_closed'));
    await runtimeService?.intelligenceRuntime?.close?.();
    if (runtimeHost.state === 'serving' || runtimeHost.state === 'failed') {
      runtimeHost.transition('closing', {
        reason: runtimeHost.state === 'failed' ? 'runtime_failure_cleanup' : 'runtime_service_stopped',
        exit_code: exitCode,
      });
    }
    await closeProjections({ healthProjection, eventStreamProjection });
    if (runtimeHost.state === 'closing') {
      runtimeHost.transition('stopped', { reason: 'projections_closed', exit_code: exitCode });
    }
  }
  process.exitCode = exitCode;
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function closeProjections({ healthProjection, eventStreamProjection } = {}) {
  eventStreamProjection?.closeConnections?.();
  await closeServer(healthProjection?.server);
  await closeServer(eventStreamProjection?.server);
}

export {
  parseHealthOptions,
  parseEventStreamOptions,
  loadRuntimeDependencies,
  createDelegatedAuthorityHandoff,
  createEventHub,
  startHealthProjection,
  startEventStreamProjection,
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatControlInputBridgeErrorEvent,
  formatControlInputBridgeErrorSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatRuntimeOutputFailureEvent,
  formatRuntimeOutputFailureSummary,
  formatRuntimeProjectionFailureEvent,
  formatRuntimeProjectionFailureSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  loadNarsLifecycleHookDispatcher,
  main,
};
