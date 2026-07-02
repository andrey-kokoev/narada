import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';

function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeFixtureMcpSurface(siteRoot, { failToolCall = false } = {}) {
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
  mkdirSync(join(siteRoot, 'tools'), { recursive: true });
  writeFileSync(join(siteRoot, 'tools', 'fixture-mcp.mjs'), `
let buffer = '';
const failToolCall = ${JSON.stringify(failToolCall)};
function write(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}
function handle(request) {
  if (request.method === 'initialize') {
    write({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'narada-fixture-mcp', version: '0.0.0-test' } } });
    return;
  }
  if (request.method === 'tools/list') {
    write({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'fixture_read', description: 'Read deterministic fixture data', inputSchema: { type: 'object', properties: { topic: { type: 'string' } } } }] } });
    return;
  }
  if (request.method === 'tools/call') {
    if (failToolCall) {
      write({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'fixture_mcp_forced_failure' } });
      setTimeout(() => process.exit(0), 0);
      return;
    }
    write({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', tool: request.params?.name, topic: request.params?.arguments?.topic ?? null }) }] } });
    setTimeout(() => process.exit(0), 0);
    return;
  }
  write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unsupported method ' + request.method } });
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
});
`, 'utf8');
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
    schema: 'narada.mcp.client_config.v0',
    mcpServers: {
      'narada-fixture': {
        command: 'node',
        args: ['{site_root}/tools/fixture-mcp.mjs'],
        surface_id: 'fixture.surface',
        target_site_root: '{site_root}',
      },
    },
  }, null, 2)}\n`, 'utf8');
  writeFileSync(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
    schema: 'narada.site.capabilities.mcp_surfaces.v1',
    surfaces: [{
      surface_id: 'fixture.surface',
      client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
      tool_contract: {
        read_only_tools: ['fixture_read'],
        mutating_tools: [],
        refused_tools: [],
      },
    }],
  }, null, 2)}\n`, 'utf8');
}

