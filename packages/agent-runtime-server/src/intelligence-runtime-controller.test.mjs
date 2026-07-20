import assert from 'node:assert/strict';
import test from 'node:test';
import { createNarsIntelligenceRuntimeController, NarsIntelligenceInvocationError } from './intelligence-runtime-controller.mjs';

const PLAN = {
  id: 'plan:1',
  intent_id: 'intent:1',
  resolver_version: 'resolver:test',
  selected: {
    model: { kind: 'model', id: 'model:test' },
    model_provider: { kind: 'model-provider', id: 'model-provider:test' },
    inference_provider: { kind: 'inference-provider', id: 'inference-provider:test' },
    endpoint: { kind: 'inference-endpoint', id: 'inference-endpoint:test' },
    adapter: { kind: 'adapter', id: 'adapter:test' },
    credential: null,
  },
  route: { offering: { kind: 'model-offering', id: 'model-offering:test' }, topology_id: 'topology:test' },
  options: { thinking: 'high' },
  snapshot: { valid_until: '2026-07-20T00:00:00Z', digest: 'sha256:plan' },
};

function planResult(overrides = {}) {
  return {
    kind: 'plan',
    intent: { id: 'intent:1' },
    plan: PLAN,
    attempt: { id: 'attempt:1' },
    outcome: { id: 'outcome:1', kind: 'success', terminal_at: '2026-07-19T00:00:00Z', admission_acknowledged: true },
    adapterOutcome: { response: { choices: [{ message: { role: 'assistant', content: 'ok' } }] } },
    replayed: false,
    ...overrides,
  };
}

function createFixture({ busy = false, result = planResult() } = {}) {
  const calls = [];
  const transitions = [];
  let runtimeBusy = busy;
  const gateway = { async invoke(request) { calls.push(request); return result; } };
  const controller = createNarsIntelligenceRuntimeController({
    runtimeContext: {
      session: 'session-test',
      intelligence: { principal: 'principal:test' },
      invocationSettings: { invocationScope: { kind: 'test', runtime_session_id: 'session-test' } },
    },
    gateway,
    isBusy: () => runtimeBusy,
    onTransition: (record) => transitions.push(record),
  });
  return { controller, calls, transitions, setBusy: (value) => { runtimeBusy = value; } };
}

test('controller invokes the canonical gateway with stable delivery identity and exposes exact plan coordinates', async () => {
  const fixture = createFixture();
  const events = [];
  const response = await fixture.controller.callIntelligence(
    [{ role: 'user', content: 'hello' }],
    [{ name: 'search' }],
    { turnId: 'turn-1', inputEventId: 'input-1', invocationEventSink: async (event) => events.push(event) },
  );
  assert.equal(response.choices[0].message.content, 'ok');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].principal, 'principal:test');
  assert.match(fixture.calls[0].operationId, /^operation:nars:session-test:input-1:[a-f0-9]{64}$/);
  assert.equal(fixture.calls[0].messages[0].content, 'hello');
  assert.deepEqual(fixture.calls[0].invocationScope, { kind: 'test', runtime_session_id: 'session-test' });
  assert.equal(events[0].kind, 'invokable_intelligence_terminal');
  assert.equal(fixture.controller.snapshot().latest_plan.inference_provider.id, 'inference-provider:test');
  assert.equal(fixture.controller.snapshot().latest_outcome.kind, 'success');
  assert.equal('provider' in fixture.controller.snapshot(), false);
});

test('controller forwards explicit intent and operation identities for transport-level retry and replay', async () => {
  const fixture = createFixture();
  await fixture.controller.callIntelligence(
    [{ role: 'user', content: 'same payload' }],
    [],
    {
      intentId: 'intent:stable',
      operationId: 'operation:stable:retry-1',
      mode: 'retry',
      allowReplan: false,
      inputEventId: 'input-retry',
    },
  );
  assert.equal(fixture.calls[0].intentId, 'intent:stable');
  assert.equal(fixture.calls[0].operationId, 'operation:stable:retry-1');
  assert.equal(fixture.calls[0].mode, 'retry');
  assert.equal(fixture.calls[0].allowReplan, false);
});

test('controller preserves typed canonical refusal and does not manufacture an invocation result', async () => {
  const refusal = {
    kind: 'refusal',
    intent: { id: 'intent:refused' },
    refusal: { id: 'refusal:1', reason_code: 'access-denied', explanation: 'no admitted route' },
    outcome: { id: 'outcome:refused', kind: 'pre-invocation-refusal' },
  };
  const fixture = createFixture({ result: refusal });
  await assert.rejects(
    fixture.controller.callIntelligence([], [], { inputEventId: 'input-refused' }),
    (error) => error instanceof NarsIntelligenceInvocationError
      && error.code === 'intelligence_refused:access-denied'
      && error.result === refusal,
  );
  assert.equal(fixture.controller.snapshot().latest_outcome.kind, 'pre-invocation-refusal');
});

test('controller refuses legacy provider/model/thinking reconfiguration inputs', async () => {
  const fixture = createFixture();
  const result = await fixture.controller.reconfigure({ request_id: 'legacy-1', provider: 'openai-api' });
  assert.equal(result.terminal_state, 'refused');
  assert.equal(result.reason, 'target_not_admitted');
  assert.equal(result.error, 'intelligence_reconfiguration_legacy_selection_forbidden');
  assert.deepEqual(fixture.transitions.map((record) => record.reconfiguration_state), [
    'requested', 'validating', 'refused',
  ]);
});

test('controller activates canonical model/options constraints only at a clean turn boundary', async () => {
  const fixture = createFixture({ busy: true });
  const refused = await fixture.controller.reconfigure({
    request_id: 'busy-1',
    model_ref: 'model:next',
    requested_options: { thinking: 'high', batch: false },
  });
  assert.equal(refused.terminal_state, 'refused');
  assert.equal(fixture.controller.snapshot().requested_model, null);
  fixture.setBusy(false);
  const active = await fixture.controller.reconfigure({
    request_id: 'active-1',
    requested_model: { kind: 'model', id: 'model:next' },
    requested_options: { thinking: 'high', batch: false },
  });
  assert.equal(active.terminal_state, 'active');
  await fixture.controller.callIntelligence([], [], { inputEventId: 'input-2' });
  assert.deepEqual(fixture.calls[0].requestedModel, { kind: 'model', id: 'model:next' });
  assert.deepEqual(fixture.calls[0].requestedOptions, { thinking: 'high', batch: false });
});

test('a durable replay without retained payload is not redispatched or misreported as a fresh response', async () => {
  const fixture = createFixture({ result: planResult({ adapterOutcome: null, replayed: true }) });
  await assert.rejects(
    fixture.controller.callIntelligence([], [], { inputEventId: 'input-replay' }),
    (error) => error instanceof NarsIntelligenceInvocationError
      && error.code === 'intelligence_result_payload_unavailable',
  );
});
