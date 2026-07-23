import {
  assertSiteOperatingLoopRuntimeHostAuthority,
  claimSiteOperatingLoopRuntimeHost,
  claimNextLoopTrigger,
  DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  finishLoopTrigger,
  getLoopControl,
  heartbeatSiteOperatingLoopRuntimeHost,
  recordLoopRuntimeEvent,
  transitionSiteOperatingLoopRuntimeHost,
} from './site-loop-store.mjs';
import { validateSiteOperatingLoopSteps } from './loop-module.mjs';
import { runSiteOperatingLoop } from './runner.mjs';

export const SITE_OPERATING_LOOP_RUNTIME_SCHEMA = 'narada.site_operating_loop.runtime.v1';
export const SITE_OPERATING_LOOP_RUNTIME_EVENT_SCHEMA = 'narada.site_operating_loop.runtime_event.v1';

export async function startSiteOperatingLoopRuntime(store, {
  loopId,
  ownerId = DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  runtimeId = null,
  dryRun = false,
  intervalMs = 60_000,
  lockTtlMs = 5 * 60_000,
  runtimeLeaseTtlMs = 5 * 60_000,
  maxCycles = 1,
  prepareRun = null,
  createSteps,
  summarize = null,
  signal = null,
  wait = defaultWait,
  onEvent = null,
  recordEvents = true,
  metadata = {},
} = {}) {
  if (!loopId) throw new Error('loopId is required');
  if (typeof createSteps !== 'function') throw new Error('createSteps is required');

  const startedAt = new Date().toISOString();
  const boundedMaxCycles = normalizeMaxCycles(maxCycles);
  const runtimeHostLeaseTtlMs = normalizePositiveMilliseconds(runtimeLeaseTtlMs, 'runtimeLeaseTtlMs');
  let host = null;
  let heartbeatTimer = null;
  let leaseError = null;
  const cycles = [];
  let cycleIndex = 0;
  let stoppedReason = null;

  const transitionHost = async (nextState, details = {}) => {
    const transition = transitionSiteOperatingLoopRuntimeHost(store, {
      loopId,
      runtimeId: host.runtime_id,
      authorityEpoch: host.authority_epoch,
      ownerId,
      nextState,
      leaseTtlMs: runtimeHostLeaseTtlMs,
      details,
    });
    host = transition.host;
    if (typeof onEvent === 'function') await onEvent(transition.event);
  };

  const assertRuntimeAuthority = (at = new Date().toISOString()) => {
    if (leaseError) throw leaseError;
    host = assertSiteOperatingLoopRuntimeHostAuthority(store, {
      loopId,
      runtimeId: host.runtime_id,
      authorityEpoch: host.authority_epoch,
      ownerId,
      at,
    });
    return host;
  };

  const startHeartbeat = () => {
    const heartbeatEveryMs = Math.max(25, Math.floor(runtimeHostLeaseTtlMs / 3));
    heartbeatTimer = setInterval(() => {
      try {
        host = heartbeatSiteOperatingLoopRuntimeHost(store, {
          loopId,
          runtimeId: host.runtime_id,
          authorityEpoch: host.authority_epoch,
          ownerId,
          leaseTtlMs: runtimeHostLeaseTtlMs,
        });
      } catch (error) {
        leaseError ??= error;
      }
    }, heartbeatEveryMs);
    heartbeatTimer.unref?.();
  };

  try {
    const claim = claimSiteOperatingLoopRuntimeHost(store, {
      loopId,
      ownerId,
      runtimeId,
      leaseTtlMs: runtimeHostLeaseTtlMs,
      metadata: {
        ...metadata,
        loop_id: loopId,
        owner_id: ownerId,
      },
      at: startedAt,
    });
    host = claim.host;
    if (typeof onEvent === 'function') await onEvent(claim.event);
    await transitionHost('binding', { reason: 'store_and_loop_binding_started' });
    await transitionHost('ready', {
      reason: 'store_and_loop_binding_ready',
      projection_attachment: 'external',
    });
    const runtimeStartedAt = new Date().toISOString();
    await emitRuntimeEvent(store, { onEvent, recordEvents }, {
      event: 'runtime_started',
      loop_id: loopId,
      runtime_id: host.runtime_id,
      authority_epoch: host.authority_epoch,
      owner_id: ownerId,
      runtime_host_state: host.runtime_host_state,
      dry_run: Boolean(dryRun),
      interval_ms: intervalMs,
      max_cycles: Number.isFinite(boundedMaxCycles) ? boundedMaxCycles : null,
      timestamp: runtimeStartedAt,
    });
    await transitionHost('serving', { reason: 'runtime_cycle_processing_started' });
    startHeartbeat();

    while (cycleIndex < boundedMaxCycles) {
      assertRuntimeAuthority();
      if (signal?.aborted) {
        stoppedReason = 'aborted';
        break;
      }

      cycleIndex += 1;
      const cycleStartedAt = new Date().toISOString();
      await emitRuntimeEvent(store, { onEvent, recordEvents }, {
        event: 'cycle_started',
        loop_id: loopId,
        runtime_id: host.runtime_id,
        authority_epoch: host.authority_epoch,
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
          runtime_id: host.runtime_id,
          authority_epoch: host.authority_epoch,
          cycle_index: cycleIndex,
          status: skipped.status,
          timestamp: skipped.finished_at,
        });
      } else {
        const context = {
          loopId,
          ownerId,
          runtimeId: host.runtime_id,
          authorityEpoch: host.authority_epoch,
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
          signal,
          context: { ...context, trigger },
        });
        if (run.status === 'aborted') stoppedReason = 'aborted';
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
          runtime_id: host.runtime_id,
          authority_epoch: host.authority_epoch,
          cycle_index: cycleIndex,
          status: cycle.status,
          run_id: run.run_id ?? null,
          trigger_id: trigger?.trigger_id ?? null,
          timestamp: cycle.finished_at,
        });
      }

      if (cycleIndex >= boundedMaxCycles) break;
      assertRuntimeAuthority();
      if (signal?.aborted) {
        stoppedReason = 'aborted';
        break;
      }
      await wait(Math.max(0, Number(intervalMs) || 0), { signal, loopId, cycleIndex });
    }

    const finalStatus = stoppedReason === 'aborted' || cycles.some((cycle) => cycle.status === 'aborted')
      ? 'aborted'
      : cycles.some((cycle) => cycle.status === 'failed')
        ? 'degraded'
        : 'ok';

    await transitionHost('closing', {
      reason: stoppedReason ?? 'bounded_runtime_complete',
      runtime_status: finalStatus,
    });
    await transitionHost('stopped', {
      reason: stoppedReason ?? 'bounded_runtime_complete',
      runtime_status: finalStatus,
    });
    const finishedAt = new Date().toISOString();

    const result = {
      schema: SITE_OPERATING_LOOP_RUNTIME_SCHEMA,
      status: finalStatus,
      loop_id: loopId,
      owner_id: ownerId,
      runtime_id: host.runtime_id,
      authority_epoch: host.authority_epoch,
      runtime_host_state: host.runtime_host_state,
      runtime_host_lifecycle_history: host.lifecycle_history,
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      finished_at: finishedAt,
      interval_ms: intervalMs,
      cycles,
      cycle_count: cycles.length,
      stopped_reason: stoppedReason ?? (cycles.some((cycle) => cycle.status === 'aborted') ? 'aborted' : null),
    };

    await emitRuntimeEvent(store, { onEvent, recordEvents }, {
      event: 'runtime_stopped',
      loop_id: loopId,
      runtime_id: host.runtime_id,
      authority_epoch: host.authority_epoch,
      owner_id: ownerId,
      runtime_host_state: host.runtime_host_state,
      status: result.status,
      cycle_count: result.cycle_count,
      stopped_reason: stoppedReason,
      timestamp: finishedAt,
    });
    return result;
  } catch (error) {
    if (host) {
      try {
        if (!['failed', 'closing', 'stopped'].includes(host.runtime_host_state)) {
          await transitionHost('failed', {
            reason: String(error?.message ?? error),
          });
        }
        if (host.runtime_host_state === 'failed') {
          await transitionHost('closing', { reason: 'failure_cleanup' });
        }
        if (host.runtime_host_state === 'closing') {
          await transitionHost('stopped', { reason: 'failure_cleanup' });
        }
      } catch {
        // Preserve the original runtime failure. The durable host event or
        // lease state is the recovery evidence when cleanup loses authority.
      }
    }
    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}

async function runCycle(store, { loopId, ownerId, dryRun, lockTtlMs, prepareRun, createSteps, summarize, signal, context }) {
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
        signal,
      });
    }
    return await runSiteOperatingLoop(store, {
      loopId,
      ownerId,
      dryRun,
      lockTtlMs,
      steps,
      signal,
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
      signal,
    });
  }
}

async function runFactoryFailure(store, { loopId, ownerId, dryRun, lockTtlMs, error, signal }) {
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
    signal,
  });
}

function normalizeMaxCycles(value) {
  if (value === 'forever' || value === Infinity) return Infinity;
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizePositiveMilliseconds(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid_positive_milliseconds:${name}:${value}`);
  return Math.floor(parsed);
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
