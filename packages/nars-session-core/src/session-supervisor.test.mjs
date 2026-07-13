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
  assert.equal(supervisor.core.turn('input_1').turn_state, 'completed');
  assert.equal(supervisor.core.turn('input_1').attempt, 1);
  await supervisor.close();
  assert.equal(supervisor.health().lifecycle_state, 'closed');
  assert.equal(supervisor.health().operational_posture, 'closed');
  const records = readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(records.some((record) => record.event === 'provider_response'));
});

test('session close waits for provider termination and abandons the admitted input', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-close-barrier-'));
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let providerTerminated = false;
  const supervisor = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'close-barrier-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl') },
    carrier: {
      runTurn: async (context, eventSink) => new Promise((_resolve, reject) => {
        markStarted();
        context.abortSignal.addEventListener('abort', async () => {
          providerTerminated = true;
          await eventSink({ kind: 'provider_turn_terminated', turn_id: context.turnId, terminal_state: 'interrupted' });
          reject(new Error('provider_request_aborted'));
        }, { once: true });
      }),
    },
  });

  supervisor.start();
  const activeTurn = supervisor.submit({ event_id: 'input_close_barrier', content: 'stop me' });
  await started;
  const closeResult = supervisor.close({ reason: 'operator_close' });
  await assert.rejects(activeTurn, /provider_request_aborted/);
  const health = await closeResult;

  assert.equal(providerTerminated, true);
  assert.equal(health.lifecycle_state, 'closed');
  assert.equal(health.shutdown_state, 'closed');
  assert.equal(health.operator_input_queue.pending_count, 0);
  assert.equal(supervisor.core.turn('input_close_barrier').turn_state, 'interrupted');
  const records = readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    records.filter((record) => record.event === 'session_shutdown_state_transition').map((record) => record.shutdown_state),
    ['cancelling', 'draining', 'finalizing_queue', 'closing_tools', 'closed'],
  );
  const closedIndex = records.findIndex((record) => record.event === 'session_closed');
  const interruptedIndex = records.findIndex((record) => record.event === 'turn_interrupted');
  assert.ok(interruptedIndex >= 0 && interruptedIndex < closedIndex);
  assert.ok(records.some((record) => record.event_kind === 'input_abandoned_on_session_end'));
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
  assert.equal(cancelled.health().active_turn_id, 'input_cancelled');
  assert.equal(cancelled.health().active_turn_state, 'evaluating');
  await cancelled.cancel({ reason: 'test_cancel' });
  await assert.rejects(activeTurn, /provider_request_aborted/);
  assert.equal(cancelled.health().operator_input_queue.running, false);
  assert.equal(cancelled.health().active_turn_id, null);
  assert.equal(cancelled.health().last_turn_state, 'interrupted');
  assert.equal(cancelled.health().operator_input_queue.pending_count, 1);
  assert.equal(cancelled.core.turn('input_cancelled').turn_state, 'interrupted');
  assert.equal(cancelled.recovery().operator_input_queue.pending_count, 1);
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
  assert.equal(recovered.core.turn('input_cancelled').turn_state, 'completed');
  assert.equal(recovered.core.recoveryAttempts().length, 1);
  assert.equal(recovered.core.recoveryAttempts()[0].recovery_attempt_state, 'completed');
  assert.equal(recovered.core.recoveryAttempts()[0].turn_id, 'input_cancelled');
  await recovered.close();
  await cancelled.close();

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
  assert.equal(failed.core.turn('input_failed').turn_state, 'failed');
  assert.equal(failed.health().operational_posture, 'request_runtime_failures');
  assert.equal(failed.recovery().operator_input_queue.pending_count, 1);
  let failedReplayCount = 0;
  const recoveredFailure = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'failed-1', sessionPath: join(failedRoot, 'session.json'), eventsPath: join(failedRoot, 'events.jsonl') },
    carrier: { runTurn: async () => { failedReplayCount += 1; return { content: 'recovered' }; } },
  });
  recoveredFailure.start();
  await recoveredFailure.recoveryDrain;
  assert.equal(failedReplayCount, 1);
  assert.equal(recoveredFailure.core.turn('input_failed').turn_state, 'completed');
  assert.equal(recoveredFailure.core.recoveryAttempts().length, 1);
  assert.equal(recoveredFailure.core.recoveryAttempts()[0].recovery_attempt_state, 'completed');
  await recoveredFailure.close();
  await failed.close();
});

