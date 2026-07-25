import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNarsNativeKernel } from '@narada2/nars-intelligence-kernel-contract/native-kernel';
import { createNarsPiSdkKernel } from '@narada2/nars-pi-kernel';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { createRuntimeSessionBinding } from '../src/runtime-session-binding.js';

function providerResponse(content: any) {
  return {
    admission: 'acknowledged',
    transportSubmitted: true,
    response: { choices: [{ message: { role: 'assistant', content } }] },
  };
}

function providerText(message: any) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) return message.content
    .map((part: any) => typeof part === 'string' ? part : part?.text ?? '')
    .join('');
  return '';
}

function providerAdapter(rounds: any = []) {
  return {
    async invoke(input: any) {
      rounds.push({
        schema: input.tool_loop?.schema ?? null,
        owner: input.tool_loop?.owner ?? null,
        result_authority: input.tool_loop?.result_authority ?? null,
        terminal_authority: input.tool_loop?.terminal_authority ?? null,
        tool_names: input.tools.map((tool: any) => tool?.function?.name ?? tool?.name ?? null),
      });
      const hasToolResult: any = input.messages.some((message: any) => message.role === 'tool' || message.role === 'toolResult');
      if (!hasToolResult && input.tools.some((tool: any) => (
        tool?.function?.name ?? tool?.name
      ) === 'read_note')) {
        return {
          admission: 'acknowledged',
          transportSubmitted: true,
          response: {
            choices: [{ message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'substitute-call-1', function: { name: 'read_note', arguments: '{}' } }],
            } }],
          },
        };
      }
      const user: any = [...input.messages].reverse().find((message: any) => message.role === 'user');
      return providerResponse(`same-${providerText(user)}`);
    },
  };
}

function toolGateway() {
  return {
    async toolCatalog() {
      return [{
        type: 'function',
        function: {
          name: 'read_note',
          description: 'read one admitted note',
          parameters: { type: 'object', properties: {} },
        },
        nars_gateway_proxy: true,
      }];
    },
    async invoke(request: any) {
      assert.equal(request.toolName, 'read_note');
      return { status: 'completed', result: { note: 'same-note' } };
    },
    async close() {},
    operationalState: () => 'ready',
  };
}

function canonicalEventProjection(event: any) {
  return {
    event: event.event,
    turn_id: event.turn_id ?? null,
    turn_state: event.turn_state ?? null,
    terminal_state: event.terminal_state ?? null,
    tool_name: event.tool_name ?? null,
    tool_call_id: event.tool_call_id ?? null,
    status: event.status ?? null,
    content: event.content ?? null,
    effect_confirmation: event.effect_confirmation ?? null,
  };
}

function clientProjection(event: any) {
  return {
    event: event.event,
    turn_id: event.turn_id ?? null,
    turn_state: event.turn_state ?? null,
    terminal_state: event.terminal_state ?? null,
    tool_name: event.tool_name ?? null,
    status: event.status ?? null,
    content: event.content ?? null,
  };
}

