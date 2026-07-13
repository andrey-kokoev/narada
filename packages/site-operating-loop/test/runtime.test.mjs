import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  acquireLoopLock,
  admitLoopTrigger,
  claimNextLoopTrigger,
  ensureSiteLoopTables,
  finishLoopTrigger,
  getLoopRun,
  getLoopStatus,
  listLoopRuntimeEvents,
  listLoopTriggers,
  setLoopControl,
} from '../src/site-loop-store.mjs';
import { runSiteOperatingLoop } from '../src/runner.mjs';
import { startSiteOperatingLoopRuntime } from '../src/runtime.mjs';

function openTestStore() {
  const db = new DatabaseSync(':memory:');
  const store = {
    db,
    close() {
      db.close();
    },
  };
  ensureSiteLoopTables(db);
  return store;
}

test('runtime executes bounded cycles with Site-provided steps', async () => {
  const store = openTestStore();
  try {
    const events = [];
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      intervalMs: 0,
      maxCycles: 2,
      wait: async () => {},
      onEvent: (event) => events.push(event),
      createSteps: ({ cycleIndex }) => [{
        stepId: `cycle-${cycleIndex}`,
        execute: () => ({ cycleIndex }),
      }],
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.cycle_count, 2);
    assert.deepEqual(result.cycles.map((cycle) => cycle.status), ['ok', 'ok']);
    assert.deepEqual(result.cycles.map((cycle) => cycle.run.lifecycle_state), ['completed', 'completed']);
    assert.deepEqual(result.cycles.map((cycle) => cycle.run.steps[0].step_id), ['cycle-1', 'cycle-2']);
    assert.deepEqual(events.map((event) => event.event), [
      'runtime_started',
      'cycle_started',
      'cycle_completed',
      'cycle_started',
      'cycle_completed',
      'runtime_stopped',
    ]);
    assert.ok(events.every((event) => event.event_id));

    const status = getLoopStatus(store, { loopId: 'test.loop' });
    assert.equal(status.counts.ok, 2);
    assert.equal(status.health.status, 'healthy');
    assert.equal(status.health.lifecycle_state, 'healthy');

    const storedEvents = listLoopRuntimeEvents(store, { loopId: 'test.loop', limit: 10 });
    assert.equal(storedEvents.count, 6);
    assert.deepEqual(storedEvents.events.map((event) => event.event), events.map((event) => event.event));

    const afterFirst = listLoopRuntimeEvents(store, { loopId: 'test.loop', afterEventId: storedEvents.events[0].event_id, limit: 10 });
    assert.equal(afterFirst.count, 5);
    assert.equal(afterFirst.events[0].event, 'cycle_started');
  } finally {
    store.close();
  }
});

test('contended run persists locked lifecycle evidence', async () => {
  const store = openTestStore();
  try {
    acquireLoopLock(store, {
      loopId: 'test.loop',
      runId: 'active-run',
      ttlMs: 60_000,
    });
    const result = await runSiteOperatingLoop(store, {
      loopId: 'test.loop',
      runId: 'contended-run',
      steps: [],
    });

    assert.equal(result.status, 'locked');
    assert.deepEqual(result.lifecycle_history, ['requested', 'locking', 'locked']);
    const stored = getLoopRun(store, 'contended-run');
    assert.equal(stored.status, 'locked');
    assert.equal(stored.lifecycle_state, 'locked');
    assert.deepEqual(stored.lifecycle_history, ['requested', 'locking', 'locked']);
  } finally {
    store.close();
  }
});

test('aborted run persists an aborted lifecycle without degrading health', async () => {
  const store = openTestStore();
  const controller = new AbortController();
  try {
    const result = await runSiteOperatingLoop(store, {
      loopId: 'test.loop',
      runId: 'aborted-run',
      signal: controller.signal,
      steps: [{
        stepId: 'abort-step',
        execute: () => {
          controller.abort();
          return { reached: true };
        },
      }],
    });

    assert.equal(result.status, 'aborted');
    assert.equal(result.lifecycle_state, 'aborted');
    assert.deepEqual(result.lifecycle_history, ['requested', 'locking', 'running', 'aborted']);
    assert.equal(result.health.status, 'unknown');
    const stored = getLoopRun(store, 'aborted-run');
    assert.equal(stored.status, 'aborted');
    assert.equal(stored.lifecycle_state, 'aborted');
  } finally {
    store.close();
  }
});

test('trigger completion refuses an unclaimed or terminal trigger', () => {
  const store = openTestStore();
  try {
    const admitted = admitLoopTrigger(store, {
      loopId: 'test.loop',
      kind: 'operator_request',
      source: 'test',
    });
    assert.throws(
      () => finishLoopTrigger(store, { triggerId: admitted.trigger_id, status: 'completed' }),
      /invalid_site_operating_loop_trigger_transition/,
    );
    const claimed = claimNextLoopTrigger(store, { loopId: 'test.loop' });
    assert.equal(claimed.trigger_id, admitted.trigger_id);
    finishLoopTrigger(store, { triggerId: admitted.trigger_id, status: 'completed' });
    assert.throws(
      () => finishLoopTrigger(store, { triggerId: admitted.trigger_id, status: 'failed' }),
      /invalid_site_operating_loop_trigger_transition/,
    );
  } finally {
    store.close();
  }
});

