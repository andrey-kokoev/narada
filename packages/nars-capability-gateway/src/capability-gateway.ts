type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  PcSiteSurfaceServiceClient,
  pcSiteSurfaceAuthorityRef,
} from '@narada-core/pc-site-surface-service';

import {
  applyWorkerMcpProjection,
  aggregateToolBindings,
  discoverAndStartMcpServers,
  findToolBinding,
  getMcpStartupFailures,
  sendMcpRequest,
} from './mcp-runtime.js';
import {
  assertNarsCapabilityGatewayTransition,
  assertNarsToolExecutionTransition,
  isNarsToolExecutionTerminalState,
  NARS_CAPABILITY_GATEWAY_STATE_SCHEMA,
  NARS_TOOL_EXECUTION_STATE_SCHEMA,
} from './capability-state.js';

function defaultAdmission(): AnyRecord {
  return { admitted: true, reason: 'gateway_default_admission' };
}

function defaultRecordEvidence(..._args: any[]): void {}

async function closeOwnedProcess(owner: any, timeoutMs: number = 5000): Promise<void> {
  const child = owner?.child ?? owner;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`mcp_child_exit_timeout:${child.pid ?? 'unknown'}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onExit = () => { cleanup(); resolve(); };
    const onError = (error: any) => { cleanup(); reject(error); };
    child.once('exit', onExit);
    child.once('error', onError);
  });
  if (typeof owner?.terminateTree === 'function') owner.terminateTree('mcp_gateway_close');
  else child.kill();
  await exited;
}

async function defaultCloseMcpServers(mcpServers: AnyRecord): Promise<void> {
  await Promise.all(Object.values(mcpServers ?? {}).map((server: any) => closeOwnedProcess(server?.process)));
}

export function createNarsCapabilityGateway(options: AnyRecord = {}): AnyRecord {
  const {
    siteRoot,
    ownershipContext = {},
    admit = defaultAdmission,
    recordEvidence: recordEvidenceFn = defaultRecordEvidence,
    dependencies = {},
    now = () => new Date().toISOString(),
  } = options;
  if (typeof siteRoot !== 'string' || !siteRoot.trim()) {
    throw new Error('nars_capability_gateway_site_root_required');
  }
  const gatewaySessionId = String(
    options.carrierSessionId
    ?? ownershipContext.carrier_session_id
    ?? process.env.NARADA_CARRIER_SESSION_ID
    ?? process.env.NARADA_NARS_SESSION_ID
    ?? `nars-${randomUUID()}`
  );
  let surfaceServiceConnection: Promise<AnyRecord> | null = null;

  const defaultDispatchAdmittedTool = async ({ binding, arguments: args, requestId, abortSignal, admission, execution }: AnyRecord) => {
    if (binding.server.execution_adapter !== 'surface_factory') {
      return (dependencies.sendMcpRequest ?? sendMcpRequest)(binding.server, {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: binding.tool.runtime_tool_name ?? binding.tool.name,
          arguments: args,
        },
      }, abortSignal);
    }

    surfaceServiceConnection ??= connectPcSiteSurfaceService({ siteRoot, options, dependencies, binding });
    const connection = await surfaceServiceConnection;
    const projection = binding.server.surface_projection;
    const surfaceId = requiredText(projection?.surface_id, 'nars_surface_factory_surface_id_required');
    const toolName = requiredText(binding.tool.runtime_tool_name ?? binding.tool.name, 'nars_surface_factory_tool_name_required');
    const authorityRef = pcSiteSurfaceAuthorityRef(connection.site_id);
    const outcome = await connection.client.invoke({
      site_id: connection.site_id,
      authority_ref: authorityRef,
      carrier_session_id: gatewaySessionId,
      carrier_id: String(options.carrierId ?? process.env.NARADA_CARRIER_ID ?? 'nars'),
      agent_id: String(options.agentId ?? process.env.NARADA_AGENT_ID ?? 'nars-agent'),
      surface_id: surfaceId,
      projection_id: requiredText(projection?.projection_id, 'nars_surface_factory_projection_id_required'),
      tool_name: toolName,
      arguments: args ?? {},
      request_id: String(requestId),
      admission: {
        decision: 'admitted',
        decision_ref: String(admission?.decision_ref ?? execution?.execution_id ?? `nars-request-${requestId}`),
        authority_ref: authorityRef,
        surface_id: surfaceId,
        tool_name: toolName,
        reason: String(admission?.reason ?? 'nars_capability_gateway_admitted'),
      },
    }, abortSignal);
    if (outcome.status !== 'ok') {
      throw new Error(`${String(outcome.error?.code ?? 'mcp_surface_factory_call_failed')}:${String(outcome.error?.message ?? outcome.status)}`);
    }
    return outcome.result;
  };

  const runtime = {
    discoverAndStartMcpServers: dependencies.discoverAndStartMcpServers ?? discoverAndStartMcpServers,
    applyWorkerMcpProjection: dependencies.applyWorkerMcpProjection ?? applyWorkerMcpProjection,
    aggregateToolBindings: dependencies.aggregateToolBindings ?? aggregateToolBindings,
    findToolBinding: dependencies.findToolBinding ?? findToolBinding,
    sendMcpRequest: dependencies.sendMcpRequest ?? sendMcpRequest,
    dispatchAdmittedTool: dependencies.dispatchAdmittedTool ?? defaultDispatchAdmittedTool,
    closeMcpServers: dependencies.closeMcpServers ?? defaultCloseMcpServers,
  };
  let mcpServers: AnyRecord | null = null;
  let lifecycleState = 'idle';
  let startPromise: Promise<any> | null = null;
  let closePromise: Promise<any> | null = null;
  let nextRequestId = 1;
  let nextExecutionId = 1;
  const executions = new Map<string, AnyRecord>();

  function publicOperationalState(state = lifecycleState) {
    return state === 'degraded' ? 'startup_degraded' : state;
  }

  async function transitionGateway(nextState: string, evidence: AnyRecord = {}): Promise<string> {
    const previousState = lifecycleState;
    assertNarsCapabilityGatewayTransition(previousState, nextState);
    lifecycleState = nextState;
    await recordEvidenceFn({
      kind: 'capability_gateway_lifecycle_transition',
      schema: NARS_CAPABILITY_GATEWAY_STATE_SCHEMA,
      previous_state: previousState,
      lifecycle_state: nextState,
      operational_state: publicOperationalState(nextState),
      ...evidence,
    });
    return nextState;
  }

  async function start(): Promise<any> {
    if (lifecycleState === 'healthy' || lifecycleState === 'degraded') return toolCatalog();
    if (lifecycleState === 'starting') return startPromise;
    if (lifecycleState === 'closing' || lifecycleState === 'closed') {
      throw new Error(`nars_capability_gateway_not_startable:${lifecycleState}`);
    }

    const running = (async () => {
      try {
        await transitionGateway('starting', { reason: 'start_requested' });
        const discoveredMcpServers = await runtime.discoverAndStartMcpServers(siteRoot, ownershipContext);
        mcpServers = runtime.applyWorkerMcpProjection(discoveredMcpServers);
        const startupFailures = getMcpStartupFailures(mcpServers);
        await transitionGateway(startupFailures.length > 0 ? 'degraded' : 'healthy', {
          reason: 'start_completed',
          server_count: Object.keys(mcpServers ?? {}).length,
          startup_failure_count: startupFailures.length,
        });
        return toolCatalog();
      } catch (error) {
        mcpServers = null;
        if (lifecycleState === 'starting') {
          try {
            await transitionGateway('failed', {
              reason: 'start_failed',
              error: errorMessage(error),
            });
          } catch {
            // Preserve the original startup error if evidence recording also fails.
          }
        }
        throw error;
      }
    })();
    startPromise = running;
    try {
      return await running;
    } finally {
      if (startPromise === running) startPromise = null;
    }
  }

  function toolCatalog(): AnyRecord[] {
    return runtime.aggregateToolBindings(mcpServers ?? {}).map(({ serverName, tool, providerToolName }: AnyRecord) => ({
      server_name: serverName,
      tool_name: tool.name,
      provider_tool_name: providerToolName,
      input_schema: tool.inputSchema ?? tool.input_schema ?? null,
    }));
  }

  async function invoke(options: AnyRecord = {}): Promise<any> {
    const { toolName, arguments: args = {}, abortSignal = null, turnId = null, inputEventId = null } = options;
    const attempt = createToolExecution({ toolName, turnId, inputEventId });
    await transitionToolExecution(attempt, 'requested');

    if (lifecycleState === 'closing' || lifecycleState === 'closed') {
      const refused = await transitionToolExecution(attempt, 'refused', { reason: `gateway_${lifecycleState}` });
      await recordTerminalEvidence(refused, 'tool_execution_refused', { reason: `gateway_${lifecycleState}` });
      return { status: 'refused', reason: `gateway_${lifecycleState}`, execution_id: refused.execution_id };
    }

    try {
      if (!mcpServers) await start();
    } catch (error) {
      const failed = await transitionToolExecution(attempt, 'failed', { error: errorMessage(error), reason: 'gateway_start_failed' });
      await recordTerminalEvidence(failed, 'tool_execution_failed', { error: errorMessage(error) });
      throw error;
    }

    const binding = runtime.findToolBinding(toolName, mcpServers ?? {});
    if (!binding) {
      const refused = await transitionToolExecution(attempt, 'refused', { reason: 'tool_not_found' });
      await recordTerminalEvidence(refused, 'tool_execution_refused', { reason: 'tool_not_found' });
      return { status: 'refused', reason: 'tool_not_found', execution_id: refused.execution_id };
    }

    let admission;
    try {
      admission = await admit({
        toolName: binding.tool.name,
        tool: binding.tool,
        server: binding.server,
        arguments: args,
        turnId: attempt.turn_id,
        inputEventId: attempt.input_event_id,
      });
    } catch (error) {
      const failed = await transitionToolExecution(attempt, 'failed', { error: errorMessage(error), reason: 'admission_failed' });
      await recordTerminalEvidence(failed, 'tool_execution_failed', { error: errorMessage(error) });
      throw error;
    }

    if (admission?.admitted === false) {
      const refused = await transitionToolExecution(attempt, 'refused', {
        server_name: binding.server.name ?? null,
        admission,
        reason: admission.reason ?? 'admission_refused',
      });
      await recordTerminalEvidence(refused, 'tool_execution_refused', { admission });
      return { status: 'refused', admission, execution_id: refused.execution_id };
    }

    await transitionToolExecution(attempt, 'admitted', {
      server_name: binding.server.name ?? null,
      admission,
    });
    const requestId = nextRequestId++;
    await transitionToolExecution(attempt, 'executing', { request_id: requestId });

    let result;
    try {
      result = await runtime.dispatchAdmittedTool({
        siteRoot,
        binding,
        arguments: args,
        requestId,
        abortSignal,
        admission,
        execution: { ...attempt },
      });
    } catch (error) {
      const interrupted = Boolean(abortSignal?.aborted) || /abort|cancel|interrupt/i.test(errorMessage(error));
      const terminalState = interrupted ? 'interrupted' : 'failed';
      const terminal = await transitionToolExecution(attempt, terminalState, {
        request_id: requestId,
        error: errorMessage(error),
      });
      await recordTerminalEvidence(terminal, interrupted ? 'tool_execution_interrupted' : 'tool_execution_failed', {
        request_id: requestId,
        error: errorMessage(error),
      });
      return {
        status: terminalState,
        error: errorMessage(error),
        admission,
        execution_id: terminal.execution_id,
      };
    }

    const completed = await transitionToolExecution(attempt, 'completed', { request_id: requestId });
    await recordTerminalEvidence(completed, 'tool_execution_completed', { request_id: requestId, admission });
    return { status: 'completed', result, admission, execution_id: completed.execution_id };
  }

  async function close(): Promise<void> {
    if (closePromise) return closePromise;
    if (lifecycleState === 'closed') return;

    const closing = (async () => {
      if (lifecycleState === 'starting' && startPromise) {
        try {
          await startPromise;
        } catch {
          // A failed start is closed below as a terminal gateway cleanup.
        }
      }
      if (lifecycleState === 'closed') return;
      if (lifecycleState === 'idle' || lifecycleState === 'failed') {
        mcpServers = null;
        await transitionGateway('closed', { reason: 'close_requested' });
        return;
      }
      if (lifecycleState !== 'healthy' && lifecycleState !== 'degraded') return;

      const serversToClose = mcpServers;
      mcpServers = null;
      await transitionGateway('closing', {
        reason: 'close_requested',
        server_count: Object.keys(serversToClose ?? {}).length,
      });
      try {
        await runtime.closeMcpServers(serversToClose);
        if (surfaceServiceConnection) {
          try {
            const connection = await surfaceServiceConnection;
            if (typeof connection.client.releaseSession === 'function') {
              await connection.client.releaseSession(gatewaySessionId);
            }
          } catch (error) {
            await recordEvidenceFn({
              kind: 'surface_service_session_release_failed',
              carrier_session_id: gatewaySessionId,
              error: errorMessage(error),
            });
          }
        }
        await transitionGateway('closed', { reason: 'close_completed' });
      } catch (error) {
        try {
          await transitionGateway('failed', { reason: 'close_failed', error: errorMessage(error) });
        } catch {
          // Preserve the close failure if evidence recording also fails.
        }
        throw error;
      }
    })();
    closePromise = closing;
    try {
      return await closing;
    } finally {
      if (closePromise === closing) closePromise = null;
    }
  }

  function stateSnapshot(): AnyRecord {
    const startupFailures = getMcpStartupFailures(mcpServers);
    const activeExecutions = [...executions.values()].filter((execution: AnyRecord) => !isNarsToolExecutionTerminalState(execution.execution_state));
    return {
      schema: NARS_CAPABILITY_GATEWAY_STATE_SCHEMA,
      lifecycle_state: lifecycleState,
      operational_state: publicOperationalState(),
      server_count: Object.keys(mcpServers ?? {}).length,
      startup_failure_count: startupFailures.length,
      active_execution_count: activeExecutions.length,
      execution_count: executions.size,
    };
  }

  function createToolExecution({ toolName, turnId, inputEventId }: AnyRecord): AnyRecord {
    const execution = {
      schema: NARS_TOOL_EXECUTION_STATE_SCHEMA,
      execution_id: `tool_execution_${nextExecutionId++}`,
      turn_id: turnId ?? null,
      input_event_id: inputEventId ?? null,
      tool_name: toolName ?? null,
      execution_state: null,
      terminal_state: null,
      updated_at: now(),
    };
    executions.set(execution.execution_id, execution);
    return execution;
  }

  async function transitionToolExecution(attempt: AnyRecord, nextState: string, evidence: AnyRecord = {}): Promise<AnyRecord> {
    const previousState = attempt.execution_state;
    assertNarsToolExecutionTransition(previousState, nextState);
    const next: AnyRecord = {
      ...attempt,
      ...evidence,
      execution_state: nextState,
      terminal_state: isNarsToolExecutionTerminalState(nextState) ? nextState : null,
      updated_at: now(),
    };
    Object.assign(attempt, next);
    executions.set(attempt.execution_id, next);
    await recordEvidenceFn({
      kind: 'tool_execution_state_transition',
      schema: NARS_TOOL_EXECUTION_STATE_SCHEMA,
      execution_id: next.execution_id,
      turn_id: next.turn_id,
      input_event_id: next.input_event_id,
      tool_name: next.tool_name,
      server_name: next.server_name ?? null,
      previous_state: previousState,
      execution_state: nextState,
      terminal_state: next.terminal_state,
      ...evidence,
    });
    return next;
  }

  async function recordTerminalEvidence(attempt: AnyRecord, kind: string, evidence: AnyRecord = {}): Promise<void> {
    await recordEvidenceFn({
      kind,
      schema: NARS_TOOL_EXECUTION_STATE_SCHEMA,
      execution_id: attempt.execution_id,
      turn_id: attempt.turn_id,
      input_event_id: attempt.input_event_id,
      tool_name: attempt.tool_name,
      server_name: attempt.server_name ?? null,
      execution_state: attempt.execution_state,
      terminal_state: attempt.terminal_state,
      reason: attempt.reason ?? null,
      ...evidence,
    });
  }

  function execution(executionId: any): AnyRecord | null {
    const value = executions.get(String(executionId));
    return value ? { ...value } : null;
  }

  return Object.freeze({
    start,
    toolCatalog,
    invoke,
    close,
    state: stateSnapshot,
    lifecycleState: () => lifecycleState,
    operationalState: () => publicOperationalState(),
    execution,
    executions: () => [...executions.values()].map((value) => ({ ...value })),
  });
}

export function resolvePcSiteSurfaceServiceRoot({ siteRoot, options = {}, binding, environment = process.env }: AnyRecord): string {
  const server = binding?.server ?? {};
  const config = server.config ?? {};
  const authorityLocus = config.narada_scope?.authority_locus
    ?? config.authority_locus
    ?? server.narada_scope?.authority_locus
    ?? server.authority_locus;
  const authoritySiteRoot = authorityLocus?.kind === 'user_site' ? authorityLocus.site_root : null;
  return resolve(String(options.pcSiteRoot ?? environment.NARADA_PC_SITE_ROOT ?? authoritySiteRoot ?? siteRoot));
}

async function connectPcSiteSurfaceService({ siteRoot, options, dependencies, binding }: AnyRecord): Promise<AnyRecord> {
  if (dependencies.surfaceServiceClient) {
    return {
      client: dependencies.surfaceServiceClient,
      site_id: requiredText(dependencies.surfaceServiceSiteId ?? options.siteId, 'nars_surface_service_site_id_required'),
    };
  }
  const pcSiteRoot = resolvePcSiteSurfaceServiceRoot({ siteRoot, options, binding });
  const stateRoot = resolve(String(
    options.surfaceServiceStateRoot
    ?? process.env.NARADA_PC_SITE_SURFACE_SERVICE_STATE_ROOT
    ?? join(pcSiteRoot, '.narada', 'runtime', 'mcp-surface-service')
  ));
  const [state, registry, token] = await Promise.all([
    readJson(join(stateRoot, 'state.json'), 'nars_surface_service_state_unavailable'),
    readJson(join(pcSiteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), 'nars_surface_service_registry_unavailable'),
    readFile(join(stateRoot, 'token'), 'utf8').then((value) => value.trim()),
  ]);
  const siteId = requiredText(registry.site_id, 'nars_surface_service_site_id_required');
  if (state.site_id !== siteId) throw new Error('nars_surface_service_state_site_mismatch');
  const url = requiredText(options.surfaceServiceUrl ?? process.env.NARADA_PC_SITE_SURFACE_SERVICE_URL ?? state.url, 'nars_surface_service_url_required');
  if (!token) throw new Error('nars_surface_service_token_empty');
  const createClient = dependencies.createSurfaceServiceClient
    ?? ((input: { url: string; token: string }) => new PcSiteSurfaceServiceClient(input));
  return { client: createClient({ url, token }), site_id: siteId };
}

async function readJson(path: string, code: string): Promise<AnyRecord> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AnyRecord;
  } catch (error) {
    throw new Error(`${code}:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredText(value: unknown, code: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(code);
  return text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
