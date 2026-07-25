import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createRuntimeSessionBinding } from '../src/runtime-session-binding.js';
import { createSessionCoreRuntimeService } from '../src/session-core-runtime-service.js';
import { NarsIntelligenceInvocationError } from '../src/intelligence-runtime-controller.js';

test('runtime session binding delegates session state to session core and turns to carrier adapter', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-'));
  let providerSettings: any;
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    invokeIntelligenceFn: async (messages: any, tools: any, settings: any) => {
      providerSettings = settings;
      return { content: messages[0].content, tool_count: tools.length };
    },
    toolGateway: { toolCatalog: () => [{ name: 'fs_read_file' }], operationalState: () => 'healthy' },
  });
  assert.equal(binding.start().lifecycle_state, 'ready');
  await binding.submit({ event_id: 'input_1', content: 'hello' });
  assert.equal(providerSettings.turnId, 'input_1');
  assert.equal(providerSettings.inputEventId, 'input_1');
  assert.equal(typeof providerSettings.invocationEventSink, 'function');
  assert.equal(binding.health().lifecycle_state, 'ready');
  await binding.close();
  assert.equal(binding.health().lifecycle_state, 'closed');
});

test('runtime session binding carries one typed execution policy snapshot into the provider call', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-policy-'));
  let providerSettings: any = null;
  const executionPolicy: any = {
    schema: 'narada.nars.execution_policy.v1',
    scope: 'session',
    source: { kind: 'runtime-control', ref: 'runtime:binding-test', revision: 2 },
    tool_loop: { max_rounds: 11 },
  };
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-policy',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    executionPolicyProvider: () => executionPolicy,
    invokeIntelligenceFn: async (_messages: any, _tools: any, settings: any) => {
      providerSettings = settings;
      return { content: 'policy observed' };
    },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  binding.start();
  await binding.submit({ event_id: 'input_policy', content: 'observe policy' });
  assert.deepEqual(providerSettings.executionPolicy, executionPolicy);
  assert.deepEqual(providerSettings.execution_policy, executionPolicy);
  await binding.close();
});

test('an explicitly controlled canonical failure settles its queue item for a later retry', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-explicit-failure-'));
  const failureResult: any = {
    kind: 'plan',
    outcome: { kind: 'provider-failure' },
  };
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-explicit-failure',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => {
      throw new NarsIntelligenceInvocationError(
        'provider-response-error',
        'canonical intelligence invocation ended as provider-failure',
        failureResult,
      );
    },
    buildTurnContext: (input: any) => ({
      turnId: input.event_id,
      messages: [{ role: 'user', content: input.content }],
      settings: { intentId: 'intent:controlled', mode: 'immediate' },
    }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });

  binding.start();
  await binding.submit({ event_id: 'input_controlled_failure', content: 'fail once' });
  assert.equal(binding.health().operator_input_queue.pending_count, 0);
  assert.equal(binding.core.turn('input_controlled_failure').terminal_state, 'failed');
  await binding.close();
});

test('a live admission-unknown outcome settles without automatic queue redispatch', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-admission-unknown-'));
  const failureResult: any = {
    kind: 'plan',
    outcome: { kind: 'admission-unknown' },
  };
  let providerCalls: any = 0;
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-admission-unknown',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => {
      providerCalls += 1;
      throw new NarsIntelligenceInvocationError(
        'intelligence_admission_unknown',
        'canonical intelligence invocation ended as admission-unknown',
        failureResult,
      );
    },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });

  binding.start();
  await binding.submit({ event_id: 'input_admission_unknown', content: 'do not resend' });

  assert.equal(providerCalls, 1);
  assert.equal(binding.health().operator_input_queue.pending_count, 0);
  assert.equal(binding.core.turn('input_admission_unknown').terminal_state, 'failed');
  assert.match(readFileSync(join(root, 'events.jsonl'), 'utf8'), /"event_kind":"input_completed"/);
  await binding.close();
});

