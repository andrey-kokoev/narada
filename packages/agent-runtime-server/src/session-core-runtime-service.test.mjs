import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProviderConversationContent,
  requestRejectionCode,
  sessionCommandResult,
  shouldPersistNarsRuntimeRequestTransition,
} from './session-core-runtime-service.mjs';

test('provider conversation normalization preserves text and artifact references', () => {
  const content = normalizeProviderConversationContent([
    { type: 'text', text: 'The report is ready.' },
    { type: 'artifact_ref', artifact_id: 'art_report', kind: 'html', title: 'Report' },
  ]);
  assert.equal(content, 'The report is ready.\n[Artifact Report (html); id=art_report]');
  assert.equal(content.includes('[object Object]'), false);
});

test('supported control failures retain method-specific rejection codes', () => {
  assert.equal(requestRejectionCode('session.submit', 'provider_failed'), 'request_dispatch_failed');
  assert.equal(requestRejectionCode('session.health', 'health_failed'), 'session_control_failed');
  assert.equal(requestRejectionCode('runtime.intelligence.reconfigure', 'binding_failed'), 'runtime_reconfiguration_failed');
  assert.equal(requestRejectionCode('legacy.mutate', 'unsupported_session_control'), 'unsupported_session_control');
});

test('session command execution resolves shared aliases without provider dispatch', () => {
  const supervisor = { health: () => ({ lifecycle_state: 'ready' }) };
  const result = sessionCommandResult('/tool', '', supervisor, {}, {}, {}, null);
  assert.deepEqual(result, {
    command: '/tools',
    value: '',
    command_name: 'tools',
    status: 'ok',
    summary: 'Show discovered MCP tools and input schemas',
    terminal_state: 'completed',
  });
});

test('routine session health transitions stay out of the durable session event stream', () => {
  for (const requestState of ['received', 'scheduled', 'running', 'completed']) {
    assert.equal(shouldPersistNarsRuntimeRequestTransition({
      method: 'session.health',
      request_state: requestState,
      terminal_state: requestState === 'completed' ? 'completed' : null,
    }), false, requestState);
  }
});

test('failed health transitions remain durable diagnostics', () => {
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.health',
    request_state: 'failed',
    terminal_state: 'failed',
  }), true);
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.health',
    request_state: 'rejected',
    terminal_state: 'rejected',
  }), true);
});

test('non-health request transitions remain durable', () => {
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.submit',
    request_state: 'completed',
    terminal_state: 'completed',
  }), true);
});
