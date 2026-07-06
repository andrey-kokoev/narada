import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  bracketedPasteControlSequences,
  createExplicitJsonControlFrame,
  createOperatorStyle,
  createProjectedTerminalBridge,
  createProjectedSlashCommandAction,
  renderMarkdownForProjectedTerminal,
  renderOperatorEvent,
  styleInlineCode,
} from './projected-terminal.mjs';
import { countReadlineSubmissionsForPaste, createBracketedPasteComposer, projectedHelpText } from './projected-input.mjs';

test('projected slash commands produce NARS protocol frames', () => {
  assert.equal(createProjectedSlashCommandAction('/help').kind, 'local_help');
  assert.equal(createProjectedSlashCommandAction('/clear').kind, 'clear');
  assert.equal(createProjectedSlashCommandAction('/status').frame.method, 'session.status');
  assert.equal(createProjectedSlashCommandAction('/health').frame.method, 'session.health');
  assert.equal(createProjectedSlashCommandAction('/events').frame.method, 'session.events.subscribe');
  assert.equal(createProjectedSlashCommandAction('/interrupt').frame.method, 'conversation.interrupt');
  assert.equal(createProjectedSlashCommandAction('/exit').frame.method, 'session.close');
  assert.equal(createProjectedSlashCommandAction('/tool').frame.params.command, '/tool');
  assert.equal(createProjectedSlashCommandAction('/queue clear').frame.params.command, '/queue');
  assert.equal(createProjectedSlashCommandAction('exit').frame.method, 'session.close');
  assert.equal(createExplicitJsonControlFrame('/json {"id":"status-1","method":"session.status","params":{}}').frame.method, 'session.status');
  assert.equal(createExplicitJsonControlFrame('/json {"id":"bad-1","method":"bad.method","params":{}}').error, '/json Unsupported method: bad.method');
  assert.match(projectedHelpText(), /\/interrupt\s+Interrupt active response/);
});

test('startup event renders operator-facing runtime summary rows', () => {
  const rendered = renderOperatorEvent({
    event: 'session_started',
    agent_id: 'narada.test',
    session_id: 'carrier_test',
    provider: 'codex-subscription',
    model: 'gpt-5.5',
    thinking: 'medium',
    stream: true,
    mcp_server_count: 1,
    mcp_operational_state: 'healthy',
    authority_runtime_host: 'cloudflare-host',
    authority_epoch: 4,
    authority_transition_state: 'target_active',
    authority_locator_ref: 'authority_locator:cloudflare-host/site/cf_session',
    mcp_servers: [{ name: 'narada-test-agent-context', tool_count: 8 }],
    tool_count: 8,
    tool_outputs: 'shown',
    approvals: 'disabled',
    help: '/help',
  });
  assert.equal(rendered.some((line) => line.includes('agent-cli')), true);
  assert.equal(rendered.some((line) => line.includes('narada.test')), true);
  assert.equal(rendered.some((line) => line.includes('cloudflare-host epoch 4')), true);
  assert.equal(rendered.some((line) => line.includes('target_active')), true);
  assert.equal(rendered.some((line) => line.includes('authority_locator:cloudflare-host/site/cf_session')), true);
  assert.equal(rendered.some((line) => line.includes('narada-test-agent-context')), true);
});

test('operator event rendering shows stale authority reattach target distinctly', () => {
  const rendered = renderOperatorEvent({
    event: 'authority_source_write_refused',
    code: 'authority_source_sealed',
    authority_transition_source: {
      state: 'sealed',
      target_authority_locator: { kind: 'cloudflare-host', site_id: 'site', session_id: 'cf_session' },
    },
  }, { timestamps: false });
  assert.deepEqual(rendered, ['Source write refused: authority_source_sealed; reattach cloudflare-host/site/cf_session']);
});

test('operator event rendering consumes shared NARS client event projection', () => {
  const wrapped = renderOperatorEvent({
    event: 'session_event',
    payload: {
      event: 'websocket_error',
      message: 'connection dropped',
    },
  }, { timestamps: false });
  assert.deepEqual(wrapped, ['WebSocket error: connection dropped']);
});

test('operator event rendering keeps session status distinct from health', () => {
  const rendered = renderOperatorEvent({
    event: 'session_status',
    operational_posture: 'healthy',
    request_outcome_summary: '0',
  }, { timestamps: false });
  assert.deepEqual(rendered, ['agent-cli: status healthy; requests 0']);
});

test('operator event rendering shows session sync operation results', () => {
  assert.deepEqual(renderOperatorEvent({ event: 'session_sync', success: true, direction: 'upload', target: 'D:/tmp/session-sync' }, { timestamps: false }), ['agent-cli: session sync succeeded; upload D:/tmp/session-sync']);
});

