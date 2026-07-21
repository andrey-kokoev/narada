import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProviderTurnContext,
  normalizeProviderConversationContent,
  requestRejectionCode,
  sessionSubmitInvocationControl,
  sessionCommandResult,
  shouldPersistNarsRuntimeRequestTransition,
  createDisabledIntelligenceToolGateway,
  createScopedIntelligenceToolGateway,
} from './session-core-runtime-service.mjs';

test('session.submit normalizes explicit retry and replay controls at the public boundary', () => {
  assert.deepEqual(sessionSubmitInvocationControl({
    params: {
      intelligence_invocation: {
        intent_id: 'intent:session-test',
        operation_id: 'operation:session-test:retry-1',
        mode: 'retry',
        allow_replan: false,
      },
    },
  }), {
    schema: 'narada.invokable-intelligence.invocation-control.v1',
    intent_id: 'intent:session-test',
    operation_id: 'operation:session-test:retry-1',
    mode: 'retry',
    allow_replan: false,
  });
  assert.throws(
    () => sessionSubmitInvocationControl({ params: { intelligence_invocation: { mode: 'replay' } } }),
    /requires both intent_id and operation_id/,
  );
});

test('retry and replay controls rebuild the original intent payload instead of accumulating failed turns', () => {
  const context = buildProviderTurnContext({
    eventsPath: 'unused-for-explicit-lineage-mode',
    input: {
      event_id: 'input-retry',
      request_id: 'request-retry',
      content: 'same admitted payload',
      metadata: {
        intelligence_invocation: {
          schema: 'narada.invokable-intelligence.invocation-control.v1',
          intent_id: 'intent:same',
          operation_id: 'operation:same:retry',
          mode: 'retry',
          allow_replan: true,
        },
      },
    },
  });
  assert.deepEqual(context.messages, [{ role: 'user', content: 'same admitted payload' }]);
  assert.deepEqual(context.settings, {
    intentId: 'intent:same',
    operationId: 'operation:same:retry',
    mode: 'retry',
    allowReplan: true,
    requestId: 'request-retry',
  });
});

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
  assert.equal(
    requestRejectionCode('session.submit', '$.mode: must be one of immediate, retry'),
    'invalid_intelligence_invocation_control',
  );
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

test('mcp scope none exposes a disabled, non-dispatching capability gateway', async () => {
  const gateway = createDisabledIntelligenceToolGateway();
  assert.deepEqual(await gateway.toolCatalog(), []);
  assert.equal(gateway.operationalState(), 'disabled');
  assert.deepEqual(await gateway.invoke({ toolName: 'shell.exec' }), {
    schema: 'narada.nars.mcp-admission.v1',
    status: 'denied',
    admission_action: 'deny',
    admission_reason: 'mcp_scope_none',
    error: 'mcp_scope_none',
  });
  await gateway.close();
});

test('mcp scope none ignores an injected capability gateway', async () => {
  let catalogCalls = 0;
  let invokeCalls = 0;
  const injected = {
    toolCatalog: async () => { catalogCalls += 1; return [{ name: 'should-not-leak' }]; },
    invoke: async () => { invokeCalls += 1; return { status: 'ok' }; },
    operationalState: () => 'healthy',
    close: async () => {},
  };
  const scoped = createScopedIntelligenceToolGateway({ mcpScope: 'none', toolGateway: injected });
  assert.deepEqual(await scoped.toolCatalog(), []);
  assert.equal(scoped.operationalState(), 'disabled');
  assert.equal(catalogCalls, 0);
  assert.equal(invokeCalls, 0);
  await scoped.invoke({ toolName: 'should-not-leak' });
  assert.equal(invokeCalls, 0);
});

test('unadmitted mcp scope is fail-closed as disabled', async () => {
  let catalogCalls = 0;
  const injected = {
    toolCatalog: async () => { catalogCalls += 1; return [{ name: 'should-not-leak' }]; },
    invoke: async () => ({ status: 'ok' }),
    operationalState: () => 'healthy',
    close: async () => {},
  };
  const scoped = createScopedIntelligenceToolGateway({ mcpScope: 'ambient-host', toolGateway: injected });
  assert.equal(scoped.operationalState(), 'disabled');
  assert.deepEqual(await scoped.toolCatalog(), []);
  assert.equal(catalogCalls, 0);
});

test('non-health request transitions remain durable', () => {
  assert.equal(shouldPersistNarsRuntimeRequestTransition({
    method: 'session.submit',
    request_state: 'completed',
    terminal_state: 'completed',
  }), true);
});
