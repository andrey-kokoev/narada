import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { join } from 'node:path';

import {
  NARS_AFFORDANCE_ACTION_EVENTS,
  NARS_AFFORDANCE_ACTION_CANCEL_METHOD,
  NARS_AFFORDANCE_ACTION_CONFIRM_METHOD,
  NARS_AFFORDANCE_ACTION_REFUSAL_CODES,
  NARS_AFFORDANCE_ACTION_REQUEST_METHOD,
} from '@narada2/nars-client-projection-contract';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { ADMITTED_INTELLIGENCE_PROVIDERS } from './intelligence-provider-policy.mjs';
import { attachMcpStartupFailures, createMcpStatusSnapshot, rememberMcpRuntimeDiagnostic } from './mcp-runtime.mjs';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';
import { readJson, readJsonl, removeTempDir, tempRoot, writeFixtureMcpSurface, waitFor } from './server-mode-test-helpers.mjs';

test('MCP runtime diagnostics do not degrade server operational state', () => {
  const mcpServers = attachMcpStartupFailures([], []);
  rememberMcpRuntimeDiagnostic(mcpServers, {
    server_name: 'narada-fixture',
    tool_name: 'fixture_slow_read',
    error: 'MCP request timeout after 15000ms',
    occurred_at: '2026-07-08T20:10:00.000Z',
  });
  const status = createMcpStatusSnapshot(mcpServers);
  assert.equal(status.mcp_operational_state, 'healthy');
  assert.equal(status.mcp_runtime_fault_count, 1);
  assert.match(status.mcp_runtime_fault_summary, /narada-fixture:fixture_slow_read/);
});

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
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
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