test('operator event rendering suppresses routine healthy session health polling', () => {
  const event = {
    event: 'session_health',
    status: 'healthy',
    mcp: { operational_state: 'healthy' },
    health_endpoint: null,
    mcp_startup_failure_count: 0,
    mcp_runtime_fault_count: 0,
  };
  assert.deepEqual(renderOperatorEvent(event, { timestamps: false }), []);
  assert.deepEqual(renderOperatorEvent(event, { timestamps: false, projectionVerbosity: 'conversation' }), []);
  assert.deepEqual(renderOperatorEvent(event, { timestamps: false, projectionVerbosity: 'diagnostics' }), []);
  assert.deepEqual(renderOperatorEvent(event, { timestamps: false, projectionVerbosity: 'raw' }), []);
});

test('operator event rendering hides session mechanics at conversation verbosity', () => {
  assert.deepEqual(renderOperatorEvent({ event: 'session_started', agent_id: 'resident', session_id: 'carrier_test' }, { timestamps: false, projectionVerbosity: 'conversation' }), []);
  assert.deepEqual(renderOperatorEvent({ event: 'session_events_subscription_started', replay_count: 3 }, { timestamps: false, projectionVerbosity: 'operations' }), []);
  assert.equal(renderOperatorEvent({ event: 'session_events_subscription_started', replay_count: 3 }, { timestamps: false, projectionVerbosity: 'diagnostics' })[0], 'agent-cli: events subscription unknown; replay 3; cursor unknown');
});

test('operator event rendering keeps unhealthy session health visible', () => {
  const rendered = renderOperatorEvent({
    event: 'session_health',
    status: 'degraded',
    mcp: { operational_state: 'faulted' },
    health_endpoint: '/api/health',
    mcp_runtime_fault_count: 1,
  }, { timestamps: false });
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].includes('health degraded; mcp faulted; endpoint /api/health'), true);
});

test('operator event rendering shows shared user messages from other attached surfaces', () => {
  const rendered = renderOperatorEvent({
    event: 'user_message',
    content: 'Run startup sequence',
    source: 'agent-web-ui',
  }, { timestamps: false });
  assert.deepEqual(rendered, ['operator:', '  Run startup sequence']);
});

test('operator event rendering accepts terminalColumns alias for wrapping', () => {
  const rendered = renderOperatorEvent({
    event: 'assistant_message',
    agent_id: 'narada.test',
    content: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
  }, { timestamps: false, terminalColumns: 48 });
  assert.equal(rendered.length > 1, true);
  assert.equal(rendered.slice(1).every((line) => line.startsWith('  ')), true);
});

test('projected terminal markdown renders bold outside inline code', () => {
  const style = createOperatorStyle({ enabled: true });
  const rendered = renderMarkdownForProjectedTerminal('Use **bold** and `**code**`.', style);
  assert.equal(rendered.includes('\x1b[1mbold\x1b[0m'), true);
  assert.equal(rendered.includes('\x1b[90m**code**\x1b[0m'), true);
  assert.equal(rendered.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, ''), 'Use bold and **code**.');
});

test('projected terminal inline formatter accepts partial styles', () => {
  assert.equal(styleInlineCode('Use **bold** and `code`.', { code: (value) => `[${value}]` }), 'Use bold and [code].');
});

test('projected stream renders triple-backtick code blocks as code', () => {
  const style = createOperatorStyle({ enabled: true });
  const state = { streamedTurns: new Set(), timestamps: false, style };
  assert.deepEqual(renderOperatorEvent({ event: 'assistant_message_stream', turn_id: 'turn_code', agent_id: 'narada.test', content: '```text\n' }, state), []);
  const rendered = renderOperatorEvent({ event: 'assistant_message_stream', turn_id: 'turn_code', agent_id: 'narada.test', content: 'do everything atomically or roll everything back\n```' }, state);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].raw.includes('```'), false);
  assert.equal(rendered[0].raw.includes('\x1b[90m  do everything atomically or roll everything back\x1b[0m'), true);
});

test('bracketed paste composer emits one paste payload and suppresses readline submissions', () => {
  const pasted = 'Commit: abc\nMessage: hello\n\nWhat changed:\n- one';
  const seen = [];
  let suppressed = 0;
  const composer = createBracketedPasteComposer({
    onSuppressLines: (count) => { suppressed += count; },
    onPaste: (text) => { seen.push(text); },
  });

  assert.equal(countReadlineSubmissionsForPaste(pasted), 4);
  assert.equal(composer.feed(`${bracketedPasteControlSequences.start}${pasted}${bracketedPasteControlSequences.end}`), true);
  assert.deepEqual(seen, [pasted]);
  assert.equal(suppressed, 4);
  assert.equal(composer.isActive(), false);
});

