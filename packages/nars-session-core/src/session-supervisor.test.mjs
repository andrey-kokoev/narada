import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNarsSessionSupervisor } from './session-supervisor.mjs';

test('session supervisor owns queue, journal, lifecycle, and carrier turn invocation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-supervisor-'));
  const eventsPath = join(root, 'events.jsonl');
  const calls = [];
  const supervisor = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'session-1', agentId: 'agent-1', sessionPath: join(root, 'session.json'), eventsPath, siteRoot: root },
    carrier: { runTurn: async (context, eventSink, toolGateway) => {
      calls.push({ context, tools: toolGateway.toolCatalog() });
      await eventSink({ kind: 'provider_response', content: 'done' });
      return { output: 'done' };
    } },
    toolGateway: { toolCatalog: () => [{ name: 'fs_read_file' }], operationalState: () => 'healthy' },
  });

  assert.equal(supervisor.start().lifecycle_state, 'ready');
  await supervisor.submit({ event_id: 'input_1', content: 'hello' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.messages[0].content, 'hello');
  assert.equal(calls[0].tools[0].name, 'fs_read_file');
  assert.equal(supervisor.health().operational_posture, 'healthy');
  await supervisor.close();
  assert.equal(supervisor.health().lifecycle_state, 'closed');
  assert.equal(supervisor.health().operational_posture, 'closed');
  const records = readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(records.some((record) => record.event === 'provider_response'));
});

test('session supervisor records delegated control dispatch in the durable journal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-control-'));
  const eventsPath = join(root, 'events.jsonl');
  const supervisor = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'session-control', sessionPath: join(root, 'session.json'), eventsPath },
    carrier: { runTurn: async () => ({}) },
    handleControlRequest: async ({ request, sessionCore }) => ({ request_id: request.id, lifecycle: sessionCore.lifecycleState }),
  });
  supervisor.start();
  const result = await supervisor.dispatch({ id: 'control_1', method: 'session.health' });
  assert.equal(result.lifecycle, 'ready');
  const events = readFileSync(eventsPath, 'utf8');
  assert.match(events, /control_request_started/);
  assert.match(events, /control_request_completed/);
});

test('session supervisor drains concurrent submissions FIFO without overlapping turns', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-fifo-'));
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstReleased = new Promise((resolve) => { releaseFirst = resolve; });
  const order = [];
  let active = 0;
  let maxActive = 0;
  const supervisor = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'fifo-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl') },
    carrier: { runTurn: async (context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const content = context.messages[0].content;
      order.push(content);
      if (content === 'first') {
        markFirstStarted();
        await firstReleased;
      }
      active -= 1;
      return { content };
    } },
  });
  supervisor.start();
  const first = supervisor.submit({ event_id: 'input_first', content: 'first' });
  await firstStarted;
  const second = supervisor.submit({ event_id: 'input_second', content: 'second' });
  await Promise.resolve();
  assert.deepEqual(supervisor.health().operator_input_queue, {
    running: true,
    pending_count: 2,
    pending_system_directive_count: 0,
    pending_operator_directive_count: 0,
    pending_observer_count: 0,
  });
  assert.equal(supervisor.recovery().operator_input_queue.pending_count, 2);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(maxActive, 1);
  assert.equal(supervisor.health().operator_input_queue.pending_count, 0);
  assert.equal(supervisor.recovery().operator_input_queue.last_transition, 'completed');
  await supervisor.close();
});

test('cancelled and failed turns remain recoverable and are replayed once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-cancel-recover-'));
  const sessionCoreOptions = { sessionId: 'cancel-recover-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl') };
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const cancelled = createNarsSessionSupervisor({
    sessionCoreOptions,
    carrier: { runTurn: ({ abortSignal }) => new Promise((_resolve, reject) => {
      markStarted();
      abortSignal.addEventListener('abort', () => reject(new Error('provider_request_aborted')), { once: true });
    }) },
  });
  cancelled.start();
  const activeTurn = cancelled.submit({ event_id: 'input_cancelled', content: 'cancel me' });
  await started;
  assert.equal(cancelled.health().operator_input_queue.running, true);
  await cancelled.cancel({ reason: 'test_cancel' });
  await assert.rejects(activeTurn, /provider_request_aborted/);
  assert.equal(cancelled.health().operator_input_queue.running, false);
  assert.equal(cancelled.health().operator_input_queue.pending_count, 1);
  assert.equal(cancelled.recovery().operator_input_queue.pending_count, 1);
  await cancelled.close();

  let replayCount = 0;
  const recovered = createNarsSessionSupervisor({
    sessionCoreOptions,
    carrier: { runTurn: async () => { replayCount += 1; return { content: 'recovered' }; } },
  });
  recovered.start();
  await recovered.recoveryDrain;
  assert.equal(replayCount, 1);
  assert.equal(recovered.health().operator_input_queue.pending_count, 0);
  assert.equal(recovered.recovery().operator_input_queue.pending_count, 0);
  await recovered.close();

  const failedRoot = mkdtempSync(join(tmpdir(), 'nars-session-failed-'));
  const failed = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'failed-1', sessionPath: join(failedRoot, 'session.json'), eventsPath: join(failedRoot, 'events.jsonl') },
    carrier: { runTurn: async (_context, eventSink) => {
      await eventSink({ kind: 'carrier_turn_failed', error: 'provider_terminal_failure' });
      throw new Error('provider_terminal_failure');
    } },
  });
  failed.start();
  await assert.rejects(failed.submit({ event_id: 'input_failed', content: 'fail' }), /provider_terminal_failure/);
  assert.equal(failed.health().operator_input_queue.pending_count, 1);
  assert.equal(failed.health().operational_posture, 'request_runtime_failures');
  assert.equal(failed.recovery().operator_input_queue.pending_count, 1);
  await failed.close();
});
