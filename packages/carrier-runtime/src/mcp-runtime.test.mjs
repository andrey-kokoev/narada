import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateTools,
  applyWorkerMcpProjection,
  discoverAndStartMcpServers,
  drainMcpStdoutMessages,
  parseWorkerMcpProjectionConfig,
  sendMcpRequest,
} from './mcp-runtime.mjs';
import { removeTempDir, tempRoot, waitFor, writeFixtureMcpSurface } from './server-mode-test-helpers.mjs';

function tool(name) {
  return {
    name,
    description: `${name} fixture`,
    inputSchema: { type: 'object', properties: {} },
  };
}

function fixtureServers() {
  return {
    'narada-sonar-agent-context': {
      tools: [
        tool('agent_context_startup_sequence'),
        tool('agent_context_whoami'),
        tool('agent_context_list_sessions'),
      ],
    },
    'narada-sonar-mailbox': {
      tools: [
        tool('mailbox_messages_list'),
        tool('mailbox_message_show'),
        tool('mailbox_folders_list'),
      ],
    },
    'narada-sonar-graph-mail': { tools: [tool('graph_mail_messages_list'), tool('graph_mail_draft_create')] },
    'narada-sonar-git': { tools: [tool('git_status'), tool('git_diff')] },
    'narada-sonar-scheduler': { tools: [tool('scheduler_tasks_list')] },
    'narada-sonar-sop': { tools: [tool('sop_run_start'), tool('sop_run_advance')] },
    'narada-sonar-worker-delegation': { tools: [tool('worker_run'), tool('worker_run_status')] },
    'narada-sonar-surface-feedback': { tools: [tool('surface_feedback_submit')] },
  };
}

test('worker MCP projection scopes delegated worker tools below provider limits', () => {
  const config = parseWorkerMcpProjectionConfig(JSON.stringify({
    native_mcp_mode: 'scoped',
    mcp_tool_allowlist: ['mailbox_messages_list'],
    include_startup_tools: true,
  }));
  const projected = applyWorkerMcpProjection(fixtureServers(), config);
  const providerToolNames = aggregateTools(projected).map((item) => item.function.name).sort();

  assert.deepEqual(providerToolNames, [
    'agent_context_startup_sequence',
    'agent_context_whoami',
    'mailbox_messages_list',
  ].sort());
  assert.equal(providerToolNames.includes('mailbox_messages_list'), true);
  assert.equal(providerToolNames.includes('mailbox_message_show'), false);
  assert.equal(providerToolNames.includes('graph_mail_messages_list'), false);
  assert.equal(providerToolNames.includes('git_status'), false);
  assert.equal(providerToolNames.includes('scheduler_tasks_list'), false);
  assert.equal(providerToolNames.includes('sop_run_start'), false);
  assert.equal(providerToolNames.includes('worker_run'), false);
  assert.equal(providerToolNames.includes('surface_feedback_submit'), false);
  assert.equal(providerToolNames.length < 128, true);
  assert.equal(Object.keys(projected).length, Object.keys(fixtureServers()).length);
  assert.deepEqual(projected['narada-sonar-graph-mail'].tools, []);
});

test('MCP stdout parser accepts content-length frames and JSONL responses', () => {
  const framed = JSON.stringify({ jsonrpc: '2.0', id: 'framed', result: { ok: true } });
  const jsonl = JSON.stringify({ jsonrpc: '2.0', id: 'jsonl', result: { ok: true } });
  const drained = drainMcpStdoutMessages(`Content-Length: ${Buffer.byteLength(framed)}\r\n\r\n${framed}${jsonl}\n`);

  assert.deepEqual(drained.messages.map((message) => message.id), ['framed', 'jsonl']);
  assert.equal(drained.rest, '');
  assert.deepEqual(drained.stdoutPollution, []);
});

test('worker MCP projection admits explicit full mode unchanged', () => {
  const servers = fixtureServers();
  const projected = applyWorkerMcpProjection(servers, { native_mcp_mode: 'full' });
  assert.equal(projected, servers);
  assert.equal(aggregateTools(projected).length > 8, true);
});

test('worker MCP projection supports server-qualified requested tool names', () => {
  const projected = applyWorkerMcpProjection(fixtureServers(), parseWorkerMcpProjectionConfig(JSON.stringify({
    native_mcp_mode: 'scoped',
    mcp_tool_allowlist: ['narada-sonar-mailbox.mailbox_messages_list'],
    include_startup_tools: false,
  })));
  assert.deepEqual(aggregateTools(projected).map((item) => item.function.name), ['mailbox_messages_list']);
});

test('runtime MCP server restarts after child transport exits between requests', async () => {
  const siteRoot = tempRoot('carrier-mcp-restart-test-');
  let server;
  try {
    writeFixtureMcpSurface(siteRoot);
    const servers = await discoverAndStartMcpServers(siteRoot, {
      launch_session_id: 'launch_fixture_session',
      process_role: 'runtime_server',
      created_by_pid: process.pid,
      pid: process.pid,
    });
    server = servers['narada-fixture'];
    assert.ok(server);
    assert.equal(server.process_ownership?.schema, 'narada.launch_process_ownership.v1');
    assert.equal(server.process_ownership?.launch_session_id, 'launch_fixture_session');
    assert.equal(server.process_ownership?.ownership, 'session_owned');
    assert.equal(server.process_ownership?.process_role, 'mcp_child');
    assert.equal(server.process_ownership?.parent_process_role, 'runtime_server');
    assert.equal(server.process_ownership?.server_name, 'narada-fixture');
    assert.equal(server.process_ownership?.created_by_pid, process.pid);
    assert.equal(server.process_ownership?.evidence_status, 'complete');

    const first = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 'fixture-first',
      method: 'tools/call',
      params: { name: 'fixture_read', arguments: { topic: 'first' } },
    });
    assert.match(first.content?.[0]?.text ?? '', /first/);
    const firstPid = server.process?.child?.pid ?? server.process?.pid;

    await waitFor(() => (server.process?.child?.exitCode ?? server.process?.exitCode) !== null || (server.process?.child?.signalCode ?? server.process?.signalCode) !== null, { timeoutMs: 1000 });

    const second = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 'fixture-second',
      method: 'tools/call',
      params: { name: 'fixture_read', arguments: { topic: 'second' } },
    });
    assert.match(second.content?.[0]?.text ?? '', /second/);
    assert.notEqual(server.process?.child?.pid ?? server.process?.pid, firstPid);
    assert.equal(server.process_ownership?.pid, server.process?.child?.pid ?? server.process?.pid);
    assert.equal(server.restart_count, 1);
    assert.equal(server.last_restart_error, null);
  } finally {
    if (server?.process && (server.process.child?.exitCode ?? server.process.exitCode) === null && (server.process.child?.signalCode ?? server.process.signalCode) === null) server.process.kill();
    removeTempDir(siteRoot);
  }
});
