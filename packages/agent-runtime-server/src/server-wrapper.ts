import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createProjectedTerminalBridge } from '@narada2/carrier-terminal-projection/projected-terminal';
import { createControlInputBridge } from './control-input-bridge.js';
import {
  createRuntimeCapabilityGateway,
  createSessionCoreRuntimeService,
  normalizeRuntimeMcpScope,
} from './session-core-runtime-service.js';
import { createNarsIntelligenceRuntimeController } from './intelligence-runtime-controller.js';
import { createNarsRuntimeContext } from './runtime-context.js';
import { createLocalIntelligenceRuntime } from './local-intelligence-runtime.js';
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
} from './runtime-server-events.js';
import {
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  loadNarsLifecycleHookDispatcher,
} from './lifecycle-hooks.js';
import { startEventStreamProjection, parseEventStreamOptions } from './runtime-server-event-stream.js';
import { createEventHub } from './runtime-server-event-hub.js';
import { createDelegatedAuthorityHandoff } from './runtime-server-authority.js';
import { handleArtifactHttpRequest } from './runtime-server-artifacts.js';
import { createNarsRuntimeHostStateMachine } from './runtime-host-state.js';
import { createNarsHealthProjectionRequestStateMachine } from './health-projection-request-state.js';
import { parseEndpointOptions, valueAfterFlag } from './runtime-server-options.js';
import { createSessionAuthorityRuntimeBinding } from '@narada2/nars-session-authority';

export { formatHostStatusEvent } from './runtime-server-events.js';

export function shouldUseInteractiveTerminalProjection({
  rawJsonl = false,
  operatorSurfaceKind = 'agent-cli',
  input = process.stdin,
  output = process.stdout,
}: any = {}) {
  return !rawJsonl
    && operatorSurfaceKind === 'agent-cli'
    && input?.isTTY === true
    && output?.isTTY === true;
}

function publicResourceId(value: any) {
  const id: any = typeof value === 'string' ? value : value && typeof value === 'object' ? value.id : null;
  return typeof id === 'string' && id.trim()
    ? id.trim().replace(/^(?:model|inference-provider):/, '')
    : null;
}

function agentIdentitySiteId(agentIdentityRef: any) {
  if (!agentIdentityRef || typeof agentIdentityRef !== 'object') return null;
  const siteId: any = typeof agentIdentityRef.site_id === 'string' && agentIdentityRef.site_id.trim() ? agentIdentityRef.site_id.trim() : null;
  if (siteId) return siteId;
  const identityScopeSiteId: any = agentIdentityRef.identity_scope && typeof agentIdentityRef.identity_scope === 'object'
    ? agentIdentityRef.identity_scope.site_id
    : null;
  return typeof identityScopeSiteId === 'string' && identityScopeSiteId.trim() ? identityScopeSiteId.trim() : null;
}

function localExecutionEvidence({ lifecycleBinding, launchProcessContext }: any) {
  const session: any = lifecycleBinding.session_id;
  const executionLocusId: any = 'execution-locus:operator-pc';
  const processEvidence: any = (componentKind: any, processId: any, resourceId: any = null, deploymentRef: any = null) => ({
    schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
    component_kind: componentKind,
    execution_locus_id: executionLocusId,
    ...(resourceId ? { resource_id: resourceId } : {}),
    // A launcher is a handoff boundary. Its parent process may already have
    // exited by the time the detached runtime performs topology preflight,
    // while the durable start handoff remains the authoritative evidence.
    status: processId || deploymentRef ? 'ready' : 'unknown',
    observed_for_session: session,
    ...(processId ? { process_id: String(processId) } : {}),
    ...(deploymentRef ? { deployment_ref: deploymentRef } : {}),
    evidence_ref: `local-execution:${session}:${componentKind}:${processId ?? deploymentRef ?? 'missing'}`,
    evidence_class: processId ? 'observed' : deploymentRef ? 'durable' : 'synthetic-correlation',
  });
  return [
    // The launcher is a handoff/deployment boundary, not a process that must
    // remain alive after the detached runtime child has been materialized.
    // Keep the parent PID as corroborating evidence when available, but admit
    // the durable agent-start handoff as the primary launcher evidence.
    processEvidence(
      'launcher',
      launchProcessContext.createdByPid,
      null,
      `agent-start:${process.env.NARADA_AGENT_START_EVENT_ID ?? session}`,
    ),
    processEvidence('carrier', process.pid),
    processEvidence('runtime', process.pid),
    processEvidence('adapter', process.pid, process.env.NARADA_INTELLIGENCE_ADAPTER_ID ?? 'adapter:codex-mcp-server'),
  ];
}