async function runScenario(kernelFactory: any) {
  const root: any = mkdtempSync(join(tmpdir(), 'narada-pi-substitutability-'));
  const sessionPath: any = join(root, 'session.json');
  const eventsPath: any = join(root, 'events.jsonl');
  const roundInputs: any = [];
  const kernel: any = kernelFactory(roundInputs);
  const startEvidence: any = await kernel.start({ session_id: 'substitute-session', agent_id: 'substitute-agent' });
  const gateway: any = toolGateway();
  const supervisor: any = createRuntimeSessionBinding({
    runtimeContext: {
      session: 'substitute-session',
      identity: 'substitute-agent',
      sessionPath,
      eventsPath,
      maxToolRounds: 4,
    },
    invokeIntelligenceFn: async (messages: any, tools: any, overrides: any = {}) => {
      const outcome: any = await kernel.invokeAdmitted({
        messages,
        plan: { plan_id: 'substitutability-plan' },
        adapter: { resource_id: 'substitutability-adapter' },
        turnId: overrides.turnId ?? overrides.inputEventId ?? 'runtime-substitute-turn',
        inputEventId: overrides.inputEventId,
        runtimeRequestId: overrides.runtimeRequestId ?? overrides.runtime_request_id,
        idempotencyKey: overrides.idempotencyKey ?? overrides.idempotency_key,
        turnAttempt: overrides.turnAttempt ?? overrides.turn_attempt,
        abortSignal: overrides.abortSignal,
        requestedOptions: overrides.settings ?? {},
        capabilityGateway: overrides.capabilityGateway,
        invocationEventSink: overrides.invocationEventSink,
      });
      if (outcome.error) {
        const error: any = new Error(outcome.error.message ?? 'kernel_provider_failure');
        error.name = outcome.error.code === 'aborted' ? 'AbortError' : 'ProviderError';
        throw error;
      }
      return outcome.response;
    },
    toolGateway: gateway,
    buildTurnContext: (input: any) => ({
      turnId: input.event_id,
      messages: [{ role: 'user', content: input.content }],
      runtimeRequestId: 'runtime-substitute',
      idempotencyKey: input.idempotency_key,
    }),
  });
  const clients: any = new Map();
  for (const surface of ['agent-cli', 'agent-pi-tui']) {
    const records: any = [];
    const subscription: any = supervisor.core.eventHub.subscribe({
      subscriptionId: `${surface}-${startEvidence.kernel_kind}`,
      send: (envelope: any) => records.push(envelope.payload),
    });
    subscription.markLive({ source: 'substitutability-test' });
    clients.set(surface, { records, subscription });
  }
  supervisor.start();
  const result: any = await supervisor.submit({
    event_id: 'input_substitute',
    request_id: 'request-substitute',
    idempotency_key: 'idem-substitute',
    content: 'read note',
  });
  const finalTurn: any = supervisor.core.turn('input_substitute');
  const recoveryBeforeClose: any = supervisor.recovery();
  const healthBeforeClose: any = supervisor.health();
  const kernelHealthBeforeClose: any = await kernel.inspect();
  await supervisor.close({ reason: 'substitutability-test' });
  await kernel.close({ reason: 'substitutability-test' });
  for (const client of clients.values()) client.subscription.unsubscribe('substitutability-complete');
  const journal: any = readNarsEventLog(eventsPath).events;
  return {
    startEvidence,
    result,
    terminal_state: finalTurn?.terminal_state ?? null,
    health: {
      session_id: healthBeforeClose.session_id,
      lifecycle_state: healthBeforeClose.lifecycle_state,
      recovery_shape: Object.keys(recoveryBeforeClose).sort(),
      kernel_shape: ['kernel_kind', 'kernel_state', 'active_turn_id', 'capability_profile'].map((field: any) => field in kernelHealthBeforeClose),
    },
    canonical: journal
      .filter((event: any) => [
        'user_message',
        'assistant_message',
        'turn_lifecycle_transition',
        'carrier_tool_requested',
        'carrier_tool_completed',
        'turn_complete',
        'turn_interrupted',
        'artifact_registered',
        'artifact_observed',
      ].includes(event.event))
      .map(canonicalEventProjection),
    artifacts: journal
      .filter((event: any) => event.event?.startsWith('artifact_'))
      .map(canonicalEventProjection),
    clients: [...clients.values()].map((client: any) => client.records
      .filter((event: any) => ['user_message', 'assistant_message', 'carrier_tool_requested', 'carrier_tool_completed', 'turn_complete'].includes(event.event))
      .map(clientProjection)),
    journal_identity: journal
      .filter((event: any) => event.event === 'session_started' || event.event === 'user_message')
      .map((event: any) => ({ event: event.event, session_id: event.session_id ?? null })),
    round_contract: roundInputs,
  };
}

test('narada-native and pi-sdk produce the same NARS session contract projection', async () => {
  const scenarios: any = await Promise.all([
    runScenario((rounds: any) => createNarsNativeKernel({ providerAdapter: providerAdapter(rounds) })),
    runScenario((rounds: any) => createNarsPiSdkKernel({ providerAdapter: providerAdapter(rounds) })),
  ]);
  const [native, pi]: any = scenarios;
  assert.equal(native.startEvidence.session_id, 'substitute-session');
  assert.equal(pi.startEvidence.session_id, 'substitute-session');
  assert.equal(native.terminal_state, 'completed');
  assert.equal(pi.terminal_state, 'completed');
  assert.equal(native.health.session_id, pi.health.session_id);
  assert.deepEqual(native.health.recovery_shape, pi.health.recovery_shape);
  assert.deepEqual(native.health.kernel_shape, [true, true, true, true]);
  assert.deepEqual(pi.health.kernel_shape, [true, true, true, true]);
  assert.deepEqual(native.canonical, pi.canonical);
  assert.deepEqual(native.artifacts, pi.artifacts);
  assert.deepEqual(native.clients[0], native.clients[1]);
  assert.deepEqual(pi.clients[0], pi.clients[1]);
  assert.deepEqual(native.clients[0], pi.clients[0]);
  assert.deepEqual(native.journal_identity, pi.journal_identity);
  assert.ok(native.round_contract.length >= 1);
  assert.ok(pi.round_contract.length >= 1);
  for (const round of [...native.round_contract, ...pi.round_contract]) {
    assert.equal(round.schema, 'narada.nars.tool_round.v1');
    assert.equal(round.owner, 'nars-session-core-carrier');
    assert.equal(round.result_authority, 'nars-capability-gateway');
    assert.equal(round.terminal_authority, 'nars-session-core');
    assert.deepEqual(round.tool_names, ['read_note']);
  }
  assert.deepEqual(
    native.round_contract.map(({ schema, owner, result_authority, terminal_authority, tool_names }: any) => ({ schema, owner, result_authority, terminal_authority, tool_names })),
    pi.round_contract.map(({ schema, owner, result_authority, terminal_authority, tool_names }: any) => ({ schema, owner, result_authority, terminal_authority, tool_names })),
  );
  assert.equal(native.canonical.at(-1).event, 'turn_complete');
  assert.equal(pi.canonical.at(-1).event, 'turn_complete');
});