test('server mode executes a provider-requested MCP tool through real fabric and records evidence', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-mcp-e2e-test-'));
  try {
    writeFixtureMcpSurface(siteRoot);
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_tool_e2e' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_tool_e2e',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const providerCalls = [];
    input.write(`${JSON.stringify({ id: 'mcp-e2e-input', method: 'conversation.send', params: { message: 'Use the fixture MCP tool', source: 'programmatic_operator' } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async (messages, tools) => {
        providerCalls.push({ messages, tools });
        if (providerCalls.length === 1) {
          assert.equal(tools.some((tool) => tool.function?.name === 'fixture_read'), true);
          return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_fixture_read', type: 'function', function: { name: 'fixture_read', arguments: JSON.stringify({ topic: 'mcp-e2e' }) } }] } }] };
        }
        assert.equal(messages.some((message) => message.role === 'tool' && /mcp-e2e/.test(String(message.content))), true);
        return { choices: [{ message: { role: 'assistant', content: 'Fixture MCP tool returned ok.' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    assert.equal(providerCalls.length, 2);
    assert.equal(events.some((event) => event.event === 'session_started' && event.mcp_server_count === 1 && event.mcp_operational_state === 'healthy'), true);
    const toolCall = events.find((event) => event.event === 'tool_call' && event.tool === 'fixture_read');
    assert.ok(toolCall, JSON.stringify(events));
    assert.equal(toolCall.decision, 'read_only_admitted');
    const toolResult = events.find((event) => event.event === 'tool_result' && event.tool === 'fixture_read');
    assert.ok(toolResult, JSON.stringify(events));
    assert.equal(toolResult.status, 'ok');
    assert.equal(events.some((event) => event.event === 'assistant_message' && event.content === 'Fixture MCP tool returned ok.'), true);
    assert.equal(events.some((event) => event.event === 'turn_complete' && event.terminal_state === 'completed'), true);

    const sessionRecords = readJsonl(join(sessionDir, 'session.jsonl'));
    const durableToolCall = sessionRecords.find((record) => record.event_kind === 'tool_call_requested');
    assert.equal(durableToolCall?.payload?.tool_name, 'fixture_read');
    assert.equal(durableToolCall?.payload?.requesting_agent_id, 'agent.test');
    const durableToolResult = sessionRecords.find((record) => record.event_kind === 'tool_result_received');
    assert.equal(durableToolResult?.payload?.tool_name, 'fixture_read');
    assert.equal(durableToolResult?.payload?.status, 'ok');
    assert.match(durableToolResult?.payload?.result_summary, /mcp-e2e/);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('server mode emits MCP runtime diagnostics when a real fabric tool call fails', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-mcp-failure-e2e-test-'));
  try {
    writeFixtureMcpSurface(siteRoot, { failToolCall: true });
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_tool_failure_e2e' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_tool_failure_e2e',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'mcp-e2e-failure-input', method: 'conversation.send', params: { message: 'Use the failing fixture MCP tool', source: 'programmatic_operator' } })}\n`);
    input.end();
    let providerCalls = 0;
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_fixture_read_fail', type: 'function', function: { name: 'fixture_read', arguments: JSON.stringify({ topic: 'mcp-failure-e2e' }) } }] } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'Observed fixture MCP failure.' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });
    assert.equal(providerCalls, 2);

    const diagnostic = events.find((event) => event.event === 'carrier_diagnostic_recorded' && event.diagnostic_code === 'mcp_runtime_fault');
    assert.ok(diagnostic, JSON.stringify(events));
    assert.equal(diagnostic.server_name, 'narada-fixture');
    assert.equal(diagnostic.tool_name, 'fixture_read');
    assert.match(diagnostic.error, /fixture_mcp_forced_failure/);
    const failedToolResult = events.find((event) => event.event === 'tool_result' && event.tool === 'fixture_read');
    assert.equal(failedToolResult?.status, 'error');
    assert.match(failedToolResult?.error, /fixture_mcp_forced_failure/);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('server mode writes NARS session index record on startup', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-index-start-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const sessionId = 'carrier_20260623001000_start';
    const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
    const sessionDir = sitePaths.narsSessionDir;
    const runtimeContext = {
      identity: 'sonar.resident',
      session: sessionId,
      siteId: 'sonar',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      healthUrl: 'http://127.0.0.1:12346/health',
      eventStreamUrl: 'ws://127.0.0.1:12345/events',
      operatorSurfaceKind: 'agent-web-ui',
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const recordPath = join(sessionDir, 'session-index-record.json');
    const aggregatePath = join(sitePaths.narsSessionsRoot, 'index.json');
    assert.equal(existsSync(recordPath), true);
    assert.equal(existsSync(aggregatePath), true);
    const record = readJson(recordPath);
    assert.equal(record.schema, 'narada.nars.session_index_record.v1');
    assert.equal(record.session_id, sessionId);
    assert.equal(record.agent_id, 'sonar.resident');
    assert.equal(record.site_id, 'sonar');
    assert.equal(record.site_id_source, 'session_started');
    assert.equal(record.launch_operator_surface_kind, 'agent-web-ui');
    assert.equal(record.event_endpoint, 'ws://127.0.0.1:12345/events');
    assert.equal(record.health_endpoint, 'http://127.0.0.1:12346/health');
    assert.equal(record.terminal_state, 'closed');
    assert.equal(record.terminal_reason, 'runtime_process_exit');
    const aggregate = readJson(aggregatePath);
    assert.equal(aggregate.sessions.length, 1);
    assert.equal(aggregate.sessions[0].session_id, sessionId);
    assert.equal(aggregate.sessions[0].terminal_state, 'closed');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('conversation.enqueue during an active turn queues without interrupting and persists queue state', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-enqueue-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    });

    let releaseFirst;
    const firstTurnGate = new Promise((resolve) => { releaseFirst = resolve; });
    const providerCalls = [];
    const callChatApiFn = async (messages) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      if (providerCalls.length === 1) await firstTurnGate;
      return { choices: [{ message: { role: 'assistant', content: `done ${providerCalls.length}` } }] };
    };

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_enqueue_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_enqueue_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn,
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'first', method: 'conversation.send', params: { message: 'original request', source: 'programmatic_operator' } })}\n`);
    await waitFor(() => events.some((event) => event.event === 'turn_started') && providerCalls.length === 1);
    input.write(`${JSON.stringify({ id: 'enqueue', method: 'conversation.enqueue', params: { message: 'run after active turn', source: 'agent-web-ui' } })}\n`);
    await waitFor(() => events.some((event) => event.event === 'input_queued_for_turn_boundary'));
    const queuePath = join(sessionDir, 'operator-input-queue.json');
    assert.equal(existsSync(queuePath), true);
    assert.equal(readJson(queuePath).pending_count, 1);
    assert.equal(events.some((event) => event.event === 'turn_interrupted'), false);

    releaseFirst();
    input.end();
    await running;

    assert.equal(providerCalls.length, 2);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content === 'run after active turn'), true);
    assert.equal(readJson(queuePath).pending_count, 0);
    assert.equal(events.some((event) => event.event === 'conversation_enqueue_requested'), true);
    assert.equal(events.some((event) => event.event === 'turn_interrupted'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('server mode reloads pending operator input queue state on startup', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-queue-restore-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_queue_restore_test' }).narsSessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'operator-input-queue.json'), `${JSON.stringify({
      schema: 'narada.nars.operator_input_queue_state.v1',
      updated_at: '2026-06-30T00:00:00.000Z',
      revision: 1,
      pending_count: 1,
      pending: [{
        event_id: 'input_restored_1',
        source: 'programmatic_operator',
        source_kind: 'operator',
        source_id: 'agent-web-ui',
        transport: 'carrier_server_api',
        delivery_mode: 'admit_after_active_turn',
        created_at: '2026-06-30T00:00:00.000Z',
        received_at: '2026-06-30T00:00:00.000Z',
        content: 'restored operator input',
        metadata: {},
      }],
      last_transition: null,
    }, null, 2)}\n`, 'utf8');

    const providerCalls = [];
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_queue_restore_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async (messages) => {
        providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
        return { choices: [{ message: { role: 'assistant', content: 'restored done' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].some((message) => message.role === 'user' && message.content === 'restored operator input'), true);
    assert.equal(readJson(join(sessionDir, 'operator-input-queue.json')).pending_count, 0);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('authority source drain refuses new canonical source writes', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-source-drain-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_source_drain_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_source_drain_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'unexpected' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'send', method: 'conversation.send', params: { message: 'must not run' } })}\n`);
    input.write(`${JSON.stringify({ id: 'enqueue', method: 'conversation.enqueue', params: { message: 'must not queue' } })}\n`);
    input.write(`${JSON.stringify({ id: 'steer', method: 'conversation.steer', params: { message: 'must not steer' } })}\n`);
    input.write(`${JSON.stringify({ id: 'status', method: 'authority.source.status' })}\n`);
    input.end();
    await running;

    assert.equal(providerCalls, 0);
    const refusals = events.filter((event) => event.event === 'authority_source_write_refused');
    assert.equal(refusals.length, 3);
    assert.equal(refusals.every((event) => event.code === 'authority_source_draining'), true);
    const statusEvent = events.find((event) => event.event === 'authority_source_status');
    assert.equal(statusEvent?.authority_transition_source?.state, 'draining');
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.source_write_admission, 'draining');
    assert.equal(transitionState.authority_transition_state, 'source_draining');
    assert.equal(readJson(join(sessionDir, 'operator-input-queue.json')).pending_count, 0);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('authority source seal persists seal evidence and refuses writes after seal', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-source-seal-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_source_seal_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_source_seal_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'unexpected' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'seal', method: 'authority.source.seal' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_sealed'));
    input.write(`${JSON.stringify({ id: 'send', method: 'conversation.send', params: { message: 'must not run after seal' } })}\n`);
    input.end();
    await running;

    assert.equal(providerCalls, 0);
    const sealed = events.find((event) => event.event === 'authority_source_sealed');
    assert.equal(sealed?.authority_transition_source?.state, 'sealed');
    assert.equal(Number.isInteger(sealed?.seal_evidence?.event_cursor?.last_source_sequence_before_seal), true);
    const refusal = events.find((event) => event.event === 'authority_source_write_refused');
    assert.equal(refusal?.code, 'authority_source_sealed');
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.source_write_admission, 'sealed');
    assert.equal(transitionState.authority_transition_state, 'source_sealed');
    assert.equal(Number.isInteger(transitionState.source_last_sequence), true);
    const sessionIndexRecord = readJson(join(sessionDir, 'session-index-record.json'));
    assert.equal(sessionIndexRecord.authority_transition_state, 'source_sealed');
    assert.equal(sessionIndexRecord.source_write_admission, 'sealed');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('conversation.steer interrupts the active turn and becomes the next provider input', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-steer-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    });

    const providerCalls = [];
    const callChatApiFn = async (messages, tools, settings) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      if (providerCalls.length === 1) {
        await new Promise((resolve, reject) => {
          settings.abortSignal?.addEventListener?.('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    };

    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_steer_test',
      siteRoot,
      sessionPath: join(siteRoot, 'session.jsonl'),
      eventsPath: join(siteRoot, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn,
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'first', method: 'conversation.send', params: { message: 'original request', source: 'programmatic_operator' } })}\n`);
    await waitFor(() => events.some((event) => event.event === 'turn_started') && providerCalls.length === 1);
    const userMessageIndex = events.findIndex((event) => event.event === 'user_message' && event.content === 'original request' && event.source === 'programmatic_operator');
    const firstTurnStartedIndex = events.findIndex((event) => event.event === 'turn_started');
    assert.notEqual(userMessageIndex, -1);
    assert.equal(userMessageIndex < firstTurnStartedIndex, true);
    input.write(`${JSON.stringify({ id: 'steer', method: 'conversation.steer', params: { message: 'change course' } })}\n`);
    input.end();

    await running;

    assert.equal(providerCalls.length, 2);
    assert.equal(providerCalls[0].some((message) => message.role === 'user' && message.content === 'original request'), true);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content === 'original request'), true);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content.includes('Operator steering for interrupted active turn') && message.content.includes('change course')), true);
    const steerEventIndex = events.findIndex((event) => event.event === 'conversation_steer_requested');
    const interruptEventIndex = events.findIndex((event) => event.event === 'turn_interrupted' && event.reason === 'operator_steering');
    assert.notEqual(steerEventIndex, -1);
    assert.notEqual(interruptEventIndex, -1);
    assert.equal(events[steerEventIndex].delivery_semantics, 'interrupt_active_turn_then_admit_next_turn');
    assert.equal(steerEventIndex < interruptEventIndex, true);
    assert.equal(events.some((event) => event.event === 'turn_complete' && event.terminal_state === 'interrupted'), true);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

