import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { createNarsPiSdkKernel } from '@narada2/nars-pi-kernel';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { createSessionCoreRuntimeService } from '../src/session-core-runtime-service.js';

function waitFor(predicate: any, timeoutMs: any = 5000, label: any = 'condition') {
  const started: any = Date.now();
  return new Promise((resolve: any, reject: any) => {
    const check: any = () => {
      try {
        const value: any = predicate();
        if (value) { resolve(value); return; }
      } catch (error) { reject(error); return; }
      if (Date.now() - started > timeoutMs) { reject(new Error(`live_pi_e2e_timeout:${label}`)); return; }
      setTimeout(check, 5);
    };
    check();
  });
}

function providerResponse(content: any) {
  return { admission: 'acknowledged', transportSubmitted: true, response: { choices: [{ message: { role: 'assistant', content } }] } };
}

function messageText(message: any) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part: any) => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')
      .join('');
  }
  return '';
}

function durableEvents(eventsPath: any) {
  return readNarsEventLog(eventsPath).events;
}

test('live Pi SDK NARS session is substitutable across four attached clients', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'narada-live-pi-sdk-'));
  const sessionPath: any = join(root, 'session.json');
  const eventsPath: any = join(root, 'events.jsonl');
  const providerCalls: any = [];
  const capabilityCalls: any = [];
  let slowResolve: any = null;
  const providerAdapter: any = {
    async invoke(input: any) {
      providerCalls.push({ turn_id: input.turnId, messages: structuredClone(input.messages), tools: structuredClone(input.tools) });
      const userText: any = messageText([...input.messages].reverse().find((message: any) => message.role === 'user'));
      if (userText === 'slow') {
        return await new Promise((resolve: any) => {
          slowResolve = () => resolve({ admission: 'uncertain', error: { code: 'aborted', message: 'operator cancelled', retryable: false } });
          input.abortSignal?.addEventListener('abort', () => slowResolve?.(), { once: true });
        });
      }
      const hasToolResult: any = input.messages.some((message: any) => message.role === 'tool' || message.role === 'toolResult');
      if (!hasToolResult && input.tools.some((tool: any) => tool.function?.name === 'read_note')) {
        const toolName: any = userText === 'mutate' ? 'write_note' : 'read_note';
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
  const kernel: any = createNarsPiSdkKernel({ providerAdapter });
  const kernelStartEvidence: any = await kernel.start({ session_id: 'live-pi-session', agent_id: 'live-agent' });
  assert.equal(kernelStartEvidence.kernel_kind, 'pi-sdk');
  assert.equal(kernelStartEvidence.pi_version, '0.80.10');
  assert.equal(kernelStartEvidence.pi_mode, 'sdk');
  assert.equal(kernelStartEvidence.session_posture, 'nars-journal-canonical.v1');
  assert.equal(kernelStartEvidence.ambient_resource_isolation, 'strict-adapter-policy');
  const intelligenceRuntime: any = {
    async callIntelligence(messages: any, tools: any, overrides: any = {}) {
      const outcome: any = await kernel.invokeAdmitted({
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
        const error: any = new Error(outcome.error.message);
        error.name = outcome.error.code === 'aborted' ? 'AbortError' : 'ProviderError';
        throw error;
      }
      return outcome.response;
    },
    snapshot: () => ({
      schema: 'narada.nars.intelligence_runtime_snapshot.v1',
      authority: 'live-e2e',
      principal: 'principal:live',
      requested_inference_provider: null,
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
    async reconfigure(params: any) {
      return kernel.reconfigure({
        admitted_plan: {
          selected: {
            inference_provider: params.requested_inference_provider ?? params.inference_provider_ref ?? { kind: 'inference-provider', id: 'inference-provider:live' },
            model: params.requested_model ?? params.model_ref ?? { kind: 'model', id: 'model:live' },
          },
          options: params.requested_options ?? {},
        },
      });
    },
    async close() { await kernel.close({ reason: 'live_e2e_close' }); },
  };
  const runtimeContext: any = {
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
  const toolGateway: any = {
    async toolCatalog() {
      return [
        { type: 'function', function: { name: 'read_note', description: 'read-only note lookup', parameters: { type: 'object', properties: {} } }, nars_gateway_proxy: true },
        { type: 'function', function: { name: 'write_note', description: 'admitted note mutation', parameters: { type: 'object', properties: {} } }, nars_gateway_proxy: true },
      ];
    },
    async invoke(request: any) {
      capabilityCalls.push(request);
      if (request.toolName === 'write_note') return { status: 'denied', admission_action: 'deny', admission_reason: 'mutating_capability_requires_admission' };
      return { status: 'completed', result: { note: 'read-only result' } };
    },
    async close() {},
    operationalState: () => 'ready',
  };
  const service: any = createSessionCoreRuntimeService({ runtimeContext, intelligenceRuntime, toolGateway, heartbeatIntervalMs: 0 });
  const clients: any = new Map();
  for (const clientId of ['agent-cli', 'agent-web-ui', 'agent-tui', 'agent-pi-tui']) {
    const records: any = [];
    const subscription: any = service.supervisor.core.eventHub.subscribe({ subscriptionId: clientId, send: (envelope: any) => records.push(envelope.payload) });
    subscription.markLive({ source: 'live-four-client-attach' });
    clients.set(clientId, { records, subscription });
  }
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  output.setEncoding('utf8');
  const outputRecords: any = [];
  let outputBuffer: any = '';
  output.on('data', (chunk: any) => {
    outputBuffer += chunk;
    while (true) {
      const newline: any = outputBuffer.indexOf('\n');
      if (newline < 0) break;
      const line: any = outputBuffer.slice(0, newline).trim();
      outputBuffer = outputBuffer.slice(newline + 1);
      if (line) {
        outputRecords.push(JSON.parse(line));
      }
    }
  });
  const runtimePromise: any = service.run({ input, output });
  const send: any = (frame: any) => input.write(`${JSON.stringify(frame)}\n`);
  await waitFor(() => outputRecords.some((record: any) => record.event === 'session_started'), 5000, 'session_started');
  send({ id: 'health-1', method: 'session.health' });
  await waitFor(() => outputRecords.some((record: any) => record.event === 'session_health'), 5000, 'session_health');
  send({ id: 'turn-1', method: 'session.submit', content: 'hello', idempotency_key: 'idem-hello' });
  await waitFor(() => outputRecords.some((record: any) => record.event === 'session_control_response' && record.request_id === 'turn-1'), 5000, 'turn-1-response');
  const firstProviderCallCount: any = providerCalls.length;
  const firstCorrelation: any = kernel.correlationRegistry.values().find((record: any) => record.idempotency_key === 'idem-hello');
  assert.equal(firstCorrelation.runtime_request_id, 'runtime_request_2');
  assert.equal(firstCorrelation.input_id, firstCorrelation.turn_id);
  assert.match(firstCorrelation.input_id, /^input_/);
  assert.equal(firstCorrelation.idempotency_key, 'idem-hello');
  assert.equal(firstCorrelation.turn_attempt, 1);
  assert.equal(capabilityCalls[0].toolName, 'read_note');
  assert.ok(durableEvents(eventsPath).some((event: any) => event.event === 'assistant_message' && event.content === 'live pi response'));

  send({ id: 'turn-1-duplicate', method: 'session.submit', content: 'hello', idempotency_key: 'idem-hello' });
  await waitFor(() => outputRecords.some((record: any) => record.event === 'session_control_response' && record.request_id === 'turn-1-duplicate'), 5000, 'duplicate-response');
  assert.equal(providerCalls.length, firstProviderCallCount, 'same idempotency key must not redispatch the provider');

  send({ id: 'turn-2', method: 'session.submit', content: 'mutate', idempotency_key: 'idem-mutate' });
  await waitFor(() => outputRecords.some((record: any) => record.event === 'session_control_response' && record.request_id === 'turn-2'), 5000, 'turn-2-response');
  assert.ok(durableEvents(eventsPath).some((event: any) => event.event === 'carrier_tool_completed' && event.tool_name === 'write_note' && event.status === 'denied'));
  assert.equal(capabilityCalls.some((call: any) => call.toolName === 'write_note'), true);

  send({ id: 'turn-slow', method: 'session.submit', content: 'slow', idempotency_key: 'idem-slow' });
  await waitFor(() => providerCalls.some((call: any) => call.messages.some((message: any) => messageText(message) === 'slow')), 5000, 'slow-provider-call');
  send({ id: 'cancel-slow', method: 'session.cancel', params: { reason: 'operator_cancel' } });
  await waitFor(() => durableEvents(eventsPath).some((event: any) => event.event === 'turn_interrupted'), 5000, 'turn-interrupted');
  assert.equal((await kernel.inspect()).active_turn_id, null);

  send({ id: 'reconfigure-1', method: 'runtime.intelligence.reconfigure', params: {
    requested_inference_provider: { kind: 'inference-provider', id: 'inference-provider:live' },
    requested_model: { kind: 'model', id: 'model:live' },
    requested_options: { thinking: 'high' },
  } });
  await waitFor(() => durableEvents(eventsPath).some((event: any) => event.event === 'runtime_intelligence_reconfiguration'), 5000, 'reconfigure');
  assert.equal((await kernel.inspect()).thinking, 'high');

  const canonicalKinds: any = (clients.get('agent-cli').records)
    .filter((event: any) => ['user_message', 'assistant_message', 'turn_lifecycle_transition', 'carrier_tool_requested', 'carrier_tool_completed', 'turn_complete', 'turn_interrupted'].includes(event.event))
    .map((event: any) => ({ event: event.event, turn_id: event.turn_id ?? null, content: event.content ?? null, status: event.status ?? null }));
  for (const client of clients.values()) {
    const observed: any = client.records
      .filter((event: any) => ['user_message', 'assistant_message', 'turn_lifecycle_transition', 'carrier_tool_requested', 'carrier_tool_completed', 'turn_complete', 'turn_interrupted'].includes(event.event))
      .map((event: any) => ({ event: event.event, turn_id: event.turn_id ?? null, content: event.content ?? null, status: event.status ?? null }));
    assert.deepEqual(observed, canonicalKinds, 'all operator surfaces receive the same canonical projection');
  }
  const lastSequence: any = service.supervisor.core.eventHub.cursor().last_sequence;
  clients.get('agent-pi-tui').subscription.unsubscribe('disconnect');
  const replay: any = service.supervisor.core.eventHub.replayFor({ sinceSequence: Math.max(0, lastSequence - 100), maxReplay: 100 });
  assert.ok(replay.length > 0, 'reconnect has durable replay evidence');
  const reconnected: any = [];
  const reconnectSubscription: any = service.supervisor.core.eventHub.subscribe({ subscriptionId: 'agent-pi-tui-reconnect', send: (envelope: any) => reconnected.push(envelope.payload) });
  reconnectSubscription.markLive({ source: 'live-reconnect', replay_last_sequence: 0 });
  for (const event of replay) reconnected.push(event);
  assert.ok(reconnected.some((event: any) => event.event === 'assistant_message'));

  const providerCallsBeforeRecovery: any = providerCalls.length;
  await kernel.recover({ sessionSnapshot: { session_id: 'live-pi-session' }, journalEvents: durableEvents(eventsPath), turn: { turn_id: 'recovered', messages: [] } });
  assert.equal((await kernel.inspect()).continuation_state_present, true, 'recovery must rehydrate context from durable NARS records');
  assert.equal(providerCalls.length, providerCallsBeforeRecovery, 'recovery must not redispatch the provider');

  send({ id: 'close-1', method: 'session.close' });
  await runtimePromise;
  for (const client of clients.values()) client.subscription.unsubscribe('test-complete');
  reconnectSubscription.unsubscribe('test-complete');
  assert.equal(service.supervisor.core.lifecycleState, 'closed');
  const events: any = durableEvents(eventsPath);
  assert.ok(events.some((event: any) => event.event === 'session_closed' || event.event === 'session_lifecycle_transition'));
});
