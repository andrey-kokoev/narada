import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { redactProviderRuntimeBinding, resolveProviderRuntimeBinding } from '@narada2/carrier-provider-contract';
import { createProviderCall } from '@narada2/nars-provider-runtime/provider-call';
import { createProjectedTerminalBridge } from '@narada2/carrier-terminal-projection/projected-terminal';
import { createControlInputBridge } from './control-input-bridge.mjs';
import { createSessionCoreRuntimeService } from './session-core-runtime-service.mjs';
import { createNarsRuntimeContext } from './runtime-context.mjs';
import {
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatHostStatusEvent,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
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
} from './lifecycle-hooks.mjs';
import { startEventStreamProjection, parseEventStreamOptions } from './runtime-server-event-stream.mjs';
import { createEventHub } from './runtime-server-event-hub.mjs';
import { createDelegatedAuthorityHandoff } from './runtime-server-authority.mjs';
import { handleArtifactHttpRequest } from './runtime-server-artifacts.mjs';
import { createNarsRuntimeHostStateMachine } from './runtime-host-state.mjs';

export { formatHostStatusEvent } from './runtime-server-events.mjs';

function valueAfterFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  const value = args[index + 1];
  return value && !String(value).startsWith('--') ? String(value) : null;
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

async function loadRuntimeDependencies(runtimeContext = {}) {
  const deniedTools = new Set(String(process.env.NARADA_DENIED_CAPABILITY_TOOLS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  return createSessionCoreRuntimeService({
    runtimeContext,
    callChatApiFn: createProviderCall({ runtimeContext }),
    admitCapability: ({ toolName }) => deniedTools.has(toolName)
      ? { admitted: false, reason: 'denied_by_runtime_policy' }
      : { admitted: true, reason: 'admitted_by_runtime_policy' },
  });
}

function parseHealthOptions(args, env = process.env) {
  const forwardedArgs = [];
  let enabled = env.NARADA_AGENT_RUNTIME_HEALTH_ENABLED !== '0';
  let host = env.NARADA_AGENT_RUNTIME_HEALTH_HOST || '127.0.0.1';
  let port = Number.parseInt(env.NARADA_AGENT_RUNTIME_HEALTH_PORT || '0', 10);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-health') {
      enabled = false;
      continue;
    }
    if (arg === '--health-host') {
      host = args[index + 1] || host;
      index += 1;
      continue;
    }
    if (arg === '--health-port') {
      port = Number.parseInt(args[index + 1] || '0', 10);
      index += 1;
      continue;
    }
    forwardedArgs.push(arg);
  }
  return {
    forwardedArgs,
    health: {
      enabled,
      host,
      port: Number.isFinite(port) && port >= 0 ? port : 0,
    },
  };
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

function startHealthProjection({ childStdin, host, port, timeoutMs = 2000, runtimeContext, sessionSupervisor = null }) {
  const pending = new Map();
  let sequence = 0;
  const requestHealth = sessionSupervisor
    ? async () => sessionSupervisor.health()
    : () => new Promise((resolve, reject) => {
    const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
    if (!stdin?.writable) {
      reject(new Error('child_stdin_unavailable'));
      return;
    }
    sequence += 1;
    const requestId = `http-health-${Date.now()}-${sequence}`;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('session_health_timeout'));
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    stdin.write(`${JSON.stringify({ id: requestId, method: 'session.health', params: {} })}\n`);
  });
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

async function main() {
  const requestedArgs = process.argv.slice(2);
  const wrapperEventsJsonl = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl = requestedArgs.includes('--raw-jsonl');
  const parsedHealth = parseHealthOptions(requestedArgs.filter((arg) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl'));
  const parsedEvents = parseEventStreamOptions(parsedHealth.forwardedArgs);
  const args = parsedEvents.forwardedArgs;
  const operatorSurfaceKind = valueAfterFlag(args, '--operator-surface') ?? process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli';
  const lifecycleDispatcher = createNarsLifecycleHookDispatcher();
  const lifecycleBinding = lifecycleBindingFromArgs(args, process.env);
  const delegatedAuthorityHandoff = createDelegatedAuthorityHandoff({ args, env: process.env });
  const launchProcessContext = {
    launchSessionId: process.env.NARADA_LAUNCH_SESSION_ID ?? null,
    processOwnership: process.env.NARADA_PROCESS_OWNERSHIP ?? null,
    processRole: process.env.NARADA_PROCESS_ROLE ?? null,
    createdByPid: process.env.NARADA_CREATED_BY_PID ?? null,
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
  try {
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
    preliminaryRuntimeContext = createNarsRuntimeContext({
      identity: lifecycleBinding.agent_id,
      agentIdentityRef: lifecycleBinding.agent_identity_ref,
      session: lifecycleBinding.session_id,
      siteRoot: lifecycleBinding.metadata.site_root,
      siteId: agentIdentitySiteId(lifecycleBinding.agent_identity_ref) ?? process.env.NARADA_SITE_ID ?? null,
      siteConfig: parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG),
      operatorSurfaceKind,
      mcpScope: process.env.NARADA_MCP_SCOPE?.trim() || 'all',
      runtimeHostState: () => runtimeHost.snapshot(),
      ...launchProcessContext,
    });
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
    await closeServer(healthProjection?.server);
    await closeServer(eventStreamProjection?.server);
    runtimeHost.transition('stopped', { reason: 'startup_cleanup_complete' });
    throw error;
  }
  process.env.NARADA_NARS_AUTHORITY_HANDOFF = JSON.stringify(delegatedAuthorityHandoff);

  let runtimeContext;
  let runtimeService;
  let controlInputBridge = null;
  try {
    const intelligenceProvider = process.env.NARADA_INTELLIGENCE_PROVIDER?.trim();
    if (!intelligenceProvider) throw new Error('provider_runtime_provider_required');
    const providerRuntimeBinding = resolveProviderRuntimeBinding(intelligenceProvider, { env: process.env });

    runtimeContext = createNarsRuntimeContext({
      identity: lifecycleBinding.agent_id,
      agentIdentityRef: lifecycleBinding.agent_identity_ref,
      session: lifecycleBinding.session_id,
      siteRoot: lifecycleBinding.metadata.site_root,
      siteId: agentIdentitySiteId(lifecycleBinding.agent_identity_ref) ?? process.env.NARADA_SITE_ID ?? null,
      siteConfig: parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG),
      operatorSurfaceKind,
      mcpScope: process.env.NARADA_MCP_SCOPE?.trim() || 'all',
      runtimeHostState: () => runtimeHost.snapshot(),
      ...launchProcessContext,
      intelligenceProvider: providerRuntimeBinding.provider_id,
      narsDelegatedAuthorityHandoff: delegatedAuthorityHandoff,
      providerSettings: {
        model: providerRuntimeBinding.model,
        thinking: providerRuntimeBinding.reasoning_effort,
        stream: process.env.NARADA_AGENT_CLI_STREAM !== '0',
        baseUrl: providerRuntimeBinding.base_url,
        apiKey: providerRuntimeBinding.api_key,
        runtimeBinding: redactProviderRuntimeBinding(providerRuntimeBinding),
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
    });
    runtimeService = await loadRuntimeDependencies(runtimeContext);
    if (healthRuntimeContext) healthRuntimeContext.sessionCore = runtimeService.supervisor.core;
    controlInputBridge = createControlInputBridge({
      path: runtimeContext.controlPath,
      output: runtimeInput,
      onError: (error) => console.error(`[agent-runtime-server] carrier control input rejected: ${error instanceof Error ? error.message : String(error)}`),
    });
    await controlInputBridge.start();
  } catch (error) {
    runtimeHost.transition('failed', {
      reason: 'runtime_binding_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    await closeServer(healthProjection?.server);
    await closeServer(eventStreamProjection?.server);
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
    workflowSummaries: new Set(),
  };
  let stdoutBuffer = '';
  let writeProjectedOutput = (text) => process.stdout.write(text);
  let renderProjectedEvent = () => [];
  const useInteractiveTerminalProjection = !rawJsonl
    && operatorSurfaceKind === 'agent-cli'
    && process.stdin.isTTY === true;

  if (useInteractiveTerminalProjection) {
    const projectedTerminal = createProjectedTerminalBridge({
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
        healthProjection?.observe(event);
        eventHub.publish(event);
        dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event)
          .then((result) => {
            for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
          })
          .catch((error) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
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
      } catch {}
    }
  });

  let exitCode = 0;
  try {
    runtimeHost.transition('serving', { reason: 'runtime_service_started' });
    await runtimeService.run({
      input: runtimeInput,
      output: runtimeOutput,
    });
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
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.stdin.unpipe?.(runtimeInput);
    controlInputBridge?.close();
    healthProjection?.rejectAll(new Error('carrier_closed'));
    if (runtimeHost.state === 'serving' || runtimeHost.state === 'failed') {
      runtimeHost.transition('closing', {
        reason: runtimeHost.state === 'failed' ? 'runtime_failure_cleanup' : 'runtime_service_stopped',
        exit_code: exitCode,
      });
    }
    await closeServer(healthProjection?.server);
    await closeServer(eventStreamProjection?.server);
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
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
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
  main,
};
