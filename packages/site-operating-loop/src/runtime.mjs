import {
  claimNextLoopTrigger,
  DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  finishLoopTrigger,
  getLoopControl,
  recordLoopRuntimeEvent,
} from './site-loop-store.mjs';
import { validateSiteOperatingLoopSteps } from './loop-module.mjs';
import { runSiteOperatingLoop } from './runner.mjs';

export const SITE_OPERATING_LOOP_RUNTIME_SCHEMA = 'narada.site_operating_loop.runtime.v1';
export const SITE_OPERATING_LOOP_RUNTIME_EVENT_SCHEMA = 'narada.site_operating_loop.runtime_event.v1';

export async function startSiteOperatingLoopRuntime(store, {
  loopId,
  ownerId = DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  dryRun = false,
  intervalMs = 60_000,
  lockTtlMs = 5 * 60_000,
  maxCycles = 1,
  prepareRun = null,
  createSteps,
  summarize = null,
  signal = null,
  wait = defaultWait,
  onEvent = null,
  recordEvents = true,
} = {}) {
  if (!loopId) throw new Error('loopId is required');
  if (typeof createSteps !== 'function') throw new Error('createSteps is required');

  const startedAt = new Date().toISOString();
  const boundedMaxCycles = normalizeMaxCycles(maxCycles);
  const cycles = [];
  let cycleIndex = 0;
  let stoppedReason = null;

  await emitRuntimeEvent(store, { onEvent, recordEvents }, {
    event: 'runtime_started',
    loop_id: loopId,
    owner_id: ownerId,
    dry_run: Boolean(dryRun),
    interval_ms: intervalMs,
    max_cycles: Number.isFinite(boundedMaxCycles) ? boundedMaxCycles : null,
    timestamp: startedAt,
  });

  while (cycleIndex < boundedMaxCycles) {
    if (signal?.aborted) {
      stoppedReason = 'aborted';
      break;
    }

    cycleIndex += 1;
    const cycleStartedAt = new Date().toISOString();
    await emitRuntimeEvent(store, { onEvent, recordEvents }, {
      event: 'cycle_started',
      loop_id: loopId,
      cycle_index: cycleIndex,
      timestamp: cycleStartedAt,
    });

    const control = getLoopControl(store, loopId);
    if (control.paused) {
      const skipped = {
        schema: 'narada.site_operating_loop.runtime_cycle.v1',
        status: 'paused',
        loop_id: loopId,
        cycle_index: cycleIndex,
        started_at: cycleStartedAt,
        finished_at: new Date().toISOString(),
        control,
      };
      cycles.push(skipped);
      await emitRuntimeEvent(store, { onEvent, recordEvents }, {
        event: 'cycle_completed',
        loop_id: loopId,
        cycle_index: cycleIndex,
        status: skipped.status,
        timestamp: skipped.finished_at,
      });
    } else {
      const context = {
        loopId,
        ownerId,
        dryRun: Boolean(dryRun),
        cycleIndex,
        control,
      };
      const trigger = claimNextLoopTrigger(store, { loopId });
      const run = await runCycle(store, {
        loopId,
        ownerId,
        dryRun,
        lockTtlMs,
        prepareRun,
        createSteps,
        summarize,
        context: { ...context, trigger },
      });
      if (trigger) {
        finishLoopTrigger(store, {
          triggerId: trigger.trigger_id,
          status: run.status === 'ok' ? 'completed' : 'failed',
          runId: run.run_id ?? null,
          result: {
            run_status: run.status,
            run_id: run.run_id ?? null,
            cycle_index: cycleIndex,
          },
        });
      }
      const cycle = {
        schema: 'narada.site_operating_loop.runtime_cycle.v1',
        status: run.status,
        loop_id: loopId,
        cycle_index: cycleIndex,
        started_at: cycleStartedAt,
        finished_at: new Date().toISOString(),
        trigger,
        run,
      };
      cycles.push(cycle);
      await emitRuntimeEvent(store, { onEvent, recordEvents }, {
        event: 'cycle_completed',
        loop_id: loopId,
        cycle_index: cycleIndex,
        status: cycle.status,
        run_id: run.run_id ?? null,
        trigger_id: trigger?.trigger_id ?? null,
        timestamp: cycle.finished_at,
      });
    }

    if (cycleIndex >= boundedMaxCycles) break;
    if (signal?.aborted) {
      stoppedReason = 'aborted';
      break;
    }
    await wait(Math.max(0, Number(intervalMs) || 0), { signal, loopId, cycleIndex });
  }

  const finishedAt = new Date().toISOString();
  const finalStatus = stoppedReason === 'aborted'
    ? 'aborted'
    : cycles.some((cycle) => cycle.status === 'failed')
      ? 'degraded'
      : 'ok';

  const result = {
    schema: SITE_OPERATING_LOOP_RUNTIME_SCHEMA,
    status: finalStatus,
    loop_id: loopId,
    owner_id: ownerId,
    dry_run: Boolean(dryRun),
    started_at: startedAt,
    finished_at: finishedAt,
    interval_ms: intervalMs,
    cycles,
    cycle_count: cycles.length,
    stopped_reason: stoppedReason,
  };

  await emitRuntimeEvent(store, { onEvent, recordEvents }, {
    event: 'runtime_stopped',
    loop_id: loopId,
    status: result.status,
    cycle_count: result.cycle_count,
    stopped_reason: stoppedReason,
    timestamp: finishedAt,
  });

  return result;
}

async function runCycle(store, { loopId, ownerId, dryRun, lockTtlMs, prepareRun, createSteps, summarize, context }) {
  try {
    const prepared = typeof prepareRun === 'function' ? await prepareRun(context) : null;
    const preparedContext = { ...context, prepared };
    const steps = await createSteps(preparedContext);
    const validation = validateSiteOperatingLoopSteps(steps);
    if (validation.status !== 'ok') {
      return await runFactoryFailure(store, {
        loopId,
        ownerId,
        dryRun,
        lockTtlMs,
        error: new Error(`invalid Site Operating Loop steps: ${validation.errors.join(', ')}`),
      });
    }
    return await runSiteOperatingLoop(store, {
      loopId,
      ownerId,
      dryRun,
      lockTtlMs,
      steps,
      summarize: typeof summarize === 'function'
        ? (runContext) => summarize({ ...runContext, ...preparedContext })
        : null,
    });
  } catch (error) {
    return await runFactoryFailure(store, {
      loopId,
      ownerId,
      dryRun,
      lockTtlMs,
      error,
    });
  }
}

async function runFactoryFailure(store, { loopId, ownerId, dryRun, lockTtlMs, error }) {
  return await runSiteOperatingLoop(store, {
    loopId,
    ownerId,
    dryRun,
    lockTtlMs,
    steps: [{
      stepId: 'runtime.create_steps',
      execute: () => {
        throw error;
      },
    }],
  });
}

function normalizeMaxCycles(value) {
  if (value === 'forever' || value === Infinity) return Infinity;
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

async function emitRuntimeEvent(store, { onEvent, recordEvents }, event) {
  const payload = {
    schema: SITE_OPERATING_LOOP_RUNTIME_EVENT_SCHEMA,
    ...event,
  };
  const recorded = recordEvents ? recordLoopRuntimeEvent(store, payload) : payload;
  if (typeof onEvent === 'function') await onEvent(recorded);
}

function defaultWait(ms, { signal } = {}) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}
