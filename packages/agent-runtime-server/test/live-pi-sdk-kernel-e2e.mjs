import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { createNarsPiSdkKernel } from '@narada2/nars-pi-kernel';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { createSessionCoreRuntimeService } from '../src/session-core-runtime-service.mjs';

function waitFor(predicate, timeoutMs = 5000, label = 'condition') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const value = predicate();
        if (value) { resolve(value); return; }
      } catch (error) { reject(error); return; }
      if (Date.now() - started > timeoutMs) { reject(new Error(`live_pi_e2e_timeout:${label}`)); return; }
      setTimeout(check, 5);
    };
    check();
  });
}

function providerResponse(content) {
  return { admission: 'acknowledged', transportSubmitted: true, response: { choices: [{ message: { role: 'assistant', content } }] } };
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')
      .join('');
  }
  return '';
}

function durableEvents(eventsPath) {
  return readNarsEventLog(eventsPath).events;
}

test('live Pi SDK NARS session is substitutable across four attached clients', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-live-pi-sdk-'));
  const sessionPath = join(root, 'session.json');
  const eventsPath = join(root, 'events.jsonl');
  const providerCalls = [];
  const capabilityCalls = [];
  let slowResolve = null;
  const providerAdapter = {
    async invoke(input) {
      providerCalls.push({ turn_id: input.turnId, messages: structuredClone(input.messages), tools: structuredClone(input.tools) });
      const userText = messageText([...input.messages].reverse().find((message) => message.role === 'user'));
      if (userText === 'slow') {
        return await new Promise((resolve) => {
          slowResolve = () => resolve({ admission: 'uncertain', error: { code: 'aborted', message: 'operator cancelled', retryable: false } });
          input.abortSignal?.addEventListener('abort', () => slowResolve?.(), { once: true });
        });
      }
      const hasToolResult = input.messages.some((message) => message.role === 'tool' || message.role === 'toolResult');
      if (!hasToolResult && input.tools.some((tool) => tool.function?.name === 'read_note')) {
        const toolName = userText === 'mutate' ? 'write_note' : 'read_note';
        return {
          admission: 'acknowledged',
          transportSubmitted: true,
          response: {
            choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call-${providerCalls.length}`, function: { name: toolName, arguments: '{}' } }] } }],
          },
        };
      }
      return providerResponse(userText === 'mutate' ? 'mutation was refused' : 'live pi response');
    },
  };
  const kernel = createNarsPiSdkKernel({ providerAdapter });
  const kernelStartEvidence = await kernel.start({ session_id: 'live-pi-session', agent_id: 'live-agent' });
  assert.equal(kernelStartEvidence.kernel_kind, 'pi-sdk');
  assert.equal(kernelStartEvidence.pi_version, '0.80.10');
  assert.equal(kernelStartEvidence.pi_mode, 'sdk');
  assert.equal(kernelStartEvidence.session_posture, 'nars-journal-canonical.v1');
  assert.equal(kernelStartEvidence.ambient_resource_isolation, 'strict-adapter-policy');
  const intelligenceRuntime = {
    async callIntelligence(messages, tools, overrides = {}) {
      const outcome = await kernel.invokeAdmitted({
        messages,
        plan: { plan_id: 'live-pi-sdk-plan' },
        adapter: { resource_id: 'live-pi-sdk-adapter' },
        turnId: overrides.turnId ?? overrides.inputEventId ?? 'live-pi-sdk-turn',
        inputEventId: overrides.inputEventId,
        runtimeRequestId: overrides.runtimeRequestId ?? overrides.runtime_request_id,
        runtime_request_id: overrides.runtimeRequestId ?? overrides.runtime_request_id,
        idempotencyKey: overrides.idempotencyKey ?? overrides.idempotency_key,
        idempotency_key: overrides.idempotencyKey ?? overrides.idempotency_key,
        turnAttempt: overrides.turnAttempt ?? overrides.turn_attempt,
        turn_attempt: overrides.turnAttempt ?? overrides.turn_attempt,
        abortSignal: overrides.abortSignal,
        capabilityGateway: overrides.capabilityGateway,
        requestedOptions: overrides,
        invocationEventSink: overrides.invocationEventSink,
      });
      if (outcome.error) {
        const error = new Error(outcome.error.message);
        error.name = outcome.error.code === 'aborted' ? 'AbortError' : 'ProviderError';
        throw error;
      }
      return outcome.response;
    },
    snapshot: () => ({
      schema: 'narada.nars.intelligence_runtime_snapshot.v1',
      authority: 'live-e2e',
      principal: 'principal:live',
      requested_model: null,
      requested_options: {},
      latest_plan: null,
      latest_outcome: null,
      latest_attempt_id: null,
      latest_replayed: null,
      reconfiguration: null,
      intelligence_kernel_kind: 'pi-sdk',
      kernel: kernel.health(),
      kernel_start_evidence: kernelStartEvidence,
    }),
    async reconfigure(params) {
      return kernel.reconfigure({
        admitted_plan: {
          selected: {
            model: params.requested_model ?? params.model_ref ?? { kind: 'model', id: 'model:live' },
            inference_provider: { kind: 'inference-provider', id: 'inference-provider:live' },
          },
          options: params.requested_options ?? {},
        },
      });
    },
    async close() { await kernel.close({ reason: 'live_e2e_close' }); },
  };
  const runtimeContext = {
    identity: 'live-agent',
    session: 'live-pi-session',
    siteRoot: root,
    sessionPath,
    eventsPath,
    controlPath: join(root, 'control.jsonl'),
    siteId: 'site:live',
    operatorSurfaceKind: 'agent-web-ui',
    intelligenceKernelKind: 'pi-sdk',
    intelligence: { principal: 'principal:live' },
    mcpScope: 'all',
  };
  const toolGateway = {
    async toolCatalog() {
      return [
        { type: 'function', function: { name: 'read_note', description: 'read-only note lookup', parameters: { type: 'object', properties: {} } }, nars_gateway_proxy: true },
        { type: 'function', function: { name: 'write_note', description: 'admitted note mutation', parameters: { type: 'object', properties: {} } }, nars_gateway_proxy: true },
      ];
    },
    async invoke(request) {
      capabilityCalls.push(request);
      if (request.toolName === 'write_note') return { status: 'denied', admission_action: 'deny', admission_reason: 'mutating_capability_requires_admission' };
      return { status: 'completed', result: { note: 'read-only result' } };
    },
    async close() {},
    operationalState: () => 'ready',
  };
  const service = createSessionCoreRuntimeService({ runtimeContext, intelligenceRuntime, toolGateway, heartbeatIntervalMs: 0 });
  const clients = new Map();
  for (const clientId of ['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui']) {
    const records = [];
    const subscription = service.supervisor.core.eventHub.subscribe({ subscriptionId: clientId, send: (envelope) => records.push(envelope.payload) });
    subscription.markLive({ source: 'live-four-client-attach' });
    clients.set(clientId, { records, subscription });
  }
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  const outputRecords = [];
  let outputBuffer = '';
  output.on('data', (chunk) => {
    outputBuffer += chunk;
    while (true) {
      const newline = outputBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = outputBuffer.slice(0, newline).trim();
      outputBuffer = outputBuffer.slice(newline + 1);
      if (line) {
        outputRecords.push(JSON.parse(line));
      }
    }
  });
  const runtimePromise = service.run({ input, output });
  const send = (frame) => input.write(`${JSON.stringify(frame)}\n`);
  await waitFor(() => outputRecords.some((record) => record.event === 'session_started'), 5000, 'session_started');
  send({ id: 'health-1', method: 'session.health' });
  await waitFor(() => outputRecords.some((record) => record.event === 'session_health'), 5000, 'session_health');
  send({ id: 'turn-1', method: 'session.submit', content: 'hello', idempotency_key: 'idem-hello' });
  await waitFor(() => outputRecords.some((record) => record.event === 'session_control_response' && record.request_id === 'turn-1'), 5000, 'turn-1-response');
  const firstProviderCallCount = providerCalls.length;
  const firstCorrelation = kernel.correlationRegistry.values().find((record) => record.idempotency_key === 'idem-hello');
  assert.equal(firstCorrelation.runtime_request_id, 'runtime_request_2');
  assert.equal(firstCorrelation.input_id, firstCorrelation.turn_id);
  assert.match(firstCorrelation.input_id, /^input_/);
  assert.equal(firstCorrelation.idempotency_key, 'idem-hello');
  assert.equal(firstCorrelation.turn_attempt, 1);
  assert.equal(capabilityCalls[0].toolName, 'read_note');
  assert.ok(durableEvents(eventsPath).some((event) => event.event === 'assistant_message' && event.content === 'live pi response'));

  send({ id: 'turn-1-duplicate', method: 'session.submit', content: 'hello', idempotency_key: 'idem-hello' });
  await waitFor(() => outputRecords.some((record) => record.event === 'session_control_response' && record.request_id === 'turn-1-duplicate'), 5000, 'duplicate-response');
  assert.equal(providerCalls.length, firstProviderCallCount, 'same idempotency key must not redispatch the provider');

  send({ id: 'turn-2', method: 'session.submit', content: 'mutate', idempotency_key: 'idem-mutate' });
  await waitFor(() => outputRecords.some((record) => record.event === 'session_control_response' && record.request_id === 'turn-2'), 5000, 'turn-2-response');
  assert.ok(durableEvents(eventsPath).some((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'write_note' && event.status === 'denied'));
  assert.equal(capabilityCalls.some((call) => call.toolName === 'write_note'), true);

  send({ id: 'turn-slow', method: 'session.submit', content: 'slow', idempotency_key: 'idem-slow' });
  await waitFor(() => providerCalls.some((call) => call.messages.some((message) => messageText(message) === 'slow')), 5000, 'slow-provider-call');
  send({ id: 'cancel-slow', method: 'session.cancel', params: { reason: 'operator_cancel' } });
  await waitFor(() => durableEvents(eventsPath).some((event) => event.event === 'turn_interrupted'), 5000, 'turn-interrupted');
  assert.equal((await kernel.inspect()).active_turn_id, null);

  send({ id: 'reconfigure-1', method: 'runtime.intelligence.reconfigure', params: { requested_options: { thinking: 'high' } } });
  await waitFor(() => durableEvents(eventsPath).some((event) => event.event === 'runtime_intelligence_reconfiguration'), 5000, 'reconfigure');
  assert.equal((await kernel.inspect()).thinking, 'high');

  const canonicalKinds = (clients.get('agent-cli').records)
    .filter((event) => ['user_message', 'assistant_message', 'turn_lifecycle_transition', 'carrier_tool_requested', 'carrier_tool_completed', 'turn_complete', 'turn_interrupted'].includes(event.event))
    .map((event) => ({ event: event.event, turn_id: event.turn_id ?? null, content: event.content ?? null, status: event.status ?? null }));
  for (const client of clients.values()) {
    const observed = client.records
      .filter((event) => ['user_message', 'assistant_message', 'turn_lifecycle_transition', 'carrier_tool_requested', 'carrier_tool_completed', 'turn_complete', 'turn_interrupted'].includes(event.event))
      .map((event) => ({ event: event.event, turn_id: event.turn_id ?? null, content: event.content ?? null, status: event.status ?? null }));
    assert.deepEqual(observed, canonicalKinds, 'all operator surfaces receive the same canonical projection');
  }
  const lastSequence = service.supervisor.core.eventHub.cursor().last_sequence;
  clients.get('agent-pi-tui').subscription.unsubscribe('disconnect');
  const replay = service.supervisor.core.eventHub.replayFor({ sinceSequence: Math.max(0, lastSequence - 100), maxReplay: 100 });
  assert.ok(replay.length > 0, 'reconnect has durable replay evidence');
  const reconnected = [];
  const reconnectSubscription = service.supervisor.core.eventHub.subscribe({ subscriptionId: 'agent-pi-tui-reconnect', send: (envelope) => reconnected.push(envelope.payload) });
  reconnectSubscription.markLive({ source: 'live-reconnect', replay_last_sequence: 0 });
  for (const event of replay) reconnected.push(event);
  assert.ok(reconnected.some((event) => event.event === 'assistant_message'));

  const providerCallsBeforeRecovery = providerCalls.length;
  await kernel.recover({ sessionSnapshot: { session_id: 'live-pi-session' }, journalEvents: durableEvents(eventsPath), turn: { turn_id: 'recovered', messages: [] } });
  assert.equal((await kernel.inspect()).continuation_state_present, true, 'recovery must rehydrate context from durable NARS records');
  assert.equal(providerCalls.length, providerCallsBeforeRecovery, 'recovery must not redispatch the provider');

  send({ id: 'close-1', method: 'session.close' });
  await runtimePromise;
  for (const client of clients.values()) client.subscription.unsubscribe('test-complete');
  reconnectSubscription.unsubscribe('test-complete');
  assert.equal(service.supervisor.core.lifecycleState, 'closed');
  const events = durableEvents(eventsPath);
  assert.ok(events.some((event) => event.event === 'session_closed' || event.event === 'session_lifecycle_transition'));
});
