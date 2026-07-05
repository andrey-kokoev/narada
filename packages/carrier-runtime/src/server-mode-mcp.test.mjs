import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { join } from 'node:path';

import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';
import { readJson, readJsonl, removeTempDir, tempRoot, writeFixtureMcpSurface, waitFor } from './server-mode-test-helpers.mjs';

test('server mode executes a provider-requested MCP tool through real fabric and records evidence', async () => {
  const siteRoot = tempRoot('carrier-mcp-e2e-test-');
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
    const sessionStarted = events.find((event) => event.event === 'session_started');
    assert.equal(sessionStarted?.mcp_server_count, 1);
    assert.equal(sessionStarted?.mcp_operational_state, 'healthy');
    assert.deepEqual(sessionStarted?.mcp_tools?.map((tool) => ({ server_name: tool.server_name, tool_name: tool.tool_name })), [
      { server_name: 'narada-fixture', tool_name: 'fixture_read' },
    ]);
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
    removeTempDir(siteRoot);
  }
});

test('server mode emits MCP runtime diagnostics when a real fabric tool call fails', async () => {
  const siteRoot = tempRoot('carrier-mcp-failure-e2e-test-');
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
    removeTempDir(siteRoot);
  }
});

test('server mode writes NARS session index record on startup', async () => {
  const siteRoot = tempRoot('carrier-index-start-test-');
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
    assert.equal(record.runtime_session_id, sessionId);
    assert.equal(record.nars_session_id, sessionId);
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
    assert.equal(aggregate.sessions[0].runtime_session_id, sessionId);
    assert.equal(aggregate.sessions[0].nars_session_id, sessionId);
    assert.equal(aggregate.sessions[0].terminal_state, 'closed');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects SOP summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-sop-summary-test-');
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

    const sessionId = 'carrier_20260623001500_sop';
    const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
    const sessionDir = sitePaths.narsSessionDir;
    const runtimeContext = {
      identity: 'sonar.resident',
      session: sessionId,
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const fakeSopServer = {
      tools: [
        { name: 'sop_template_list' },
        { name: 'sop_run_list' },
        { name: 'sop_run_refresh' },
        { name: 'sop_run_advance' },
        { name: 'sop_run_cancel' },
        { name: 'sop_doctor' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'sop_template_list') {
          return { result: { structuredContent: { items: [{ sop_id: 'daily-briefing', version: 2, title: 'Daily briefing', status: 'active', steps: [{ id: 'review', executor: 'operator', blocking: true, title: 'Review draft' }] }], count: 1 } } };
        }
        if (name === 'sop_run_list') {
          return { result: { structuredContent: { items: [{ run_id: 'run_1', sop_id: 'daily-briefing', sop_version: 2, sop_title: 'Daily briefing', status: 'awaiting_confirmation', next_awaits_confirmation: true, step_states: [{ step_id: 'review', executor: 'operator', blocking: true, title: 'Review draft', status: 'running' }] }], count: 1 } } };
        }
        if (name === 'sop_doctor') {
          return { result: { structuredContent: { status: 'ok', server_name: 'narada-test-sop' } } };
        }
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'sop-summary-1', method: 'session.sop.summary' })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-sop': fakeSopServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_sop_summary');
    assert.equal(summary?.schema, 'narada.nars.sop_summary.v1');
    assert.equal(summary.server_name, 'narada-test-sop');
    assert.equal(summary.affordance_contract?.panel?.sections.includes('active_run'), true);
    assert.equal(summary.templates.items[0].step_count, 1);
    assert.equal(summary.active_run.run_id, 'run_1');
    assert.equal(summary.active_run.next_step.step_id, 'review');
    assert.deepEqual(summary.active_run.available_actions, ['open_run', 'refresh_run', 'cancel_run', 'confirm_operator_step']);
    assert.equal(summary.recent_runs.count, 1);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode health and event subscription match NARS runtime contract shape', async () => {
  const siteRoot = tempRoot('carrier-health-subscribe-test-');
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

    const sessionId = 'carrier_20260623002000_health';
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
    input.write(`${JSON.stringify({ id: 'health-1', method: 'session.health' })}\n`);
    input.write(`${JSON.stringify({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, since_sequence: 0 } })}\n`);
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

    const health = events.find((event) => event.event === 'session_health');
    assert.equal(health?.schema, 'narada.nars.health.v1');
    assert.equal(health.runtime_mode, 'server');
    assert.equal(health.launch_operator_surface_kind, 'agent-web-ui');
    assert.equal(typeof health.generated_at, 'string');
    assert.equal(typeof health.started_at, 'string');
    assert.equal(health.heartbeat?.path, join(sessionDir, 'heartbeat.json'));
    assert.equal(health.heartbeat?.freshness, 'fresh');
    assert.equal(Number.isInteger(health.heartbeat?.age_ms), true);
    assert.equal(health.activity?.active_turn_state, 'idle');
    assert.equal(health.surface_affordances?.schema, 'narada.nars.surface_affordances.v1');
    assert.equal(health.surface_affordances?.count, 0);
    assert.equal(health.recommended_action, 'review_session_summary');
    assert.equal(typeof health.recommended_command, 'string');

    const subscription = events.find((event) => event.event === 'session_events_subscription_started');
    assert.equal(subscription?.schema, 'narada.nars.events.subscription.v1');
    assert.equal(subscription.request_id, 'events-1');
    assert.equal(subscription.operator_input_queue?.durability, 'nars_session_file');
    assert.equal(events.some((event) => event.event === 'error' && event.code === 'request_failed'), false);
  } finally {
    removeTempDir(siteRoot);
  }
});