function baseRuntimeContextOptions({ lifecycleBinding, operatorSurfaceKind, launchProcessContext, runtimeHost }: any) {
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

async function loadRuntimeDependencies(runtimeContext: any = {}) {
  const deniedTools: any = new Set(String(process.env.NARADA_DENIED_CAPABILITY_TOOLS ?? '').split(',').map((value: any) => value.trim()).filter(Boolean));
  const admitCapability: any = ({ toolName }: any) => deniedTools.has(toolName)
    ? { admitted: false, reason: 'denied_by_runtime_policy' }
    : { admitted: true, reason: 'admitted_by_runtime_policy' };
  const toSessionCoreEvent: any = (event: any) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { event: 'runtime_evidence', value: event ?? null };
    }
    const { kind, event: explicitEvent, ...payload }: any = event;
    return { event: explicitEvent ?? kind ?? 'runtime_evidence', ...payload };
  };
  const pendingRuntimeEvents: any = [];
  let appendRuntimeEvent: any = (event: any) => { pendingRuntimeEvents.push(toSessionCoreEvent(event)); };
  let capabilityGateway: any = null;
  let intelligenceRuntime: any = null;
  let sessionAuthority: any = null;
  let sessionCoreForArtifacts: any = null;
  let inlineArtifactSequence: any = 0;
  const registerPiArtifact: any = async (candidate: any = {}) => {
    if (!sessionCoreForArtifacts) {
      const error: any = new Error('session_core_unavailable:registerArtifact');
      error.code = 'session_core_unavailable';
      throw error;
    }
    const content: any = typeof candidate.content === 'string'
      ? candidate.content
      : candidate.content == null ? null : JSON.stringify(candidate.content);
    if (content == null) {
      const error: any = new Error('pi_artifact_content_required');
      error.code = 'pi_artifact_content_required';
      throw error;
    }
    if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) {
      const error: any = new Error('pi_artifact_content_too_large');
      error.code = 'pi_artifact_content_too_large';
      throw error;
    }
    const kind: any = String(candidate.kind ?? 'text').trim().toLowerCase();
    const extension: any = kind === 'html' ? '.html'
      : kind === 'markdown' ? '.md'
        : kind === 'json' ? '.json'
          : '.txt';
    const materializationRoot: any = join(dirname(String(runtimeContext.sessionPath)), 'pi-admitted-artifacts');
    mkdirSync(materializationRoot, { recursive: true });
    inlineArtifactSequence += 1;
    const sourcePath: any = join(materializationRoot, `artifact-${process.pid}-${inlineArtifactSequence}${extension}`);
    writeFileSync(sourcePath, content, 'utf8');
    return sessionCoreForArtifacts.registerArtifact({
      sourcePath,
      kind,
      title: candidate.title,
      contentType: candidate.content_type ?? candidate.contentType,
      renderHint: candidate.render_hint ?? candidate.renderHint,
    });
  };
  try {
    sessionAuthority = createSessionAuthorityRuntimeBinding({ runtimeContext });
    await sessionAuthority?.activate({
      pid: process.pid,
      evidence: { runtime_server_pid: process.pid },
    });
    capabilityGateway = createRuntimeCapabilityGateway({
      runtimeContext,
      admitCapability,
      recordEvidence: (event: any) => appendRuntimeEvent(event),
    });
    intelligenceRuntime = await createLocalIntelligenceRuntime({
      runtimeContext,
      capabilityGateway,
      artifactRegistrar: registerPiArtifact,
    });
    const intelligenceController: any = createNarsIntelligenceRuntimeController({
      runtimeContext,
      gateway: intelligenceRuntime.gateway,
      validateSelection: intelligenceRuntime.preflightSelection,
      close: intelligenceRuntime.close,
      kernelHealth: intelligenceRuntime.kernelHealth,
      kernelStartEvidence: intelligenceRuntime.kernel_start_evidence ?? null,
      selectionChoices: intelligenceRuntime.selectionChoices,
      reconfigureKernel: intelligenceRuntime.kernel?.reconfigure
        ? (target: any, admittedPlan: any) => intelligenceRuntime.kernel.reconfigure({
            // The kernel contract consumes the canonical admitted plan
            // directly. Keep compatibility with callers that still wrap the
            // plan in an invocation envelope.
            ...(admittedPlan ? { admitted_plan: admittedPlan.plan ?? admittedPlan } : {}),
          })
        : null,
      reconfigureExecutionPolicyFn: intelligenceRuntime.kernel?.reconfigure
        ? (executionPolicy: any) => intelligenceRuntime.kernel.reconfigure({ execution_policy: executionPolicy })
        : null,
      onTransition: (event: any) => appendRuntimeEvent(event),
    });
    // Fail fast if the default invocation context cannot resolve an eligible
    // canonical route. This preserves the historic startup-time binding check.
    const preflight: any = await intelligenceRuntime.preflightSelection({ requestedModel: null, requestedOptions: {} });
    // Preflight resolves the canonical provider/model route after the kernel
    // has started. Bind that exact admitted plan before exposing the session;
    // otherwise the kernel can be healthy while advertising null provider and
    // model configuration and the first operator turn has no active binding.
    const startupPlan: any = preflight?.plan
      ?? (preflight?.schema === 'narada.invokable-intelligence.invocation-plan.v2' ? preflight : null);
    if (!startupPlan || typeof startupPlan !== 'object' || Array.isArray(startupPlan)) {
      throw new Error('intelligence_preflight_plan_missing');
    }
    const expectedStartupBinding: any = startupPlan.selected;
    if (!expectedStartupBinding || typeof expectedStartupBinding !== 'object' || Array.isArray(expectedStartupBinding)
      || !publicResourceId(expectedStartupBinding.inference_provider)
      || !publicResourceId(expectedStartupBinding.model)) {
      throw new Error('intelligence_preflight_plan_binding_missing');
    }
    if (typeof intelligenceRuntime.kernel?.reconfigure !== 'function') {
      throw new Error('intelligence_kernel_start_binding_unsupported');
    }
    const startupKernelBinding: any = await intelligenceRuntime.kernel.reconfigure({ admitted_plan: startupPlan });
    if (startupKernelBinding?.accepted !== true
      || publicResourceId(startupKernelBinding.active?.provider) !== publicResourceId(expectedStartupBinding.inference_provider)
      || publicResourceId(startupKernelBinding.active?.model) !== publicResourceId(expectedStartupBinding.model)) {
      throw new Error(`intelligence_kernel_start_binding_refused:${startupKernelBinding?.reason ?? 'unknown'}`);
    }
    intelligenceController.primePreflight(preflight);
    const runtimeService: any = createSessionCoreRuntimeService({
      runtimeContext,
      intelligenceRuntime: intelligenceController,
      toolGateway: capabilityGateway,
      admitCapability,
      onAuthorityHeartbeat: sessionAuthority
        ? (options: any) => sessionAuthority.heartbeat(options)
        : null,
      onAuthorityClose: sessionAuthority
        ? async (options: any) => {
          try {
            return await sessionAuthority.close(options);
          } finally {
            sessionAuthority.dispose();
          }
        }
        : null,
    });
    sessionCoreForArtifacts = runtimeService.supervisor.core;
    appendRuntimeEvent = (event: any) => runtimeService.supervisor.core.appendEvent(toSessionCoreEvent(event));
    for (const event of pendingRuntimeEvents.splice(0)) appendRuntimeEvent(event);
    return runtimeService;
  } catch (error) {
    try {
      await sessionAuthority?.fail({
        reason: 'runtime_start_failed',
        evidence: { error: error instanceof Error ? error.message : String(error) },
      });
    } catch {
      // Preserve the original runtime startup error.
    } finally {
      sessionAuthority?.dispose?.();
    }
    await intelligenceRuntime?.close?.();
    await capabilityGateway?.close?.();
    throw error;
  }
}

