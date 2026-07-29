type AnyRecord = Record<string, any>;

import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarsCapabilityGateway } from './capability-gateway.js';

function createServers() {
  return { filesystem: { tools: [{ name: 'fs_read_file', inputSchema: { type: 'object' } }] } };
}

function createGateway(options: AnyRecord = {}) {
  const {
    servers = createServers(),
    admit = async () => ({ admitted: true }),
    discoverAndStartMcpServers,
    applyWorkerMcpProjection,
    aggregateToolBindings,
    findToolBinding,
    sendMcpRequest,
    closeMcpServers = async () => {},
    now,
  } = options;
  const evidence: AnyRecord[] = [];
  const requests: AnyRecord[] = [];
  const defaultBinding = () => ({
    server: { ...servers.filesystem, name: 'filesystem' },
    tool: servers.filesystem.tools[0],
  });
  const gateway = createNarsCapabilityGateway({
    siteRoot: 'C:/site',
    admit,
    recordEvidence: async (item: AnyRecord) => evidence.push(item),
    ...(now ? { now } : {}),
    dependencies: {
      discoverAndStartMcpServers: discoverAndStartMcpServers ?? (async () => servers),
      ...(applyWorkerMcpProjection ? { applyWorkerMcpProjection } : {}),
      aggregateToolBindings: aggregateToolBindings ?? ((items: AnyRecord) => items.filesystem ? [{
        serverName: 'filesystem',
        server: { ...items.filesystem, name: 'filesystem' },
        tool: items.filesystem.tools[0],
        providerToolName: 'fs_read_file',
      }] : []),
      findToolBinding: findToolBinding ?? (() => defaultBinding()),
      sendMcpRequest: sendMcpRequest ?? (async (_server: AnyRecord, request: AnyRecord) => {
        requests.push(request);
        return { content: [{ type: 'text', text: 'ok' }] };
      }),
      closeMcpServers,
    },
  });
  return { gateway, evidence, requests, servers };
}

function lifecycleStates(evidence: AnyRecord[]): string[] {
  return evidence
    .filter((event: AnyRecord) => event.kind === 'capability_gateway_lifecycle_transition')
    .map((event: AnyRecord) => event.lifecycle_state);
}

function executionStates(evidence: AnyRecord[]): string[] {
  return evidence
    .filter((event: AnyRecord) => event.kind === 'tool_execution_state_transition')
    .map((event: AnyRecord) => event.execution_state);
}

test('capability gateway serializes startup and closes only after startup', async () => {
  let discoverCalls = 0;
  let closeCalls = 0;
  let resolveDiscovery!: (value: AnyRecord) => void;
  let signalDiscoveryStarted: () => void;
  const discoveryStarted = new Promise<void>((resolve) => { signalDiscoveryStarted = resolve; });
  const discoveredServers = createServers();
  const { gateway, evidence } = createGateway({
    discoverAndStartMcpServers: async () => {
      discoverCalls += 1;
      signalDiscoveryStarted();
      return new Promise<AnyRecord>((resolve) => { resolveDiscovery = resolve; });
    },
    closeMcpServers: async () => { closeCalls += 1; },
  });

  const firstStart = gateway.start();
  await discoveryStarted;
  const secondStart = gateway.start();
  const close = gateway.close();
  resolveDiscovery(discoveredServers);
  const [firstCatalog, secondCatalog] = await Promise.all([firstStart, secondStart]);
  await close;

  assert.equal(discoverCalls, 1);
  assert.equal(firstCatalog.length, 1);
  assert.deepEqual(secondCatalog, firstCatalog);
  assert.equal(closeCalls, 1);
  assert.deepEqual(lifecycleStates(evidence), ['starting', 'healthy', 'closing', 'closed']);
  assert.equal(gateway.lifecycleState(), 'closed');
  assert.equal(gateway.operationalState(), 'closed');
  assert.equal(gateway.state().active_execution_count, 0);
  await gateway.close();
  await assert.rejects(() => gateway.start(), /nars_capability_gateway_not_startable:closed/);
});