test('projected terminal bridge inserts bracketed multiline paste and submits on enter', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  const childStdin = new PassThrough();
  const frames = [];
  childStdin.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').trim().split(/\n/).filter(Boolean)) frames.push(JSON.parse(line));
  });

  const bridge = createProjectedTerminalBridge({
    input,
    output,
    childStdin,
    style: createOperatorStyle({ enabled: false }),
  });
  const pasted = 'Commit: f08e99bd\nMessage: Move synced email workflow behind SOP shell\n\nWhat changed:\n- Refactored loop body';
  input.write(`${bracketedPasteControlSequences.start}${pasted}${bracketedPasteControlSequences.end}`);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(frames.length, 0);
  assert.equal(bridge.composer.getDraft(), pasted);

  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.close();

  assert.equal(frames.length, 1);
  assert.equal(frames[0].method, 'conversation.send');
  assert.equal(frames[0].params.message, pasted);
});

test('projected terminal bridge keeps multiline slash-looking paste as draft until enter', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  const childStdin = new PassThrough();
  const frames = [];
  childStdin.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').trim().split(/\n/).filter(Boolean)) frames.push(JSON.parse(line));
  });

  const bridge = createProjectedTerminalBridge({
    input,
    output,
    childStdin,
    style: createOperatorStyle({ enabled: false }),
  });
  const pasted = '/status\nthis is copied prose, not a command sequence';
  input.write(`${bracketedPasteControlSequences.start}${pasted}${bracketedPasteControlSequences.end}`);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(frames.length, 0);
  assert.equal(bridge.composer.getDraft(), pasted);

  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.close();

  assert.equal(frames.length, 1);
  assert.equal(frames[0].method, 'conversation.send');
  assert.equal(frames[0].params.message, pasted);
});

test('projected terminal bridge handles raw navigation escape sequences in draft', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  const childStdin = new PassThrough();

  const bridge = createProjectedTerminalBridge({
    input,
    output,
    childStdin,
    style: createOperatorStyle({ enabled: false }),
  });

  input.write('abc');
  input.write('\x1b[H');
  input.write('X');
  input.write('\x1b[F');
  input.write('Y');
  input.write('\x1b[D');
  input.write('Z');
  input.write('\x1b[1~');
  input.write('S');
  input.write('\x1b[4~');
  input.write('E');
  input.write('\x1b[D');
  input.write('\x1b[3~');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.close();

  assert.equal(bridge.composer.getDraft(), 'SXabcZY');
  assert.equal(bridge.composer.getDraft().includes('[H'), false);
});

test('projected terminal bridge repaints multiline draft after async output', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  let terminalText = '';
  output.on('data', (chunk) => { terminalText += chunk.toString('utf8'); });
  const childStdin = new PassThrough();

  const bridge = createProjectedTerminalBridge({
    input,
    output,
    childStdin,
    style: createOperatorStyle({ enabled: false }),
  });
  const pasted = 'line 1\nline 2\nline 3';
  input.write(`${bracketedPasteControlSequences.start}${pasted}${bracketedPasteControlSequences.end}`);
  await new Promise((resolve) => setImmediate(resolve));

  bridge.writeProjectedOutput('agent-cli: turn complete 2026-06-25T16:06:09\n');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.close();

  const plain = terminalText.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  assert.equal(plain.includes('line 3or > line 1'), false);
  assert.equal(plain.includes('agent-cli: turn complete 2026-06-25T16:06:09\noperator > line 1\n  line 2\n  line 3'), true);
  assert.equal(bridge.composer.getDraft(), pasted);
});

test('projected terminal bridge enqueues ordinary input while a turn is active', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  const childStdin = new PassThrough();
  const frames = [];
  childStdin.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').trim().split(/\n/).filter(Boolean)) frames.push(JSON.parse(line));
  });

  const bridge = createProjectedTerminalBridge({
    input,
    output,
    childStdin,
    style: createOperatorStyle({ enabled: false }),
  });

  bridge.renderEvent({ event: 'turn_started', turn_id: 'turn_active', agent_id: 'agent' });
  input.write('steer this turn');
  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.renderEvent({ event: 'turn_complete', turn_id: 'turn_active', terminal_state: 'interrupted' });
  input.write('new turn');
  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.close();

  assert.equal(frames.length, 2);
  assert.equal(frames[0].method, 'conversation.enqueue');
  assert.equal(frames[0].params.message, 'steer this turn');
  assert.equal(frames[1].method, 'conversation.send');
  assert.equal(frames[1].params.message, 'new turn');
});