test('runtime claims pending trigger and completes it with run evidence', async () => {
  const store = openTestStore();
  try {
    const admitted = admitLoopTrigger(store, {
      loopId: 'test.loop',
      kind: 'operator_request',
      source: 'test',
      sourceRef: 'req-1',
      payload: { prompt: 'run' },
    });
    assert.equal(admitted.status, 'pending');

    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: ({ trigger }) => [{
        stepId: 'trigger-step',
        execute: () => ({ trigger_id: trigger.trigger_id, kind: trigger.kind }),
      }],
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.cycles[0].trigger.trigger_id, admitted.trigger_id);
    assert.equal(result.cycles[0].run.steps[0].evidence.trigger_id, admitted.trigger_id);

    const triggers = listLoopTriggers(store, { loopId: 'test.loop' });
    assert.equal(triggers.count, 1);
    assert.equal(triggers.triggers[0].status, 'completed');
    assert.equal(triggers.triggers[0].run_id, result.cycles[0].run.run_id);
    assert.equal(triggers.triggers[0].lifecycle_state, 'completed');
    assert.deepEqual(triggers.triggers[0].lifecycle_history, ['pending', 'claimed', 'completed']);
  } finally {
    store.close();
  }
});

test('runtime prepares one cycle before creating Site steps and summary', async () => {
  const store = openTestStore();
  try {
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      prepareRun: ({ loopId, cycleIndex }) => ({ token: `${loopId}:${cycleIndex}` }),
      createSteps: ({ prepared }) => [{
        stepId: 'prepared-step',
        execute: () => ({ token: prepared.token }),
      }],
      summarize: ({ prepared, steps }) => ({ token: prepared.token, step_count: steps.length }),
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.cycles[0].run.steps[0].evidence.token, 'test.loop:1');
    assert.equal(result.cycles[0].run.summary.token, 'test.loop:1');
    assert.equal(result.cycles[0].run.summary.step_count, 1);
  } finally {
    store.close();
  }
});

test('runtime passes prior step results and context to later steps', async () => {
  const store = openTestStore();
  try {
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: () => [
        {
          stepId: 'observe',
          execute: ({ loopId, runId }) => ({ loopId, runId, value: 7 }),
          outputRefs: (stepResult, context) => [{ kind: 'observation', ref: `${context.step_id}:${stepResult.value}` }],
        },
        {
          stepId: 'decide',
          execute: ({ resultsByStepId, priorSteps }) => ({
            doubled: resultsByStepId.observe.value * 2,
            prior_step_count: priorSteps.length,
          }),
          inputRefs: (_stepResult, context) => [{ kind: 'step', ref: context.priorSteps[0].step_id }],
        },
      ],
    });

    const [observe, decide] = result.cycles[0].run.steps;
    assert.equal(observe.result.value, 7);
    assert.equal(observe.output_refs[0].ref, 'observe:7');
    assert.equal(decide.result.doubled, 14);
    assert.equal(decide.result.prior_step_count, 1);
    assert.equal(decide.input_refs[0].ref, 'observe');
  } finally {
    store.close();
  }
});

test('runtime records Site step factory failures as loop health evidence', async () => {
  const store = openTestStore();
  try {
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: () => {
        throw new Error('factory failed');
      },
    });

    assert.equal(result.status, 'degraded');
    assert.equal(result.cycles[0].run.steps[0].step_id, 'runtime.create_steps');
    assert.equal(result.cycles[0].run.steps[0].status, 'failed');

    const status = getLoopStatus(store, { loopId: 'test.loop' });
    assert.equal(status.latest.status, 'failed');
    assert.equal(status.health.status, 'degraded');
    assert.equal(status.health.failing_step, 'runtime.create_steps');
  } finally {
    store.close();
  }
});

test('runtime honors pause control without starting a run', async () => {
  const store = openTestStore();
  try {
    setLoopControl(store, {
      loopId: 'test.loop',
      paused: true,
      mode: 'paused',
      reason: 'test_pause',
    });

    let created = false;
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: () => {
        created = true;
        return [];
      },
    });

    assert.equal(created, false);
    assert.equal(result.status, 'ok');
    assert.equal(result.cycle_count, 1);
    assert.equal(result.cycles[0].status, 'paused');
    assert.equal(result.cycles[0].control.reason, 'test_pause');

    const status = getLoopStatus(store, { loopId: 'test.loop' });
    assert.equal(status.latest, null);
    assert.equal(status.control.paused, true);
  } finally {
    store.close();
  }
});

test('runtime degrades when a bounded run step fails but records health', async () => {
  const store = openTestStore();
  try {
    const result = await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: () => [{
        stepId: 'fail-step',
        execute: () => {
          throw new Error('boom');
        },
      }],
    });

    assert.equal(result.status, 'degraded');
    assert.equal(result.cycles[0].status, 'failed');
    assert.equal(result.cycles[0].run.steps[0].status, 'failed');

    const status = getLoopStatus(store, { loopId: 'test.loop' });
    assert.equal(status.health.status, 'degraded');
    assert.equal(status.health.failing_step, 'fail-step');
    assert.equal(status.counts.failed, 1);
  } finally {
    store.close();
  }
});