test('runtime session binding contains provider follow-up exhaustion as a failed turn', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-round-limit-'));
  let providerCalls: any = 0;
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-round-limit',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => {
      providerCalls += 1;
      return {
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{
              id: `call-${providerCalls}`,
              function: { name: 'loop', arguments: '{}' },
            }],
          },
        }],
      };
    },
    toolGateway: {
      toolCatalog: () => [{ type: 'function', function: { name: 'loop', parameters: { type: 'object' } } }],
      invoke: async () => ({ status: 'completed', content: 'looped' }),
      operationalState: () => 'healthy',
    },
  });

  binding.start();
  await binding.submit({ event_id: 'input_round_limit', content: 'loop forever' });

  assert.equal(providerCalls, 200);
  assert.equal(binding.health().lifecycle_state, 'ready');
  assert.equal(binding.health().operator_input_queue.pending_count, 0);
  assert.equal(binding.core.turn('input_round_limit').turn_state, 'failed');
  assert.equal(binding.core.turn('input_round_limit').terminal_state, 'failed');
  assert.equal(binding.health().operational_posture, 'request_runtime_failures');
  const events: any = readFileSync(join(root, 'events.jsonl'), 'utf8');
  assert.match(events, /carrier_turn_failed/);
  assert.match(events, /carrier_turn_tool_round_limit_exceeded:200/);
  assert.match(events, /"event_kind":"input_completed"/);
  await binding.close();
});

test('runtime session binding contains provider-named follow-up exhaustion', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'runtime-session-binding-provider-limit-'));
  const binding: any = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-provider-limit',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => {
      throw new Error('provider_follow_up_round_limit_exceeded:8');
    },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });

  binding.start();
  await binding.submit({ event_id: 'input_provider_limit', content: 'startup' });

  assert.equal(binding.health().lifecycle_state, 'ready');
  assert.equal(binding.health().operator_input_queue.pending_count, 0);
  assert.match(readFileSync(join(root, 'events.jsonl'), 'utf8'), /provider_follow_up_round_limit_exceeded:8/);
  await binding.close();
});

test('JSONL runtime acknowledges a submit before its provider turn settles', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-early-ack-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  let resolveAccepted: any;
  const accepted: any = new Promise((resolve: any) => { resolveAccepted = resolve; });
  let buffer: any = '';
  const observedEvents: any = [];
  output.on('data', (chunk: any) => {
    rendered += String(chunk);
    buffer += String(chunk);
    const lines: any = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event: any = JSON.parse(line);
      observedEvents.push(event);
      if (event.event === 'session_control_accepted' && event.request_id === 'turn-early') resolveAccepted(event);
    }
  });
  let releaseProvider: any;
  const providerResult: any = new Promise((resolve: any) => { releaseProvider = resolve; });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'early-ack-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    invokeIntelligenceFn: async () => providerResult,
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run: any = service.run({ input, output });
  input.write(`${JSON.stringify({ id: 'turn-early', method: 'session.submit', params: { content: 'slow' } })}\n`);
  const acceptedEvent: any = await Promise.race([
    accepted,
    new Promise((_: any, reject: any) => setTimeout(() => reject(new Error('session_control_accepted_timeout')), 1000)),
  ]);
  assert.equal(acceptedEvent.acceptance_state, 'accepted');
  releaseProvider({ content: 'done' });
  input.end(`${JSON.stringify({ id: 'close-early', method: 'session.close' })}\n`);
  await run;
  const closeEvents: any = observedEvents;
  const closeAcceptedIndex: any = closeEvents.findIndex((event: any) => event.event === 'session_control_accepted' && event.request_id === 'close-early');
  const closeResponseIndex: any = closeEvents.findIndex((event: any) => event.event === 'session_control_response' && event.request_id === 'close-early');
  const closeTerminalIndex: any = closeEvents.findIndex((event: any) => event.event === 'session_closed');
  assert.ok(closeAcceptedIndex >= 0);
  assert.ok(closeResponseIndex > closeAcceptedIndex);
  assert.ok(closeTerminalIndex > closeResponseIndex);
});