test('capability gateway applies worker MCP projection before cataloging tools', async () => {
  const servers = {
    task_lifecycle: {
      tools: [{ name: 'task_lifecycle_show' }, { name: 'task_lifecycle_claim' }],
    },
    filesystem: {
      tools: [{ name: 'fs_read_file' }],
    },
  };
  let projectionCalls = 0;
  const { gateway } = createGateway({
    servers,
    discoverAndStartMcpServers: async () => servers,
    applyWorkerMcpProjection: (items: AnyRecord) => {
      projectionCalls += 1;
      return {
        ...items,
        task_lifecycle: {
          ...items.task_lifecycle,
          tools: [items.task_lifecycle.tools[0]],
        },
        filesystem: {
          ...items.filesystem,
          tools: [],
        },
      };
    },
    aggregateToolBindings: (items: AnyRecord) => Object.entries(items).flatMap(([serverName, server]: [string, any]) =>
      (server.tools ?? []).map((tool: AnyRecord) => ({ serverName, server, tool, providerToolName: tool.name }))),
  });

  const catalog = await gateway.start();

  assert.equal(projectionCalls, 1);
  assert.deepEqual(catalog.map((item: AnyRecord) => item.tool_name), ['task_lifecycle_show']);
});

test('capability gateway marks startup failure and permits explicit retry', async () => {
  let attempts = 0;
  const { gateway, evidence } = createGateway({
    discoverAndStartMcpServers: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('startup_broken');
      return createServers();
    },
  });

  await assert.rejects(() => gateway.start(), /startup_broken/);
  assert.equal(gateway.lifecycleState(), 'failed');
  const catalog = await gateway.start();

  assert.equal(attempts, 2);
  assert.equal(catalog[0].tool_name, 'fs_read_file');
  assert.deepEqual(lifecycleStates(evidence), ['starting', 'failed', 'starting', 'healthy']);
});

test('capability gateway exposes degraded startup without hiding available servers', async () => {
  const servers = createServers();
  Object.defineProperty(servers, '__mcp_startup_failures', {
    value: [{ server_name: 'optional', code: 'startup_timeout' }],
    configurable: true,
  });
  const { gateway, evidence } = createGateway({ servers });

  const catalog = await gateway.start();

  assert.equal(catalog.length, 1);
  assert.equal(gateway.lifecycleState(), 'degraded');
  assert.equal(gateway.operationalState(), 'startup_degraded');
  assert.equal(gateway.state().startup_failure_count, 1);
  assert.deepEqual(lifecycleStates(evidence), ['starting', 'degraded']);
  await gateway.close();
});