test('server mode publishes attachable session evidence before MCP startup completes', async () => {
  const siteRoot = tempRoot('carrier-mcp-early-session-test-');
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_slow_start' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_slow_start',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
      healthUrl: 'http://127.0.0.1:1234/health',
      eventStreamUrl: 'ws://127.0.0.1:1235/events',
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let unblockMcpStartup;
    const mcpStartupBlocked = new Promise((resolve) => {
      unblockMcpStartup = resolve;
    });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => {
          await mcpStartupBlocked;
          return {};
        },
      },
    });

    const indexRecordPath = join(sessionDir, 'session-index-record.json');
    const heartbeatPath = join(sessionDir, 'heartbeat.json');
    await waitFor(() => existsSync(indexRecordPath) && existsSync(heartbeatPath));
    const record = readJson(indexRecordPath);
    const heartbeat = readJson(heartbeatPath);
    assert.equal(record.session_id, 'session_mcp_slow_start');
    assert.equal(record.status_hint, 'alive');
    assert.equal(record.health_endpoint, 'http://127.0.0.1:1234/health');
    assert.equal(record.event_endpoint, 'ws://127.0.0.1:1235/events');
    assert.equal(heartbeat.status, 'alive');

    unblockMcpStartup();
    input.end();
    await running;
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode health advertises MCP tool catalog for web UI inventory', async () => {
  const siteRoot = tempRoot('carrier-mcp-health-catalog-test-');
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

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_health_catalog' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_health_catalog',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'health-catalog-1', method: 'session.health' })}\n`);
    input.end();

    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    const health = events.find((event) => event.event === 'session_health');
    assert.deepEqual(health?.mcp_tools?.map((tool) => ({ server_name: tool.server_name, tool_name: tool.tool_name })), [
      { server_name: 'narada-fixture', tool_name: 'fixture_read' },
    ]);
    assert.deepEqual(health?.mcp?.tools?.map((tool) => ({ server_name: tool.server_name, tool_name: tool.tool_name })), [
      { server_name: 'narada-fixture', tool_name: 'fixture_read' },
    ]);
    assert.equal(health?.runtime_topology?.schema, 'narada.nars.runtime_topology.v1');
    assert.equal(health?.runtime_topology?.status, 'live');
    assert.equal(health?.runtime_topology?.session_id, 'session_mcp_health_catalog');
    assert.equal(health?.runtime_topology?.runtime?.kind, 'narada-agent-runtime-server');
    assert.equal(health?.runtime_topology?.authority?.runtime_host, 'local');
    assert.equal(health?.runtime_topology?.authority?.runtime_id, null);
    assert.equal(health?.runtime_topology?.mcp?.children?.[0]?.id, 'narada-fixture');
    assert.equal(health?.runtime_topology?.mcp?.children?.[0]?.tool_count, 1);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode executes read-only generic affordance actions through MCP fabric', async () => {
  const siteRoot = tempRoot('carrier-mcp-affordance-action-test-');
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

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_affordance_action' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_affordance_action',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'action-1', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'fixture.surface', action_id: 'refresh', args: { topic: 'affordance' }, client_correlation_id: 'ui-1' } })}\n`);
    input.end();

    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    const requested = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.requested);
    assert.equal(requested?.surface_id, 'fixture.surface');
    assert.equal(requested?.action_id, 'refresh');
    const result = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result);
    assert.equal(result?.status, 'ok', JSON.stringify(events));
    assert.equal(result?.tool_name, 'fixture_read');
    assert.equal(result?.result?.topic, 'affordance');
    const sessionRecords = readJsonl(join(sessionDir, 'session.jsonl'));
    assert.equal(sessionRecords.some((record) => record.event === NARS_AFFORDANCE_ACTION_EVENTS.requested), true);
    assert.equal(sessionRecords.some((record) => record.event === NARS_AFFORDANCE_ACTION_EVENTS.result && record.status === 'ok'), true);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode executes runtime intelligence affordance actions and health reflects the session override', async () => {
  const siteRoot = tempRoot('carrier-runtime-intelligence-affordance-test-');
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

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_runtime_intelligence_affordance' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_runtime_intelligence_affordance',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'set-model-1', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'nars.runtime.intelligence', action_id: 'set_model', args: { model: 'gpt-5.6' } } })}\n`);
    input.write(`${JSON.stringify({ id: 'set-thinking-1', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'nars.runtime.intelligence', action_id: 'set_thinking', args: { thinking: 'high' } } })}\n`);

    const runtimePromise = runCarrierServerMode({
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

    await waitFor(() => events.filter((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result).length === 2, { timeoutMs: 2000 });
    input.write(`${JSON.stringify({ id: 'health-after-intelligence-actions', method: 'session.health' })}\n`);
    input.end();
    await runtimePromise;

    const results = events.filter((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result);
    assert.equal(results.length, 2, JSON.stringify(events));
    assert.equal(results[0].result.intelligence.model, 'gpt-5.6');
    assert.equal(results[1].result.intelligence.thinking, 'high');
    const health = events.find((event) => event.event === 'session_health' && event.request_id === 'health-after-intelligence-actions');
    assert.equal(health?.intelligence?.model, 'gpt-5.6');
    assert.equal(health?.intelligence?.thinking, 'high');
    assert.equal(health?.surface_affordances?.items?.some((item) => item.surface_kind === 'intelligence'), true);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode refuses unsafe generic affordance actions before MCP tool execution', async () => {
  const siteRoot = tempRoot('carrier-mcp-affordance-refusal-test-');
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

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_affordance_refusal' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_affordance_refusal',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'action-2', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'fixture.surface', action_id: 'mutate', args: { topic: 'blocked' } } })}\n`);
    input.end();

    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    const confirmation = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired);
    assert.equal(confirmation?.terminal_state, 'awaiting_confirmation', JSON.stringify(events));
    assert.equal(confirmation?.status, 'confirmation_required');
    assert.match(confirmation?.confirmation_id ?? '', /^affordance-confirm-/);
    assert.equal(confirmation?.code, NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired);
    assert.equal(events.some((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result), false);
    assert.equal(events.some((event) => event.event === 'tool_call' && event.tool === 'fixture_read'), false);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode confirms unsafe affordance actions before executing the MCP tool', async () => {
  const siteRoot = tempRoot('carrier-mcp-affordance-confirm-test-');
  try {
    writeFixtureMcpSurface(siteRoot);
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    let confirmSent = false;
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        events.push(event);
        if (event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired && event.confirmation_id && !confirmSent) {
          confirmSent = true;
          input.write(`${JSON.stringify({ id: 'confirm-1', method: NARS_AFFORDANCE_ACTION_CONFIRM_METHOD, params: { confirmation_id: event.confirmation_id } })}\n`);
        }
        if (event.event === NARS_AFFORDANCE_ACTION_EVENTS.result && event.confirmation_id) input.end();
      }
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_affordance_confirm' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_affordance_confirm',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'action-confirmable', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'fixture.surface', action_id: 'mutate', args: { topic: 'confirmed' } } })}\n`);

    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    const confirmation = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired);
    const confirmed = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmed);
    const result = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result && event.confirmation_id);
    assert.equal(confirmed?.confirmation_id, confirmation?.confirmation_id);
    assert.equal(result?.confirmation_id, confirmation?.confirmation_id);
    assert.equal(result?.status, 'ok', JSON.stringify(events));
    assert.equal(result?.tool_name, 'fixture_read');
    assert.equal(result?.result?.topic, 'confirmed');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode cancels unsafe affordance action confirmations without executing the MCP tool', async () => {
  const siteRoot = tempRoot('carrier-mcp-affordance-cancel-test-');
  try {
    writeFixtureMcpSurface(siteRoot);
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    let cancelSent = false;
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        events.push(event);
        if (event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired && event.confirmation_id && !cancelSent) {
          cancelSent = true;
          input.write(`${JSON.stringify({ id: 'cancel-1', method: NARS_AFFORDANCE_ACTION_CANCEL_METHOD, params: { confirmation_id: event.confirmation_id, reason: 'test_cancelled' } })}\n`);
        }
        if (event.event === NARS_AFFORDANCE_ACTION_EVENTS.cancelled) input.end();
      }
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_mcp_affordance_cancel' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_mcp_affordance_cancel',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'action-cancellable', method: NARS_AFFORDANCE_ACTION_REQUEST_METHOD, params: { surface_id: 'fixture.surface', action_id: 'mutate', args: { topic: 'cancelled' } } })}\n`);

    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });

    const confirmation = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.confirmationRequired);
    const cancelled = events.find((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.cancelled);
    assert.equal(cancelled?.confirmation_id, confirmation?.confirmation_id);
    assert.equal(cancelled?.reason, 'test_cancelled');
    assert.equal(events.some((event) => event.event === NARS_AFFORDANCE_ACTION_EVENTS.result), false);
    assert.equal(events.some((event) => event.event === 'tool_call' && event.tool === 'fixture_read'), false);
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
      identity: 'resident',
      agentIdentityRef: {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'narada_site', site_id: 'sonar' },
        local_agent_id: 'resident',
        role: 'resident',
        canonical_agent_id: 'sonar.resident',
        display: 'sonar.resident',
        legacy_agent_id: 'resident',
      },
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
    assert.equal(record.agent_identity_ref?.identity_scope?.site_id, 'sonar');
    assert.equal(record.agent_identity_ref?.local_agent_id, 'resident');
    assert.equal(record.agent_identity_ref?.canonical_agent_id, 'sonar.resident');
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
    const sessionStarted = readJsonl(join(sessionDir, 'events.jsonl')).find((event) => event.event === 'session_started');
    assert.equal(sessionStarted.agent_id, 'sonar.resident');
    assert.equal(sessionStarted.site_id, 'sonar');
    assert.equal(sessionStarted.agent_identity_ref?.identity_scope?.site_id, 'sonar');
    assert.equal(sessionStarted.agent_identity_ref?.local_agent_id, 'resident');
    assert.equal(sessionStarted.agent_identity_ref?.canonical_agent_id, 'sonar.resident');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode emits canonical agent id for turn events when identity ref is site-scoped', async () => {
  const siteRoot = tempRoot('carrier-canonical-agent-events-test-');
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

    const sessionId = 'carrier_20260708000000_canonical_agent';
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
    const runtimeContext = {
      identity: 'resident',
      agentIdentityRef: {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'narada_site', site_id: 'sonar' },
        local_agent_id: 'resident',
        role: 'resident',
        canonical_agent_id: 'sonar.resident',
        display: 'sonar.resident',
        legacy_agent_id: 'resident',
      },
      session: sessionId,
      siteId: 'sonar',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.write(`${JSON.stringify({ id: 'canonical-agent-input', method: 'conversation.send', params: { message: 'hello', source: 'programmatic_operator' } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'hello back' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    assert.equal(events.some((event) => event.event === 'user_message'), true);
    assert.equal(events.some((event) => event.event === 'assistant_message'), true);
    assert.deepEqual([...new Set(events.filter((event) => event.agent_id).map((event) => event.agent_id))], ['sonar.resident']);
    assert.equal(events.every((event) => event.agent_identity_ref?.canonical_agent_id === 'sonar.resident'), true);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode lifts legacy agent identity ref shape into a structured session index record', async () => {
  const siteRoot = tempRoot('carrier-index-legacy-identity-test-');
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const sessionId = 'carrier_20260623002000_legacy_identity';
    const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
    const sessionDir = sitePaths.narsSessionDir;
    const runtimeContext = {
      identity: 'resident',
      agentIdentityRef: {
        schema: 'narada.agent_identity_ref.v1',
        site_id: 'sonar',
        local_agent_id: 'resident',
        role: 'resident',
        canonical_agent_id: 'sonar.resident',
        display: 'sonar.resident',
        source_agent_id: 'resident',
        scope: 'site_scoped',
      },
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

    const record = readJson(join(sessionDir, 'session-index-record.json'));
    assert.equal(record.agent_id, 'sonar.resident');
    assert.equal(record.agent_identity_ref?.schema, 'narada.agent_identity_ref.v2');
    assert.equal(record.agent_identity_ref?.identity_scope?.site_id, 'sonar');
    assert.equal(record.agent_identity_ref?.local_agent_id, 'resident');
    assert.equal(record.agent_identity_ref?.canonical_agent_id, 'sonar.resident');
    assert.equal(record.agent_identity_ref?.legacy_agent_id, 'resident');
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
          return { result: { structuredContent: { items: [{ sop_id: 'daily-briefing', version: 2, title: 'Daily briefing', description: 'Prepare and review the daily update.', status: 'active', trigger_kind: 'manual', steps: [{ id: 'compose', executor: 'agent', blocking: false, title: 'Compose draft', instructions: 'Use current evidence.' }, { id: 'review', executor: 'operator', blocking: true, title: 'Review draft', depends_on: ['compose'] }] }], count: 1 } } };
        }
        if (name === 'sop_run_list') {
          return { result: { structuredContent: { items: [
            { run_id: 'run_1', sop_id: 'daily-briefing', sop_version: 2, sop_title: 'Daily briefing', status: 'awaiting_confirmation', next_awaits_confirmation: true, started_at: '2026-07-05T03:00:00.000Z', updated_at: '2026-07-05T03:03:00.000Z', step_states: [{ step_id: 'compose', executor: 'agent', blocking: false, title: 'Compose draft', status: 'completed', completed_at: '2026-07-05T03:02:00.000Z', result: { summary: 'Draft body written.' } }, { step_id: 'review', executor: 'operator', blocking: true, title: 'Review draft', status: 'running', started_at: '2026-07-05T03:03:00.000Z' }] },
            { run_id: 'run_0', sop_id: 'daily-briefing', sop_version: 2, sop_title: 'Daily briefing', status: 'completed', next_awaits_confirmation: false, completed_at: '2026-07-04T03:05:00.000Z', step_states: [{ step_id: 'review', executor: 'operator', blocking: true, title: 'Review draft', status: 'completed', completed_at: '2026-07-04T03:05:00.000Z', result: { receipt_id: 'receipt_1' } }] },
          ], count: 2 } } };
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
    assert.equal(summary.affordance_contract?.actions?.read.includes('open_run'), true);
    assert.equal(summary.affordance_contract?.actions?.run.includes('confirm_operator_step'), true);
    assert.equal(summary.templates.items[0].step_count, 2);
    assert.equal(summary.templates.items[0].description, 'Prepare and review the daily update.');
    assert.deepEqual(summary.templates.items[0].steps[1].depends_on, ['compose']);
    assert.equal(summary.active_run.run_id, 'run_1');
    assert.equal(summary.active_run.started_at, '2026-07-05T03:00:00.000Z');
    assert.equal(summary.active_run.step_timeline[0].result.summary, 'Draft body written.');
    assert.equal(summary.active_run.next_step.step_id, 'review');
    assert.deepEqual(summary.active_run.available_actions, ['open_run', 'refresh_run', 'cancel_run', 'confirm_operator_step']);
    assert.equal(summary.recent_runs.count, 2);
    assert.deepEqual(summary.recent_runs.items[1].available_actions, ['open_run']);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects synced mailbox summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-mailbox-summary-test-');
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

    const sessionId = 'carrier_20260705033000_mailbox';
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
    const fakeMailboxServer = {
      tools: [
        { name: 'mailbox_accounts_list' },
        { name: 'mailbox_messages_list' },
        { name: 'mailbox_doctor' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'mailbox_accounts_list') {
          return { result: { structuredContent: { accounts: [{ mailbox_id: 'support@example.test', display_name: 'Support', message_count: 3, unread_count: 1, latest_received_at: '2026-07-05T03:10:00.000Z' }], count: 1 } } };
        }
        if (name === 'mailbox_messages_list') {
          return { result: { structuredContent: { messages: [{ message_id: 'msg_1', mailbox_id: 'support@example.test', folder: 'Inbox', thread_id: 'thread_1', subject: 'Webhook delay', from: 'ops@example.test', received_at: '2026-07-05T03:10:00.000Z', unread: true, importance: 'normal', categories: ['ops'], preview: 'Latest webhook delay is normal.', attachments: [{ name: 'chart.png' }] }], count: 1 } } };
        }
        if (name === 'mailbox_doctor') {
          return { result: { structuredContent: { status: 'ok', message_count: 3, invalid_count: 0 } } };
        }
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'mailbox-summary-1', method: 'session.mailbox.summary' })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-mailbox': fakeMailboxServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_mailbox_summary');
    assert.equal(summary?.schema, 'narada.nars.mailbox_summary.v1');
    assert.equal(summary.server_name, 'narada-test-mailbox');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.mailbox.summary');
    assert.deepEqual(summary.affordance_contract?.actions?.write, []);
    assert.equal(summary.accounts.items[0].label, 'Support');
    assert.equal(summary.messages.items[0].subject, 'Webhook delay');
    assert.equal(summary.messages.items[0].attachment_count, 1);
    assert.deepEqual(summary.messages.items[0].categories, ['ops']);
    assert.equal(summary.unread.count, 1);
    assert.equal(summary.doctor.status, 'ok');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode treats mailbox doctor as optional for synced mailbox summaries', async () => {
  const siteRoot = tempRoot('carrier-mailbox-summary-no-doctor-test-');
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

    const sessionId = 'carrier_20260705043000_mailbox_no_doctor';
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
    const fakeMailboxServer = {
      tools: [
        { name: 'mailbox_accounts_list' },
        { name: 'mailbox_messages_list' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'mailbox_accounts_list') return { result: { structuredContent: { accounts: [], count: 0 } } };
        if (name === 'mailbox_messages_list') return { result: { structuredContent: { messages: [], count: 0 } } };
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'mailbox-summary-no-doctor-1', method: 'session.mailbox.summary' })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-mailbox': fakeMailboxServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_mailbox_summary');
    assert.equal(summary?.status, 'ok');
    assert.equal(summary.doctor, null);
    assert.deepEqual(summary.errors, []);
    assert.equal(summary.affordance_contract?.tools?.doctor, null);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects scheduler summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-scheduler-summary-test-');
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

    const sessionId = 'carrier_20260705044500_scheduler';
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
    const fakeSchedulerServer = {
      tools: [
        { name: 'scheduler_task_list' },
        { name: 'scheduler_task_show' },
        { name: 'scheduler_task_history' },
        { name: 'scheduler_task_run' },
        { name: 'scheduler_task_disable' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'scheduler_task_list') {
          return { result: { structuredContent: { items: [
            { task_name: '\\Narada\\ProviderLiveness', status: 'Ready', schedule: 'Daily', next_run: '2026-07-05 05:00:00', last_run: '2026-07-05 04:00:00', last_result: '0', command: 'pwsh -File check-provider.ps1' },
            { task_name: '\\Narada\\SiteContinuity', status: 'Disabled', schedule: 'Hourly', next_run: 'N/A', last_run: '2026-07-05 03:00:00', last_result: '1', command: 'pwsh -File sync-site.ps1' },
          ], count: 2 } } };
        }
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'scheduler-summary-1', method: 'session.scheduler.summary', params: { task_limit: 10, history_limit: 2 } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-scheduler': fakeSchedulerServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_scheduler_summary');
    assert.equal(summary?.schema, 'narada.nars.scheduler_summary.v1');
    assert.equal(summary.server_name, 'narada-test-scheduler');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.scheduler.summary');
    assert.deepEqual(summary.affordance_contract?.actions?.read, ['refresh', 'open_task']);
    assert.deepEqual(summary.affordance_contract?.actions?.candidate_write, ['run_now', 'disable_task']);
    assert.equal(summary.tasks.count, 2);
    assert.equal(summary.tasks.items[0].task_name, '\\Narada\\ProviderLiveness');
    assert.deepEqual(summary.tasks.items[0].available_actions, ['open_task', 'open_history', 'candidate_run_now', 'candidate_disable_task']);
    assert.equal(summary.posture.total, 2);
    assert.equal(summary.posture.ready, 1);
    assert.equal(summary.posture.disabled, 1);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects inbox summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-inbox-summary-test-');
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

    const sessionId = 'carrier_20260705051500_inbox';
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
    const fakeInboxServer = {
      tools: [
        { name: 'inbox_list' },
        { name: 'inbox_next' },
        { name: 'inbox_show' },
        { name: 'inbox_doctor' },
        { name: 'inbox_acknowledge' },
        { name: 'inbox_dismiss' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'inbox_list') {
          return { result: { structuredContent: { count: 1, envelopes: [{ envelope_id: 'env_1', status: 'received', kind: 'observation', action: 'review', title: 'Check provider liveness', target_role: 'architect', severity: 'medium' }] } } };
        }
        if (name === 'inbox_next') {
          return { result: { structuredContent: { status: 'ok', envelope: { envelope_id: 'env_1', status: 'received', title: 'Check provider liveness' } } } };
        }
        if (name === 'inbox_doctor') {
          return { result: { structuredContent: { status: 'ok', indexed_count: 1, invalid_count: 0 } } };
        }
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'inbox-summary-1', method: 'session.inbox.summary', params: { limit: 5, status: 'received' } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-inbox': fakeInboxServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_inbox_summary');
    assert.equal(summary?.schema, 'narada.nars.inbox_summary.v1');
    assert.equal(summary.server_name, 'narada-test-inbox');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.inbox.summary');
    assert.deepEqual(summary.affordance_contract?.actions?.candidate_write, ['acknowledge_envelope', 'dismiss_envelope']);
    assert.equal(summary.envelopes.count, 1);
    assert.equal(summary.envelopes.items[0].envelope_id, 'env_1');
    assert.equal(summary.next_envelope.envelope_id, 'env_1');
    assert.equal(summary.doctor.indexed_count, 1);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects delegation summary from worker and delegated-task MCPs', async () => {
  const siteRoot = tempRoot('carrier-delegation-summary-test-');
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

    const sessionId = 'carrier_20260705054000_delegation';
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
    const fakeWorkerServer = {
      tools: [{ name: 'worker_runs_list' }, { name: 'worker_dashboard_describe' }, { name: 'worker_run_status' }],
      async send(request) {
        const name = request.params?.name;
        if (name === 'worker_runs_list') return { result: { structuredContent: { count: 1, runs: [{ run_id: 'run_1', status: 'running', instruction: 'research slice', runtime: 'narada-agent-runtime-server', worker_session_id: 'carrier_child' }] } } };
        if (name === 'worker_dashboard_describe') return { result: { structuredContent: { counts: { total: 1, active: 1, terminal: 0, failed: 0 }, dashboard: { kind: 'read_only_dashboard_descriptor' } } } };
        return { error: { message: `unexpected worker tool ${name}` } };
      },
    };
    const fakeTaskServer = {
      tools: [{ name: 'delegated_tasks_list' }, { name: 'delegated_task_status' }],
      async send(request) {
        const name = request.params?.name;
        if (name === 'delegated_tasks_list') return { result: { structuredContent: { count: 1, tasks: [{ task_id: 'dtask_1', status: 'running', objective: 'implement panel', owner_site_id: 'narada.sonar', active_run_ids: ['run_1'] }] } } };
        return { error: { message: `unexpected task tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'delegation-summary-1', method: 'session.delegation.summary', params: { worker_limit: 5, task_limit: 5 } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-worker-delegation': fakeWorkerServer, 'narada-test-delegated-task': fakeTaskServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_delegation_summary');
    assert.equal(summary?.schema, 'narada.nars.delegation_summary.v1');
    assert.equal(summary.worker_server_name, 'narada-test-worker-delegation');
    assert.equal(summary.delegated_task_server_name, 'narada-test-delegated-task');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.delegation.summary');
    assert.equal(summary.workers.count, 1);
    assert.equal(summary.workers.items[0].run_id, 'run_1');
    assert.equal(summary.delegated_tasks.count, 1);
    assert.equal(summary.delegated_tasks.items[0].task_id, 'dtask_1');
    assert.equal(summary.posture.active, 2);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects git summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-git-summary-test-');
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

    const sessionId = 'carrier_20260705050000_git';
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
    const fakeGitServer = {
      tools: [{ name: 'git_status' }, { name: 'git_changed_summary' }, { name: 'git_log' }],
      async send(request) {
        const name = request.params?.name;
        if (name === 'git_status') return { result: { structuredContent: {
          schema: 'narada.git.status.v1',
          status: 'ok',
          working_directory: siteRoot,
          repository_root: siteRoot,
          branch: 'main',
          upstream: 'origin/main',
          ahead: 1,
          behind: 0,
          clean: false,
          status_entries: [{ path: 'src/app.ts', display_path: 'src/app.ts', staged: false, unstaged: true, untracked: false, conflict: false, x: ' ', y: 'M' }],
          staged: [],
          unstaged: ['src/app.ts'],
          untracked: [],
          conflicts: [],
        } } };
        if (name === 'git_changed_summary') return { result: { structuredContent: {
          schema: 'narada.git.changed_summary.v1',
          status: 'ok',
          tracked_changed_count: 1,
          staged_count: 0,
          unstaged_count: 1,
          untracked_count: 0,
          conflict_count: 0,
          tracked_changed_paths: ['src/app.ts'],
          unstaged_paths: ['src/app.ts'],
        } } };
        if (name === 'git_log') return { result: { structuredContent: {
          schema: 'narada.git.log.v1',
          status: 'ok',
          returned: 1,
          commits: [{ hash: 'abcdef123456', short_hash: 'abcdef1', author_name: 'Andrey', author_date: '2026-07-05T00:00:00Z', subject: 'Add panel' }],
        } } };
        return { error: { message: `unexpected git tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'git-summary-1', method: 'session.git.summary', params: { changed_limit: 5, log_limit: 3 } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-git': fakeGitServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_git_summary');
    assert.equal(summary?.schema, 'narada.nars.git_summary.v1');
    assert.equal(summary.server_name, 'narada-test-git');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.git.summary');
    assert.equal(summary.repository.branch, 'main');
    assert.equal(summary.repository.upstream, 'origin/main');
    assert.equal(summary.counts.unstaged, 1);
    assert.equal(summary.changed_files.count, 1);
    assert.equal(summary.changed_files.items[0].path, 'src/app.ts');
    assert.equal(summary.changed_files.items[0].status, 'unstaged');
    assert.equal(summary.recent_commits.count, 1);
    assert.equal(summary.recent_commits.items[0].short_hash, 'abcdef1');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects artifact summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-artifacts-summary-test-');
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

    const sessionId = 'carrier_20260705050000_artifacts';
    const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
    const sessionDir = sitePaths.narsSessionDir;
    mkdirSync(sessionDir, { recursive: true });
    const sourcePath = join(sessionDir, 'artifact-source.html');
    writeFileSync(sourcePath, '<!doctype html><p>Artifact summary</p>', 'utf8');
    const runtimeContext = {
      identity: 'sonar.resident',
      session: sessionId,
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });

    input.write(`${JSON.stringify({ id: 'artifact-register-1', method: 'session.artifacts.register', params: { source_path: sourcePath, kind: 'html', title: 'Artifact Summary Preview' } })}\n`);
    input.write(`${JSON.stringify({ id: 'artifacts-summary-1', method: 'session.artifacts.summary', params: { limit: 5 } })}\n`);
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

    const summary = events.find((event) => event.event === 'session_artifacts_summary');
    assert.equal(summary?.schema, 'narada.nars.artifacts_summary.v1');
    assert.equal(summary.status, 'ok');
    assert.equal(summary.session_id, sessionId);
    assert.equal(summary.artifacts.total, 1);
    assert.equal(summary.artifacts.count, 1);
    assert.equal(summary.artifacts.items[0].title, 'Artifact Summary Preview');
    assert.equal(summary.artifacts.items[0].kind, 'html');
    assert.equal(summary.counts.by_kind.html, 1);
    assert.equal(summary.counts.by_state.active, 1);
    assert.match(summary.artifacts.items[0].content_url, /\/content$/);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects surface feedback summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-surface-feedback-summary-test-');
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

    const sessionId = 'carrier_20260705050000_feedback';
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
    const fakeFeedbackServer = {
      tools: [{ name: 'surface_feedback_list' }, { name: 'surface_feedback_stats' }, { name: 'surface_feedback_doctor' }],
      async send(request) {
        const name = request.params?.name;
        if (name === 'surface_feedback_stats') return { result: { structuredContent: { total: 2, by_surface: { scheduler: 1, git: 1 }, by_kind: { gap: 1, improvement: 1 }, by_status: { submitted: 1, routed: 1 } } } };
        if (name === 'surface_feedback_list') return { result: { structuredContent: { count: 1, limit: 5, offset: 0, items: [{ feedback_id: 'sfb_1', surface_id: 'scheduler', submitter_site_id: 'narada-sonar', submitter_principal: 'codex', kind: 'gap', summary: 'Need schedule topology view', status: 'submitted', created_at: '2026-07-05T00:00:00Z', updated_at: '2026-07-05T00:00:00Z' }] } } };
        if (name === 'surface_feedback_doctor') return { result: { structuredContent: { schema: 'narada.surface_feedback.doctor.v1', status: 'ok', storage_posture: 'canonical_feedback_root', total_feedback_entries: 2 } } };
        return { error: { message: `unexpected feedback tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'feedback-summary-1', method: 'session.surface_feedback.summary', params: { limit: 5 } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-surface-feedback': fakeFeedbackServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_surface_feedback_summary');
    assert.equal(summary?.schema, 'narada.nars.surface_feedback_summary.v1');
    assert.equal(summary.server_name, 'narada-test-surface-feedback');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.surface_feedback.summary');
    assert.equal(summary.stats.total, 2);
    assert.equal(summary.stats.by_status.submitted, 1);
    assert.equal(summary.feedback.count, 1);
    assert.equal(summary.feedback.items[0].feedback_id, 'sfb_1');
    assert.equal(summary.doctor.storage_posture, 'canonical_feedback_root');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode projects task lifecycle summary as an operator-facing DTO', async () => {
  const siteRoot = tempRoot('carrier-task-lifecycle-summary-test-');
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

    const sessionId = 'carrier_20260705050000_tasks';
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
    const fakeTaskLifecycleServer = {
      tools: [
        { name: 'task_lifecycle_workboard_snapshot' },
        { name: 'task_lifecycle_obligations' },
        { name: 'task_lifecycle_search' },
        { name: 'task_lifecycle_claim' },
        { name: 'task_lifecycle_finish' },
      ],
      async send(request) {
        const name = request.params?.name;
        if (name === 'task_lifecycle_workboard_snapshot') {
          return { result: { structuredContent: {
            recommendation: { action: 'continue', reason: 'active task claimed' },
            counts: { in_progress: 1, pending_reviews: 2, deferred: 3 },
            my_in_progress: [{ task_number: 1804, task_id: 'task-1804', title: 'Add Task Lifecycle MCP operator panel', status: 'claimed', assigned_agent: 'sonar.resident', updated_at: '2026-07-05T05:00:00Z' }],
            pending_reviews: [{ task_number: 1811, task_id: 'task-1811', title: 'Review scheduler panel', status: 'awaiting_dependencies', target_role: 'reviewer' }],
          } } };
        }
        if (name === 'task_lifecycle_obligations') {
          return { result: { structuredContent: { obligations: [{ obligation_id: 'obl_1', task_number: 1811, task_id: 'task-1811', title: 'Review scheduler panel', status: 'open', kind: 'review' }], count: 1 } } };
        }
        return { error: { message: `unexpected tool ${name}` } };
      },
    };

    input.write(`${JSON.stringify({ id: 'tasks-summary-1', method: 'session.task_lifecycle.summary', params: { limit: 5 } })}\n`);
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ 'narada-test-task-lifecycle': fakeTaskLifecycleServer }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const summary = events.find((event) => event.event === 'session_task_lifecycle_summary');
    assert.equal(summary?.schema, 'narada.nars.task_lifecycle_summary.v1');
    assert.equal(summary.server_name, 'narada-test-task-lifecycle');
    assert.equal(summary.agent_id, 'sonar.resident');
    assert.equal(summary.affordance_contract?.panel?.summary_method, 'session.task_lifecycle.summary');
    assert.deepEqual(summary.affordance_contract?.actions?.read, ['refresh', 'open_task', 'search_tasks']);
    assert.deepEqual(summary.affordance_contract?.actions?.candidate_write, ['claim_task', 'finish_task']);
    assert.equal(summary.recommendation.action, 'continue');
    assert.equal(summary.counts.in_progress, 1);
    assert.equal(summary.in_progress.count, 1);
    assert.equal(summary.in_progress.items[0].task_number, 1804);
    assert.equal(summary.pending_reviews.count, 1);
    assert.equal(summary.obligations.count, 1);
    assert.equal(summary.obligations.items[0].obligation_id, 'obl_1');
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
      identity: 'resident',
      agentIdentityRef: {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'narada_site', site_id: 'sonar' },
        local_agent_id: 'resident',
        role: 'resident',
        canonical_agent_id: 'sonar.resident',
        display: 'sonar.resident',
        legacy_agent_id: 'resident',
      },
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
    assert.equal(health.agent_id, 'sonar.resident');
    assert.equal(health.agent_identity_ref?.identity_scope?.site_id, 'sonar');
    assert.equal(health.agent_identity_ref?.canonical_agent_id, 'sonar.resident');
    assert.equal(health.site_id, 'sonar');
    assert.equal(health.runtime_mode, 'server');
    assert.equal(health.launch_operator_surface_kind, 'agent-web-ui');
    assert.deepEqual(health.intelligence, { provider: 'codex-subscription', model: 'gpt-5.5', available_models: ['gpt-5.5'], available_providers: ADMITTED_INTELLIGENCE_PROVIDERS, thinking: 'medium', stream: false });
    assert.equal(health.provider, 'codex-subscription');
    assert.equal(health.model, 'gpt-5.5');
    assert.equal(health.thinking, 'medium');
    assert.equal(typeof health.generated_at, 'string');
    assert.equal(typeof health.started_at, 'string');
    assert.equal(health.heartbeat?.path, join(sessionDir, 'heartbeat.json'));
    assert.equal(health.heartbeat?.freshness, 'fresh');
    assert.equal(Number.isInteger(health.heartbeat?.age_ms), true);
    assert.equal(health.activity?.active_turn_state, 'idle');
    assert.deepEqual(health.mcp_tools, []);
    assert.deepEqual(health.mcp?.tools, []);
    assert.equal(health.surface_affordances?.schema, 'narada.nars.surface_affordances.v1');
    assert.equal(health.surface_affordances?.count, 1);
    assert.equal(health.surface_affordances?.items?.[0]?.surface_kind, 'intelligence');
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
