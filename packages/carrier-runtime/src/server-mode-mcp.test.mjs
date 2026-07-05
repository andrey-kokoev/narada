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
    assert.deepEqual(health.intelligence, { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false });
    assert.equal(health.provider, 'codex-subscription');
    assert.equal(health.model, 'gpt-5.5');
    assert.equal(health.thinking, 'medium');
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
