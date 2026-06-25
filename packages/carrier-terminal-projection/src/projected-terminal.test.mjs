import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOperatorStyle,
  createProjectedSlashCommandAction,
  renderMarkdownForProjectedTerminal,
  renderOperatorEvent,
  styleInlineCode,
} from './projected-terminal.mjs';

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