test('JSONL runtime distinguishes a handled request from a failed turn outcome', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-failed-turn-outcome-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1',
      session: 'failed-turn-outcome-1',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => {
      throw new Error('provider_follow_up_round_limit_exceeded:8');
    },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });

  const run: any = service.run({ input, output });
  input.end([
    JSON.stringify({ id: 'turn-failed', method: 'session.submit', params: { content: 'exhaust the provider loop' } }),
    JSON.stringify({ id: 'close-failed', method: 'session.close' }),
  ].join('\n') + '\n');
  await run;

  const events: any = rendered.trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  const response: any = events.find((event: any) => event.event === 'session_control_response' && event.request_id === 'turn-failed');
  const requestTransition: any = events.find((event: any) => event.event === 'runtime_request_state_transition'
    && event.request_id === 'turn-failed'
    && event.request_state === 'completed');
  assert.equal(response?.terminal_state, 'failed');
  assert.equal(response?.request_outcome, 'turn_failed');
  assert.equal(requestTransition?.terminal_state, 'completed');
  assert.equal(requestTransition?.turn_terminal_state, 'failed');
  assert.equal(requestTransition?.request_outcome, 'turn_failed');
  assert.ok(events.some((event: any) => event.event === 'turn_failed'));
});

test('session cancel interrupts an active intelligence turn while close waits for settlement', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-cancel-'));
  const input: any = new PassThrough(); const output: any = new PassThrough(); let rendered: any = '';
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'cancel-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    invokeIntelligenceFn: (_messages: any, _tools: any, settings: any) => new Promise((_resolve: any, reject: any) => {
      if (settings.abortSignal.aborted) reject(new Error('intelligence_invocation_aborted'));
      else settings.abortSignal.addEventListener('abort', () => reject(new Error('intelligence_invocation_aborted')), { once: true });
    }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run: any = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'wait' } })}\n${JSON.stringify({ id: 'cancel-1', method: 'session.cancel' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events: any = rendered.trim().split('\n').map((line: any) => JSON.parse(line));
  assert.ok(events.some((event: any) => event.event === 'session_cancel' && event.cancelled === true));
  assert.ok(events.some((event: any) => event.event === 'carrier_turn_interrupted'
    && event.error.includes('aborted')
    && event.cause === 'intelligence_invocation_aborted'),
  events.map((event: any) => `${event.event}:${event.error ?? ''}`).join(','));
  assert.ok(events.some((event: any) => event.event === 'session_closed'));
});

test('session-core runtime service rejects non-session controls and retains the narrow control boundary', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-runtime-service-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    invokeIntelligenceFn: async () => ({ content: 'ok' }),
  });
  const run: any = service.run({ input, output });
  input.end([
    JSON.stringify({ id: 'health-1', method: 'session.health' }),
    JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } }),
    JSON.stringify({ id: 'bad-1', method: 'legacy.mutate' }),
    JSON.stringify({ id: 'close-1', method: 'session.close' }),
  ].join('\n'));
  await run;
  const events: any = rendered.trim().split('\n').map((line: any) => JSON.parse(line));
  assert.ok(events.some((event: any) => event.event === 'session_health' && event.request_id === 'health-1'));
  assert.ok(events.some((event: any) => event.event === 'session_control_accepted' && event.request_id === 'turn-1' && event.acceptance_state === 'accepted'));
  assert.ok(events.some((event: any) => event.event === 'carrier_turn_completed'));
  assert.ok(events.some((event: any) => event.event === 'session_control_rejected' && event.request_id === 'bad-1'));
  assert.ok(events.some((event: any) => event.lifecycle_state === 'closed'));
});

test('JSONL runtime executes shared carrier command aliases without provider dispatch', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-command-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  let providerCalls: any = 0;
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1', session: 'command-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    invokeIntelligenceFn: async () => { providerCalls += 1; return { content: 'unexpected' }; },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run: any = service.run({ input, output });
  input.end([
    JSON.stringify({ id: 'command-1', method: 'session.command.execute', params: { command: '/tool' } }),
    JSON.stringify({ id: 'close-1', method: 'session.close' }),
  ].join('\n') + '\n');
  await run;
  const events: any = rendered.trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  const result: any = events.find((event: any) => event.event === 'command_result' && event.request_id === 'command-1');
  assert.deepEqual({
    command: result?.command,
    command_name: result?.command_name,
    status: result?.status,
    terminal_state: result?.terminal_state,
  }, {
    command: '/tools',
    command_name: 'tools',
    status: 'ok',
    terminal_state: 'completed',
  });
  assert.equal(providerCalls, 0);
  assert.ok(events.some((event: any) => event.event === 'carrier_command_executed'
    && event.request_id === 'command-1'
    && event.command === '/tools'
    && event.status === 'ok'));
});

