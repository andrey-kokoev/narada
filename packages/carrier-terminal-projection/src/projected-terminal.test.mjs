import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectedSlashCommandAction,
  renderOperatorEvent,
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
