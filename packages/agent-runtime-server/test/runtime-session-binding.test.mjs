import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { createRuntimeSessionBinding } from '../src/runtime-session-binding.mjs';
import { createSessionCoreRuntimeService } from '../src/session-core-runtime-service.mjs';

test('runtime session binding delegates session state to session core and turns to carrier adapter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-session-binding-'));
  const binding = createRuntimeSessionBinding({
    runtimeContext: {
      identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    callChatApiFn: async (messages, tools) => ({ content: messages[0].content, tool_count: tools.length }),
    toolGateway: { toolCatalog: () => [{ name: 'fs_read_file' }], operationalState: () => 'healthy' },
  });
  assert.equal(binding.start().lifecycle_state, 'ready');
  await binding.submit({ event_id: 'input_1', content: 'hello' });
  assert.equal(binding.health().lifecycle_state, 'ready');
  await binding.close();
  assert.equal(binding.health().lifecycle_state, 'closed');
});

test('session cancel aborts an active provider turn while close waits for settlement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'session-core-cancel-'));
  const input = new PassThrough(); const output = new PassThrough(); let rendered = '';
  output.on('data', (chunk) => { rendered += String(chunk); });
  const service = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'cancel-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    callChatApiFn: (_messages, _tools, settings) => new Promise((_resolve, reject) => {
      if (settings.abortSignal.aborted) reject(new Error('provider_request_aborted'));
      else settings.abortSignal.addEventListener('abort', () => reject(new Error('provider_request_aborted')), { once: true });
    }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'wait' } })}\n${JSON.stringify({ id: 'cancel-1', method: 'session.cancel' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events = rendered.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(events.some((event) => event.event === 'session_cancel' && event.cancelled === true));
  assert.ok(events.some((event) => event.event === 'carrier_turn_failed' && event.error === 'provider_request_aborted'));
  assert.ok(events.some((event) => event.event === 'session_closed'));
});

test('session-core runtime service rejects non-session controls and retains the narrow control boundary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'session-core-runtime-service-'));
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = '';
  output.on('data', (chunk) => { rendered += String(chunk); });
  const service = createSessionCoreRuntimeService({
    runtimeContext: {
      identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root,
    },
    callChatApiFn: async () => ({ content: 'ok' }),
  });
  const run = service.run({ input, output });
  input.end([
    JSON.stringify({ id: 'health-1', method: 'session.health' }),
    JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } }),
    JSON.stringify({ id: 'bad-1', method: 'legacy.mutate' }),
    JSON.stringify({ id: 'close-1', method: 'session.close' }),
  ].join('\n'));
  await run;
  const events = rendered.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(events.some((event) => event.event === 'session_health' && event.request_id === 'health-1'));
  assert.ok(events.some((event) => event.event === 'carrier_turn_completed'));
  assert.ok(events.some((event) => event.event === 'session_control_rejected' && event.request_id === 'bad-1'));
  assert.ok(events.some((event) => event.lifecycle_state === 'closed'));
});

test('session-core turn persists carrier and gateway evidence for a provider tool call', async () => {
  const root = mkdtempSync(join(tmpdir(), 'session-core-tool-turn-'));
  let providerCalls = 0;
  const invoked = [];
  const service = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'session-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    callChatApiFn: async () => {
      providerCalls += 1;
      return providerCalls === 1
        ? { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'fs_read_file', arguments: '{"path":"note.txt"}' } }] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    },
    toolGateway: {
      toolCatalog: () => [{ type: 'function', function: { name: 'fs_read_file', parameters: { type: 'object' } } }],
      invoke: async (request) => { invoked.push(request); return { status: 'completed', content: 'note' }; },
      operationalState: () => 'healthy',
    },
  });
  const input = new PassThrough();
  const output = new PassThrough();
  const run = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'read note' } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events = readFileSync(join(root, 'events.jsonl'), 'utf8');
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
  const root = mkdtempSync(join(tmpdir(), 'session-core-jsonl-frames-'));
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = '';
  let providerCalls = 0;
  output.on('data', (chunk) => { rendered += String(chunk); });
  const service = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'frames-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    callChatApiFn: async () => { providerCalls += 1; return { content: 'ok' }; },
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const run = service.run({ input, output });
  const submit = JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'partial' } });
  input.write(submit.slice(0, 17));
  input.write(`${submit.slice(17)}\n{"id":\n${JSON.stringify({ id: 'health-1', method: 'session.health' })}\n`);
  input.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events = rendered.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(providerCalls, 1);
  assert.ok(events.some((event) => event.event === 'carrier_turn_completed'));
  assert.ok(events.some((event) => event.event === 'session_control_rejected' && event.code === 'invalid_json'));
  assert.ok(events.some((event) => event.event === 'session_health' && event.request_id === 'health-1'));
});

test('JSONL output preserves order under backpressure and propagates stream failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'session-core-jsonl-output-'));
  const chunks = [];
  const slowOutput = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      setImmediate(() => { chunks.push(String(chunk)); callback(); });
    },
  });
  const service = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'backpressure-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    callChatApiFn: async () => ({ content: 'ok' }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const input = new PassThrough();
  const run = service.run({ input, output: slowOutput });
  input.end(`${Array.from({ length: 12 }, (_, index) => JSON.stringify({ id: `health-${index}`, method: 'session.health' })).join('\n')}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await run;
  const events = chunks.join('').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(events.filter((event) => event.event === 'session_health').map((event) => event.request_id), Array.from({ length: 12 }, (_, index) => `health-${index}`));
  assert.ok(events.some((event) => event.event === 'session_closed'));

  const failingRoot = mkdtempSync(join(tmpdir(), 'session-core-jsonl-output-failure-'));
  const failingService = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'output-failure-1', sessionPath: join(failingRoot, 'session.json'), eventsPath: join(failingRoot, 'events.jsonl'), siteRoot: failingRoot },
    callChatApiFn: async () => ({ content: 'unused' }),
    toolGateway: { toolCatalog: () => [], operationalState: () => 'healthy' },
  });
  const failingInput = new PassThrough();
  const failingOutput = new Writable({ write(_chunk, _encoding, callback) { callback(new Error('fixture_output_failure')); } });
  const failedRun = failingService.run({ input: failingInput, output: failingOutput });
  failingInput.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await assert.rejects(failedRun, /fixture_output_failure/);
});

test('session close propagates capability-gateway shutdown failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'session-core-close-failure-'));
  const service = createSessionCoreRuntimeService({
    runtimeContext: { identity: 'agent-1', session: 'close-failure-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl'), siteRoot: root },
    callChatApiFn: async () => ({ content: 'unused' }),
    toolGateway: {
      toolCatalog: () => [],
      operationalState: () => 'healthy',
      close: async () => { throw new Error('gateway_close_failed'); },
    },
  });
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const run = service.run({ input, output });
  input.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
  await assert.rejects(run, /gateway_close_failed/);
  assert.match(readFileSync(join(root, 'events.jsonl'), 'utf8'), /session_control_rejected/);
});