test('session-core runtime classifies a supported reconfiguration failure distinctly from an unsupported control', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-runtime-reconfiguration-failure-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1', session: 'session-reconfiguration-failure', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    intelligenceRuntime: {
      reconfigure: async () => { throw new Error('fixture_reconfiguration_failure'); },
    },
    invokeIntelligenceFn: async () => ({ content: 'unused' }),
  });
  const run: any = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'reconfigure-failed', method: 'runtime.intelligence.reconfigure', params: { requested_model: { kind: 'model', id: 'model:fixture' } } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events: any = rendered.trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  assert.equal(events.find((event: any) => event.event === 'session_control_rejected' && event.request_id === 'reconfigure-failed')?.code, 'runtime_reconfiguration_failed');
});

test('JSONL runtime applies an execution policy at a clean turn boundary and journals the snapshot', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-runtime-execution-policy-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  let activePolicy: any = null;
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const requestedPolicy: any = {
    schema: 'narada.nars.execution_policy.v1',
    scope: 'session',
    source: { kind: 'operator', ref: 'operator:test', revision: 5 },
    tool_loop: { max_rounds: 13 },
  };
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1',
      session: 'session-execution-policy',
      sessionPath: join(root, 'session.json'),
      eventsPath: join(root, 'events.jsonl'),
      siteRoot: root,
    },
    intelligenceRuntime: {
      reconfigureExecutionPolicy: async (policy: any) => {
        activePolicy = policy;
        return { accepted: true, active: { execution_policy: policy } };
      },
    },
    invokeIntelligenceFn: async () => ({ content: 'unused' }),
  });
  const run: any = service.run({ input, output });
  input.end([
    JSON.stringify({ id: 'policy-1', method: 'runtime.execution_policy.reconfigure', params: { execution_policy: requestedPolicy } }),
    JSON.stringify({ id: 'close-1', method: 'session.close' }),
  ].join('\n') + '\n');
  await run;
  const events: any = rendered.trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  assert.equal(activePolicy.tool_loop.max_rounds, 13);
  assert.equal(events.find((event: any) => event.event === 'session_started')?.execution_policy?.tool_loop?.max_rounds, 200);
  const reconfiguration: any = events.find((event: any) => event.event === 'runtime_execution_policy_reconfiguration' && event.request_id === 'policy-1');
  assert.equal(reconfiguration?.accepted, true);
  assert.equal(reconfiguration?.active?.tool_loop?.max_rounds, 13);
});

test('session-core turn persists carrier and gateway evidence for a provider tool call', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-tool-turn-'));
  let providerCalls: any = 0;
  const invoked: any = [];
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root, mcpScope: 'site' },
    invokeIntelligenceFn: async () => {
      providerCalls += 1;
      return providerCalls === 1
        ? { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'fs_read_file', arguments: '{"path":"note.txt"}' } }] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    },
    toolGateway: {
      toolCatalog: () => [{ type: 'function', function: { name: 'fs_read_file', parameters: { type: 'object' } } }],
      invoke: async (request: any) => { invoked.push(request); return { status: 'completed', content: 'note' }; },
      operationalState: () => 'healthy',
    },
  });
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  output.resume();
  const run: any = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'read note' } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events: any = readFileSync(join(root, 'events.jsonl'), 'utf8');
  assert.equal(invoked.length, 1);
  assert.equal(invoked[0].toolName, 'fs_read_file');
  assert.deepEqual(invoked[0].arguments, { path: 'note.txt' });
  assert.equal(invoked[0].abortSignal instanceof AbortSignal, true);
  assert.match(invoked[0].turnId, /^input_/);
  assert.equal(invoked[0].inputEventId, invoked[0].turnId);
  assert.match(events, /carrier_tool_requested/);
  assert.match(events, /carrier_tool_completed/);
  assert.match(events, /session_control_response/);
  assert.equal(existsSync(join(root, 'session.json')), false);
});

