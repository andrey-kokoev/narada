import {
  aggregateToolBindings,
  discoverAndStartMcpServers,
  findToolBinding,
  getMcpStartupFailures,
  sendMcpRequest,
} from './mcp-runtime.mjs';
import {
  assertNarsCapabilityGatewayTransition,
  assertNarsToolExecutionTransition,
  isNarsToolExecutionTerminalState,
  NARS_CAPABILITY_GATEWAY_STATE_SCHEMA,
  NARS_TOOL_EXECUTION_STATE_SCHEMA,
} from './capability-state.mjs';

function defaultAdmission() {
  return { admitted: true, reason: 'gateway_default_admission' };
}

function defaultRecordEvidence() {}

async function closeOwnedProcess(owner, timeoutMs = 5000) {
  const child = owner?.child ?? owner;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve, reject) => {
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
    const onError = (error) => { cleanup(); reject(error); };
    child.once('exit', onExit);
    child.once('error', onError);
  });
  if (typeof owner?.terminateTree === 'function') owner.terminateTree('mcp_gateway_close');
  else child.kill();
  await exited;
}

async function defaultCloseMcpServers(mcpServers) {
  await Promise.all(Object.values(mcpServers ?? {}).map((server) => closeOwnedProcess(server?.process)));
}

export function createNarsCapabilityGateway({
  siteRoot,
  ownershipContext = {},
  admit = defaultAdmission,
  recordEvidence: recordEvidenceFn = defaultRecordEvidence,
  dependencies = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof siteRoot !== 'string' || !siteRoot.trim()) {
    throw new Error('nars_capability_gateway_site_root_required');
  }

  const runtime = {
    discoverAndStartMcpServers: dependencies.discoverAndStartMcpServers ?? discoverAndStartMcpServers,
    aggregateToolBindings: dependencies.aggregateToolBindings ?? aggregateToolBindings,
    findToolBinding: dependencies.findToolBinding ?? findToolBinding,
    sendMcpRequest: dependencies.sendMcpRequest ?? sendMcpRequest,
    closeMcpServers: dependencies.closeMcpServers ?? defaultCloseMcpServers,
  };
  let mcpServers = null;
  let lifecycleState = 'idle';
  let startPromise = null;
  let closePromise = null;
  let nextRequestId = 1;
  let nextExecutionId = 1;
  const executions = new Map();

  function publicOperationalState(state = lifecycleState) {
    return state === 'degraded' ? 'startup_degraded' : state;
  }

  async function transitionGateway(nextState, evidence = {}) {
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

  async function start() {
    if (lifecycleState === 'healthy' || lifecycleState === 'degraded') return toolCatalog();
    if (lifecycleState === 'starting') return startPromise;
    if (lifecycleState === 'closing' || lifecycleState === 'closed') {
      throw new Error(`nars_capability_gateway_not_startable:${lifecycleState}`);
    }

    const running = (async () => {
      try {
        await transitionGateway('starting', { reason: 'start_requested' });
        mcpServers = await runtime.discoverAndStartMcpServers(siteRoot, ownershipContext);
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

  function toolCatalog() {
    return runtime.aggregateToolBindings(mcpServers ?? {}).map(({ serverName, tool, providerToolName }) => ({
      server_name: serverName,
      tool_name: tool.name,
      provider_tool_name: providerToolName,
      input_schema: tool.inputSchema ?? tool.input_schema ?? null,
    }));
  }

  async function invoke({ toolName, arguments: args = {}, abortSignal = null, turnId = null, inputEventId = null } = {}) {
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
      result = await runtime.sendMcpRequest(binding.server, {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: binding.tool.runtime_tool_name ?? binding.tool.name,
          arguments: args,
        },
      }, abortSignal);
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

  async function close() {
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

  function stateSnapshot() {
    const startupFailures = getMcpStartupFailures(mcpServers);
    const activeExecutions = [...executions.values()].filter((execution) => !isNarsToolExecutionTerminalState(execution.execution_state));
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

  function createToolExecution({ toolName, turnId, inputEventId }) {
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

  async function transitionToolExecution(attempt, nextState, evidence = {}) {
    const previousState = attempt.execution_state;
    assertNarsToolExecutionTransition(previousState, nextState);
    const next = {
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

  async function recordTerminalEvidence(attempt, kind, evidence = {}) {
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

  function execution(executionId) {
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