test('capability gateway dispatches admitted tools through the complete attempt lifecycle', async () => {
  const { gateway, evidence, requests } = createGateway();
  await gateway.start();
  const result = await gateway.invoke({
    toolName: 'fs_read_file',
    arguments: { path: 'README.md' },
    turnId: 'turn-1',
    inputEventId: 'input-1',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(requests[0].params, { name: 'fs_read_file', arguments: { path: 'README.md' } });
  assert.deepEqual(executionStates(evidence), ['requested', 'admitted', 'executing', 'completed']);
  const terminal = evidence.find((event: AnyRecord) => event.kind === 'tool_execution_completed')!;
  assert.equal(terminal.execution_id, result.execution_id);
  assert.equal(terminal.turn_id, 'turn-1');
  assert.equal(terminal.input_event_id, 'input-1');
  assert.equal(gateway.execution(result.execution_id).execution_state, 'completed');
  assert.equal(gateway.execution(result.execution_id).input_event_id, 'input-1');
  assert.equal(gateway.state().active_execution_count, 0);
});

test('capability gateway exposes canonical reader names while dispatching runtime aliases', async () => {
  const servers = {
    filesystem: {
      tools: [{
        name: 'mcp_output_show',
        runtime_tool_name: 'agent_context_output_show',
        inputSchema: { type: 'object' },
      }],
    },
  };
  let admittedToolName;
  const { gateway, requests } = createGateway({
    servers,
    admit: async ({ toolName }: AnyRecord) => {
      admittedToolName = toolName;
      return { admitted: true };
    },
    aggregateToolBindings: (items: AnyRecord) => [{
      serverName: 'filesystem',
      server: { ...items.filesystem, name: 'filesystem' },
      tool: items.filesystem.tools[0],
      providerToolName: 'mcp_output_show',
    }],
    findToolBinding: () => ({
      server: { ...servers.filesystem, name: 'filesystem' },
      tool: servers.filesystem.tools[0],
    }),
  });

  await gateway.invoke({ toolName: 'mcp_output_show', arguments: { ref: 'mcp_output:o_test' } });

  assert.equal(admittedToolName, 'mcp_output_show');
  assert.equal(requests[0].params.name, 'agent_context_output_show');
});

test('capability gateway refuses tools before dispatch when admission rejects', async () => {
  const { gateway, evidence, requests } = createGateway({
    admit: async () => ({ admitted: false, reason: 'approval_required' }),
  });
  const result = await gateway.invoke({ toolName: 'fs_read_file' });

  assert.equal(result.status, 'refused');
  assert.equal(requests.length, 0);
  assert.deepEqual(executionStates(evidence), ['requested', 'refused']);
  assert.equal(evidence.find((event: AnyRecord) => event.kind === 'tool_execution_refused')!.reason, 'approval_required');
});

test('capability gateway refuses an unknown tool without dispatch', async () => {
  const { gateway, evidence, requests } = createGateway({ findToolBinding: () => null });
  const result = await gateway.invoke({ toolName: 'missing_tool' });

  assert.equal(result.status, 'refused');
  assert.equal(requests.length, 0);
  assert.deepEqual(executionStates(evidence), ['requested', 'refused']);
  assert.equal(evidence.find((event: AnyRecord) => event.kind === 'tool_execution_refused')!.reason, 'tool_not_found');
});

test('capability gateway records transport failure as a terminal failed attempt', async () => {
  const { gateway, evidence, requests } = createGateway({
    sendMcpRequest: async (_server: AnyRecord, request: AnyRecord) => {
      requests.push(request);
      throw new Error('transport_down');
    },
  });
  const result = await gateway.invoke({ toolName: 'fs_read_file' });

  assert.equal(result.status, 'failed');
  assert.deepEqual(executionStates(evidence), ['requested', 'admitted', 'executing', 'failed']);
  assert.match(result.error, /transport_down/);
  assert.equal(evidence.find((event: AnyRecord) => event.kind === 'tool_execution_failed')!.execution_state, 'failed');
});

test('capability gateway marks an aborted transport as interrupted', async () => {
  let signalSendEntered!: () => void;
  const sendEntered = new Promise<void>((resolve) => { signalSendEntered = resolve; });
  const { gateway, evidence } = createGateway({
    sendMcpRequest: async (_server: AnyRecord, _request: AnyRecord, abortSignal: any) => {
      signalSendEntered();
      await new Promise((resolve: any, reject: any) => {
        abortSignal.addEventListener('abort', () => reject(new Error('agent_cli_interrupt_requested')), { once: true });
      });
    },
  });
  const controller = new AbortController();
  const invocation = gateway.invoke({ toolName: 'fs_read_file', abortSignal: controller.signal });
  await sendEntered;
  controller.abort();
  const result = await invocation;

  assert.equal(result.status, 'interrupted');
  assert.deepEqual(executionStates(evidence), ['requested', 'admitted', 'executing', 'interrupted']);
  assert.equal(evidence.find((event: AnyRecord) => event.kind === 'tool_execution_interrupted')!.terminal_state, 'interrupted');
  assert.equal(gateway.state().active_execution_count, 0);
});

test('capability gateway converts admission exceptions into failed attempts', async () => {
  const { gateway, evidence, requests } = createGateway({
    admit: async () => { throw new Error('admission_unavailable'); },
  });

  await assert.rejects(() => gateway.invoke({ toolName: 'fs_read_file' }), /admission_unavailable/);
  assert.equal(requests.length, 0);
  assert.deepEqual(executionStates(evidence), ['requested', 'failed']);
  assert.equal(evidence.find((event: AnyRecord) => event.kind === 'tool_execution_failed')!.reason, 'admission_failed');
});