test('JSONL transport handles partial and multiple frames while rejecting malformed JSON objects', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-jsonl-frames-'));
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  let rendered: any = '';
  let providerCalls: any = 0;
  output.on('data', (chunk: any) => { rendered += String(chunk); });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'frames-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    invokeIntelligenceFn: async () => { providerCalls += 1; return { content: 'ok' }; },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run: any = service.run({ input, output });
  const submit: any = JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'partial' } });
  input.write(submit.slice(0, 17));
  input.write(`${submit.slice(17)}\n{"id":\n${JSON.stringify({ id: 'health-1', method: 'session.health' })}\n`);
  input.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events: any = rendered.trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  assert.equal(providerCalls, 1);
  assert.ok(events.some((event: any) => event.event === 'carrier_turn_completed'));
  assert.ok(events.some((event: any) => event.event === 'session_control_rejected' && event.code === 'invalid_json'));
  assert.ok(events.some((event: any) => event.event === 'session_health' && event.request_id === 'health-1'));
});

test('JSONL output preserves order under backpressure and propagates stream failure', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-jsonl-output-'));
  const chunks: any = [];
  const slowOutput: any = new Writable({
    highWaterMark: 1,
    write(chunk: any, _encoding: any, callback: any) {
      setImmediate(() => { chunks.push(String(chunk)); callback(); });
    },
  });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'backpressure-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    invokeIntelligenceFn: async () => ({ content: 'ok' }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const input: any = new PassThrough();
  const run: any = service.run({ input, output: slowOutput });
  input.end(`${Array.from({ length: 12 }, (_: any, index: any) => JSON.stringify({ id: `health-${index}`, method: 'session.health' })).join('\n')}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events: any = chunks.join('').trim().split(/\r?\n/).map((line: any) => JSON.parse(line));
  assert.deepEqual(events.filter((event: any) => event.event === 'session_health').map((event: any) => event.request_id), Array.from({ length: 12 }, (_: any, index: any) => `health-${index}`));
  assert.ok(events.some((event: any) => event.event === 'session_closed'));

  const failingRoot: any = mkdtempSync(join(tmpdir(), 'session-core-jsonl-output-failure-'));
  const failingService: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'output-failure-1', sessionPath: join(failingRoot, 'session.json'), eventsPath: join(failingRoot, 'events.jsonl'), siteRoot: failingRoot },
    invokeIntelligenceFn: async () => ({ content: 'unused' }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const failingInput: any = new PassThrough();
  const failingOutput: any = new Writable({ write(_chunk: any, _encoding: any, callback: any) { callback(new Error('fixture_output_failure')); } });
  const failedRun: any = failingService.run({ input: failingInput, output: failingOutput });
  failingInput.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await assert.rejects(failedRun, /fixture_output_failure/);
});

test('session close propagates capability-gateway shutdown failure', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-close-failure-'));
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'close-failure-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root, mcpScope: 'site' },
    invokeIntelligenceFn: async () => ({ content: 'unused' }),
    toolGateway: {
      toolCatalog: () => [],
      operationalState: () => 'healthy',
      close: async () => { throw new Error('gateway_close_failed'); },
    },
  });
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  output.resume();
  const run: any = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await assert.rejects(run, /gateway_close_failed/);
  assert.match(readFileSync(join(root, 'events.jsonl'), 'utf8'), /session_control_rejected/);
});

test('runtime writes heartbeat evidence and records natural input exhaustion as process exit', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'session-core-heartbeat-'));
  const sessionId: any = 'heartbeat-1';
  const paths: any = resolveNaradaSitePaths({ siteRoot: root, sessionId });
  const service: any = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1',
      session: sessionId,
      sessionPath: paths.narsSessionPath,
      eventsPath: paths.narsEventsPath,
      siteRoot: root,
    },
    invokeIntelligenceFn: async () => ({ content: 'unused' }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
    heartbeatIntervalMs: 1,
  });
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  output.resume();
  const run: any = service.run({ input, output });
  input.end();
  await run;

  const heartbeat: any = JSON.parse(readFileSync(paths.narsHeartbeatPath, 'utf8'));
  const indexRecord: any = JSON.parse(readFileSync(paths.narsSessionIndexRecordPath, 'utf8'));
  assert.equal(heartbeat.schema, 'narada.nars.heartbeat.v1');
  assert.equal(heartbeat.status, 'stopped');
  assert.equal(heartbeat.reason, 'runtime_process_exit');
  assert.equal(indexRecord.terminal_state, 'closed');
  assert.equal(indexRecord.terminal_reason, 'runtime_process_exit');
});
