import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarsPiCapabilityGateway, isNativePiToolName, normalizeNarsGatewayTool } from './tool-adapter.mjs';

test('Pi native shell and mutation tools are not visible', () => {
  assert.equal(isNativePiToolName('bash'), true);
  assert.equal(isNativePiToolName('filesystem_write'), true);
  assert.equal(isNativePiToolName('grep'), true);
  assert.equal(isNativePiToolName('narada_task_read'), false);
  assert.throws(() => normalizeNarsGatewayTool({ type: 'function', function: { name: 'shell' }, nars_gateway_proxy: true }), /pi_native_tool_forbidden/);
  assert.throws(() => normalizeNarsGatewayTool({ name: 'custom_tool', native: true }), /pi_native_tool_forbidden/);
  assert.throws(() => normalizeNarsGatewayTool({ name: 'ambient_tool', source: 'ambient' }), /pi_native_tool_forbidden/);
});

test('gateway proxy carries correlation and never confirms an external effect', async () => {
  const calls = [];
  const gateway = createNarsPiCapabilityGateway({
    context: { agent_id: 'agent', session_id: 'session', turn_id: 'turn' },
    gateway: {
      toolCatalog: async () => [{ type: 'function', function: { name: 'read_note', parameters: { type: 'object' } }, nars_gateway_proxy: true }],
      invoke: async (request) => { calls.push(request); return { status: 'completed', result: { text: 'ok' } }; },
    },
  });
  assert.equal((await gateway.listTools())[0].nars_gateway_proxy, true);
  const result = await gateway.execute({ tool_name: 'read_note', tool_call_id: 'call-1', arguments: { path: 'x' } });
  assert.equal(result.effect_confirmation, 'not-confirmed');
  assert.equal(calls[0].sessionId, 'session');
  assert.equal(calls[0].toolCallId, 'call-1');
  assert.equal(calls[0].inputEventId, null);
  assert.equal(result.context.authority_posture, 'nars-admitted');
  assert.equal(result.context.capability_identity, 'capability:read_note');
  assert.equal(result.execution_evidence, null);
  assert.equal(result.reconciliation_state, null);
});

test('refused native tool is structured', async () => {
  const events = [];
  const gateway = createNarsPiCapabilityGateway({
    eventSink: async (event) => events.push(event),
    gateway: { invoke: async () => { throw new Error('must not run'); } },
  });
  const result = await gateway.execute({ tool_name: 'bash', arguments: { command: 'echo unsafe' } });
  assert.equal(result.status, 'denied');
  assert.equal(result.admission_reason, 'native_pi_tool_not_admitted');
  assert.equal(result.context.capability_identity, 'capability:bash');
  assert.equal(events.at(-1).kind, 'pi_tool_proxy_refused');
});

test('execute-only capability gateways remain supported without widening Pi authority', async () => {
  const calls = [];
  const gateway = createNarsPiCapabilityGateway({
    gateway: {
      toolCatalog: async () => [{ type: 'function', function: { name: 'read_note' }, nars_gateway_proxy: true }],
      execute: async (request) => {
        calls.push(request);
        return { status: 'completed', result: { read_only: true } };
      },
    },
  });
  const result = await gateway.execute({ tool_name: 'read_note', tool_call_id: 'call-execute-only' });
  assert.equal(result.status, 'completed');
  assert.equal(calls[0].tool_name, 'read_note');
  assert.equal(result.effect_confirmation, 'not-confirmed');
});
