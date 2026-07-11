import {
  aggregateToolBindings,
  discoverAndStartMcpServers,
  findToolBinding,
  sendMcpRequest,
} from './mcp-runtime.mjs';

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
  recordEvidence = defaultRecordEvidence,
  dependencies = {},
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
  let operationalState = 'idle';
  let nextRequestId = 1;
  let closePromise = null;

  async function start() {
    if (!mcpServers) {
      operationalState = 'starting';
      try {
        mcpServers = await runtime.discoverAndStartMcpServers(siteRoot, ownershipContext);
        operationalState = 'healthy';
      } catch (error) {
        operationalState = 'failed';
        throw error;
      }
    }
    return toolCatalog();
  }

  function toolCatalog() {
    return runtime.aggregateToolBindings(mcpServers ?? {}).map(({ serverName, tool, providerToolName }) => ({
      server_name: serverName,
      tool_name: tool.name,
      provider_tool_name: providerToolName,
      input_schema: tool.inputSchema ?? tool.input_schema ?? null,
    }));
  }

  async function invoke({ toolName, arguments: args = {}, abortSignal = null } = {}) {
    if (!mcpServers) await start();
    const binding = runtime.findToolBinding(toolName, mcpServers);
    if (!binding) {
      const evidence = { kind: 'tool_execution_refused', tool_name: toolName ?? null, reason: 'tool_not_found' };
      await recordEvidence(evidence);
      return { status: 'refused', reason: 'tool_not_found' };
    }

    const admission = await admit({ toolName: binding.tool.name, tool: binding.tool, server: binding.server, arguments: args });
    if (admission?.admitted === false) {
      const evidence = { kind: 'tool_execution_refused', tool_name: binding.tool.name, server_name: binding.server.name ?? null, admission };
      await recordEvidence(evidence);
      return { status: 'refused', admission };
    }

    try {
      const result = await runtime.sendMcpRequest(binding.server, {
        jsonrpc: '2.0',
        id: nextRequestId++,
        method: 'tools/call',
        params: { name: binding.tool.name, arguments: args },
      }, abortSignal);
      await recordEvidence({ kind: 'tool_execution_completed', tool_name: binding.tool.name, server_name: binding.server.name ?? null, admission });
      return { status: 'completed', result, admission };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordEvidence({ kind: 'tool_execution_failed', tool_name: binding.tool.name, server_name: binding.server.name ?? null, admission, error: message });
      return { status: 'failed', error: message, admission };
    }
  }

  async function close() {
    if (closePromise) return closePromise;
    if (!mcpServers) {
      operationalState = 'closed';
      return;
    }
    const serversToClose = mcpServers;
    mcpServers = null;
    operationalState = 'closing';
    closePromise = Promise.resolve(runtime.closeMcpServers(serversToClose))
      .then(() => { operationalState = 'closed'; })
      .catch((error) => {
        operationalState = 'failed';
        throw error;
      });
    return closePromise;
  }

  return Object.freeze({ start, toolCatalog, invoke, close, operationalState: () => operationalState });
}
