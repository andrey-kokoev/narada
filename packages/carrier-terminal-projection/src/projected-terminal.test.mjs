import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  bracketedPasteControlSequences,
  createOperatorStyle,
  createProjectedTerminalBridge,
  createProjectedSlashCommandAction,
  renderMarkdownForProjectedTerminal,
  renderOperatorEvent,
  styleInlineCode,
} from './projected-terminal.mjs';
import { countReadlineSubmissionsForPaste, createBracketedPasteComposer } from './projected-input.mjs';

test('projected slash commands produce NARS protocol frames', () => {
  assert.equal(createProjectedSlashCommandAction('/help').kind, 'local_help');
  assert.equal(createProjectedSlashCommandAction('/clear').kind, 'clear');
  assert.equal(createProjectedSlashCommandAction('/status').frame.method, 'session.status');
  assert.equal(createProjectedSlashCommandAction('/health').frame.method, 'session.health');
  assert.equal(createProjectedSlashCommandAction('/events').frame.method, 'session.events.subscribe');
  assert.equal(createProjectedSlashCommandAction('/exit').frame.method, 'session.close');
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
    mcp_servers: [{ name: 'narada-test-agent-context', tool_count: 8 }],
    tool_count: 8,
    tool_outputs: 'shown',
    approvals: 'disabled',
    help: '/help',
  });
  assert.equal(rendered.some((line) => line.includes('agent-cli')), true);
  assert.equal(rendered.some((line) => line.includes('narada.test')), true);
  assert.equal(rendered.some((line) => line.includes('narada-test-agent-context')), true);
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
  assert.equal(bridge.rl.line, pasted);

  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.rl.close();

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
  assert.equal(bridge.rl.line, pasted);

  input.write('\r');
  await new Promise((resolve) => setImmediate(resolve));
  bridge.rl.close();

  assert.equal(frames.length, 1);
  assert.equal(frames[0].method, 'conversation.send');
  assert.equal(frames[0].params.message, pasted);
});