test('session supervisor records the complete tool-mediated turn state path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-turn-path-'));
  const supervisor = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'turn-path-1', sessionPath: join(root, 'session.json'), eventsPath: join(root, 'events.jsonl') },
    carrier: { runTurn: async (context, eventSink) => {
      await eventSink({ kind: 'carrier_tool_requested', turn_id: context.turnId, tool_name: 'read' });
      await eventSink({ kind: 'carrier_tool_completed', turn_id: context.turnId, tool_name: 'read', status: 'completed' });
      await eventSink({ kind: 'assistant_message', turn_id: context.turnId, content: 'done' });
      await eventSink({ kind: 'carrier_turn_completed', turn_id: context.turnId });
      return { content: 'done' };
    } },
  });
  supervisor.start();
  await supervisor.submit({ event_id: 'input_path', content: 'read it' });
  const turn = supervisor.core.turn('input_path');
  assert.equal(turn.turn_state, 'completed');
  const states = readFileSync(join(root, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter((record) => record.event === 'turn_lifecycle_transition' && record.turn_id === 'input_path')
    .map((record) => record.turn_state);
  assert.deepEqual(states, [
    'accepted',
    'contextualized',
    'evaluating',
    'tool_requested',
    'tool_admitted',
    'executing',
    'reconciling',
    'evaluating',
    'reconciling',
    'completed',
  ]);
  await supervisor.close();
});

test('session supervisor preserves refused and blocked terminal turn outcomes', async () => {
  const refusedRoot = mkdtempSync(join(tmpdir(), 'nars-session-turn-refused-'));
  const refused = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'turn-refused-1', sessionPath: join(refusedRoot, 'session.json'), eventsPath: join(refusedRoot, 'events.jsonl') },
    carrier: { runTurn: async (context, eventSink) => {
      await eventSink({ kind: 'carrier_turn_refused', turn_id: context.turnId, reason: 'authority_posture_refused' });
      return { content: null };
    } },
  });
  refused.start();
  await refused.submit({ event_id: 'input_refused', content: 'not admitted' });
  assert.equal(refused.core.turn('input_refused').turn_state, 'refused');
  assert.equal(refused.core.turn('input_refused').terminal_state, 'refused');
  await refused.submit({ event_id: 'input_refused', content: 'duplicate delivery' });
  assert.equal(refused.core.turn('input_refused').attempt, 1);
  assert.equal(refused.recovery().operator_input_queue.pending_count, 0);
  await refused.close();

  const blockedRoot = mkdtempSync(join(tmpdir(), 'nars-session-turn-blocked-'));
  const blocked = createNarsSessionSupervisor({
    sessionCoreOptions: { sessionId: 'turn-blocked-1', sessionPath: join(blockedRoot, 'session.json'), eventsPath: join(blockedRoot, 'events.jsonl') },
    carrier: { runTurn: async (context, eventSink) => {
      await eventSink({ kind: 'carrier_tool_requested', turn_id: context.turnId, tool_name: 'write' });
      await eventSink({ kind: 'carrier_tool_completed', turn_id: context.turnId, tool_name: 'write', status: 'blocked' });
      return { content: null };
    } },
  });
  blocked.start();
  await blocked.submit({ event_id: 'input_blocked', content: 'blocked effect' });
  assert.equal(blocked.core.turn('input_blocked').turn_state, 'blocked');
  assert.equal(blocked.core.turn('input_blocked').terminal_state, 'blocked');
  assert.equal(blocked.recovery().operator_input_queue.pending_count, 0);
  await blocked.close();
});