function parseHealthOptions(args: any, env: any = process.env) {
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

function parseSiteConfigEnv(value: any) {
  if (!value) return null;
  try {
    const parsed: any = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function compactHealthForHttp(health: any) {
  if (!health || typeof health !== 'object') return health;
  const {
    mcp_tools: _mcpTools,
    operator_affordances: _operatorAffordances,
    affordance_document: _affordanceDocument,
    ...compact
  }: any = health;
  if (health.mcp && typeof health.mcp === 'object') {
    const { tools: _tools, ...mcp }: any = health.mcp;
    compact.mcp = mcp;
  }
  return compact;
}

function startHealthProjection({ childStdin, host, port, timeoutMs = 2000, runtimeContext, sessionSupervisor = null, onRequestTransition = () => {} }: any) {
  const pending: any = new Map();
  let sequence: any = 0;
  const requestHealth: any = async () => {
    sequence += 1;
    const requestId: any = `http-health-${Date.now()}-${sequence}`;
    const requestState: any = createNarsHealthProjectionRequestStateMachine({
      requestId,
      metadata: { transport: 'http', endpoint: '/health' },
      onTransition: onRequestTransition,
    });
    requestState.transition('requested');
    const stdin: any = typeof childStdin === 'function' ? childStdin() : childStdin;
    if (!sessionSupervisor && !stdin?.writable) {
      requestState.transition('failed', { error: 'child_stdin_unavailable' });
      throw new Error('child_stdin_unavailable');
    }
    requestState.transition('dispatched');
    if (sessionSupervisor) {
      requestState.transition('awaiting_response');
      try {
        const health: any = await sessionSupervisor.health();
        requestState.transition('resolved');
        return health;
      } catch (error) {
        requestState.transition('failed', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    const responsePromise: any = new Promise((resolve: any, reject: any) => {
      const timer: any = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('session_health_timeout'));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer, requestState });
    });
    requestState.transition('awaiting_response');
    try {
      stdin.write(`${JSON.stringify({ id: requestId, method: 'session.health', params: {} })}\n`);
      const health: any = await responsePromise;
      requestState.transition('resolved');
      return health;
    } catch (error) {
      const entry: any = pending.get(requestId);
      if (entry) {
        pending.delete(requestId);
        clearTimeout(entry.timer);
      }
      const errorMessage = error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : String(error);
      const nextState: any = errorMessage === 'session_health_timeout' ? 'timed_out' : 'failed';
      requestState.transition(nextState, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  const server: any = createServer(async (request: any, response: any) => {
    if (await handleArtifactHttpRequest({ request, response, runtimeContext })) return;
    const url: any = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
    if (request.method !== 'GET' || url.pathname !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ error: 'not_found' })}\n`);
      return;
    }
    try {
      const health: any = await requestHealth();
      const responseHealth: any = url.searchParams.get('detail') === 'full' ? health : compactHealthForHttp(health);
      response.writeHead(health.status === 'unhealthy' ? 503 : 200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify(responseHealth)}\n`);
    } catch (error) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ schema: 'narada.nars.health.v1', status: 'unhealthy', error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
  return new Promise((resolve: any, reject: any) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address: any = server.address();
      const boundPort: any = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}/health`,
        observe(event: any) {
          if (event?.event !== 'session_health' || !pending.has(event.request_id)) return;
          const entry: any = pending.get(event.request_id);
          pending.delete(event.request_id);
          clearTimeout(entry.timer);
          entry.resolve(event);
        },
        rejectAll(error: any) {
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

function renderWrapperEvents({ event, wrapperEventsJsonl, state }: any) {
  if (wrapperEventsJsonl) {
    const statusEvent: any = formatWrapperStatusEvent(event);
    if (statusEvent) console.error(JSON.stringify(statusEvent));
  }
  const summary: any = formatStartupMcpSummary(event);
  if (summary && !state.startupSummaryPrinted) {
    console.error(summary);
    if (wrapperEventsJsonl) {
      const wrapperEvent: any = formatStartupMcpEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.startupSummaryPrinted = true;
  }
  const runtimeFaultSummary: any = formatRuntimeMcpFaultSummary(event);
  if (runtimeFaultSummary && !state.runtimeFaultSummaries.has(runtimeFaultSummary)) {
    console.error(runtimeFaultSummary);
    if (wrapperEventsJsonl) {
      const wrapperEvent: any = formatRuntimeMcpFaultEvent(event);
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
}: any) {
  healthProjection?.observe(event);
  const durableSequence: any = Number(event?.event_sequence ?? event?.sequence);
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
  const requestedArgs: any = process.argv.slice(2);
  const wrapperEventsJsonl: any = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl: any = requestedArgs.includes('--raw-jsonl');
  const parsedHealth: any = parseHealthOptions(requestedArgs.filter((arg: any) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl'));
  const parsedEvents: any = parseEventStreamOptions(parsedHealth.forwardedArgs);
  const args: any = parsedEvents.forwardedArgs;
  const operatorSurfaceKind: any = valueAfterFlag(args, '--operator-surface') ?? process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli';
  const lifecycleBinding: any = lifecycleBindingFromArgs(args, process.env);
  const delegatedAuthorityHandoff: any = createDelegatedAuthorityHandoff({ args, env: process.env, binding: lifecycleBinding });
  const launchProcessContext: any = {
    launchSessionId: process.env.NARADA_LAUNCH_SESSION_ID ?? null,
    processOwnership: process.env.NARADA_PROCESS_OWNERSHIP ?? null,
    processRole: process.env.NARADA_PROCESS_ROLE ?? null,
    // Direct launches still have a real launcher boundary: the operating
    // system parent is the creator when no governed launcher supplied an
    // explicit PID. Keep the evidence observed rather than inventing a
    // catalog-side launcher resource.
    createdByPid: process.env.NARADA_CREATED_BY_PID ?? (process.ppid > 0 ? String(process.ppid) : null),
  };
  const eventHub: any = createEventHub();
  const runtimeHost: any = createNarsRuntimeHostStateMachine({
    metadata: {
      agent_id: lifecycleBinding.agent_id,
      session_id: lifecycleBinding.session_id,
      site_root: lifecycleBinding.metadata.site_root,
    },
    onTransition: (event: any) => eventHub.publish(event),
  });
  let lifecycleDispatcher: any;
  try {
    lifecycleDispatcher = await loadNarsLifecycleHookDispatcher({ args, env: process.env });
    const result: any = await dispatchNarsLifecycleHook(lifecycleDispatcher, 'beforeSessionBind', lifecycleBinding);
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
  let healthProjection: any = null;
  let healthRuntimeContext: any = null;
  let eventStreamProjection: any = null;
  const runtimeInput: any = new PassThrough();
  const runtimeOutput: any = new PassThrough();
  let preliminaryRuntimeContext: any;
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
        onRequestTransition: (transition: any) => {
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

  let runtimeContext: any;
  let runtimeService: any;
  let controlInputBridge: any = null;
  try {
    // Launch transports only explicit Site/principal/request context. Runtime
    // provider/model selection occurs per invocation through the canonical
    // registry and gateway; no provider binding or startup-time plan exists.
    const siteIdForLoci: any = agentIdentitySiteId(lifecycleBinding.agent_identity_ref) ?? process.env.NARADA_SITE_ID ?? null;
    const canonicalSiteId: any = (value: any) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      const id: any = value.trim();
      return id.startsWith('site:') ? id : `site:${id}`;
    };
    const targetSiteId: any = canonicalSiteId(process.env.NARADA_INTELLIGENCE_TARGET_SITE) ?? canonicalSiteId(siteIdForLoci);
    const userSiteId: any = canonicalSiteId(process.env.NARADA_INTELLIGENCE_USER_SITE);
    const hostSiteId: any = canonicalSiteId(process.env.NARADA_INTELLIGENCE_HOST_SITE);
    const loci: any = {
      targetSite: { kind: 'site', id: targetSiteId },
      userSite: { kind: 'site', id: userSiteId },
      hostSite: { kind: 'site', id: hostSiteId },
    };
    if (!loci.targetSite.id || !loci.userSite.id || !loci.hostSite.id) {
      throw new Error('intelligence_site_context_required');
    }
    const registryDbPath: any = process.env.NARADA_INTELLIGENCE_REGISTRY_DB?.trim() || null;
    const principal: any = process.env.NARADA_INTELLIGENCE_PRINCIPAL_ID?.trim() || null;
    if (!principal) throw new Error('intelligence_principal_required');
    const principalBinding: any = parseSiteConfigEnv(process.env.NARADA_INTELLIGENCE_PRINCIPAL_BINDING);

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
        principalBinding,
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
      onError: (error: any, _line: any, diagnostic: any) => {
        const message: any = error instanceof Error ? error.message : String(error ?? 'unknown_error');
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
  let shutdownSignal: any = null;
  let projectionClosureGuard: { arm(): void; disarm(): void } | null = null;
  const requestGracefulShutdown: any = (signal: any) => {
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
  const onSigint: any = () => requestGracefulShutdown('SIGINT');
  const onSigterm: any = () => requestGracefulShutdown('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  projectionClosureGuard = bindRuntimeProjectionClosure({
    healthProjection,
    eventStreamProjection,
    runtimeHost,
    requestShutdown: requestGracefulShutdown,
  });
  projectionClosureGuard.arm();

  const state: any = {
    startupSummaryPrinted: false,
    runtimeFaultSummaries: new Set(),
    projectionFailureSummaries: new Set(),
    outputFailureSummaries: new Set(),
    workflowSummaries: new Set(),
  };
  let stdoutBuffer: any = '';
  let writeProjectedOutput: any = (text: any) => process.stdout.write(text);
  let renderProjectedEvent: any = () => [];
  let projectedTerminal: any = null;
  const useInteractiveTerminalProjection: any = shouldUseInteractiveTerminalProjection({
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
  let runtimeOutputFailure: any = null;
  let exitCode: any = 0;
  let lifecycleDispatchTail: any = Promise.resolve();
  const dispatchLifecycleEvent: any = (event: any) => {
    lifecycleDispatchTail = lifecycleDispatchTail
      .then(() => dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event))
      .then((result: any) => {
        for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
      })
      .catch((error: any) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
    return lifecycleDispatchTail;
  };
  const reportRuntimeOutputFailure: any = (error: any, line: any, errorCode: any = null) => {
    const code: any = errorCode
      ?? (error instanceof SyntaxError ? 'runtime_output_invalid_json' : 'runtime_output_handler_failed');
    const failure: any = {
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
  runtimeOutput.on('data', (chunk: any) => {
    const text: any = String(chunk);
    if (rawJsonl) process.stdout.write(text);
    stdoutBuffer += text;
    while (true) {
      const newlineIndex: any = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line: any = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event: any = JSON.parse(line);
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
    projectionClosureGuard?.disarm();
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

function closeServer(server: any) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve: any) => server.close(resolve));
}

function bindRuntimeProjectionClosure({
  healthProjection,
  eventStreamProjection,
  runtimeHost,
  requestShutdown,
}: any): { arm(): void; disarm(): void } {
  let armed = false;
  const bindings = [
    ['health', healthProjection?.server],
    ['events', eventStreamProjection?.server],
  ].flatMap(([kind, server]: any[]) => {
    if (!server || typeof server.on !== 'function' || typeof server.off !== 'function') return [];
    const onClose = () => {
      if (!armed || !['projections_ready', 'serving'].includes(runtimeHost?.state)) return;
      requestShutdown(`PROJECTION_${String(kind).toUpperCase()}_CLOSED`);
    };
    server.on('close', onClose);
    return [{ server, onClose }];
  });
  return {
    arm() {
      armed = true;
    },
    disarm() {
      armed = false;
      for (const binding of bindings) binding.server.off('close', binding.onClose);
    },
  };
}

async function closeProjections({ healthProjection, eventStreamProjection }: any = {}) {
  eventStreamProjection?.closeConnections?.();
  await closeServer(healthProjection?.server);
  await closeServer(eventStreamProjection?.server);
}

export {
  parseHealthOptions,
  parseEventStreamOptions,
  loadRuntimeDependencies,
  localExecutionEvidence,
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
  bindRuntimeProjectionClosure,
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
