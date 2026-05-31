import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  acquireLoopLock,
  beginLoopRun,
  finishLoopRun,
  getLoopHealth,
  recordLoopHealthFailure,
  recordLoopHealthSuccess,
  recordLoopStep,
  releaseLoopLock,
} from './site-loop-store.mjs';

export async function runSiteOperatingLoop(store, {
  loopId,
  runId = makeRunId(),
  ownerId = DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  dryRun = false,
  lockTtlMs = 5 * 60_000,
  steps = [],
  summarize = null,
} = {}) {
  if (!loopId) throw new Error('loopId is required');
  const startedAt = new Date().toISOString();
  const recordedSteps = [];
  let lock = null;
  let failedStep = null;

  try {
    lock = acquireLoopLock(store, { loopId, runId, ownerId, ttlMs: lockTtlMs });
    if (lock.status === 'contended') {
      return {
        schema: 'narada.site_operating_loop.run.v1',
        status: 'locked',
        loop_id: loopId,
        run_id: runId,
        dry_run: Boolean(dryRun),
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        lock,
        health: getLoopHealth(store, loopId),
        steps: [],
      };
    }

    beginLoopRun(store, {
      run_id: runId,
      loop_id: loopId,
      status: 'running',
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      summary: lock.status === 'stale_recovered' ? { stale_lock_recovered: lock } : null,
    });

    for (const step of steps) {
      const recorded = await runSiteOperatingLoopStep(store, {
        runId,
        step,
      });
      recordedSteps.push(recorded);
      if (recorded.status === 'failed') {
        failedStep = recorded;
        throw stepError(recorded);
      }
    }

    const finishedAt = new Date().toISOString();
    const summary = typeof summarize === 'function'
      ? await summarize({ steps: recordedSteps, lock })
      : { step_count: recordedSteps.length };
    finishLoopRun(store, runId, { status: 'ok', finished_at: finishedAt, summary });
    const health = recordLoopHealthSuccess(store, { loopId, runId, at: finishedAt });
    return {
      schema: 'narada.site_operating_loop.run.v1',
      status: 'ok',
      loop_id: loopId,
      run_id: runId,
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      finished_at: finishedAt,
      lock,
      health,
      summary,
      steps: recordedSteps,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const payload = errorToPayload(error);
    try {
      finishLoopRun(store, runId, {
        status: 'failed',
        finished_at: finishedAt,
        summary: { step_count: recordedSteps.length },
        error: payload,
      });
      recordLoopHealthFailure(store, {
        loopId,
        runId,
        failingStep: failedStep?.step_id ?? null,
        error: payload,
        at: finishedAt,
      });
    } catch {
      // Preserve the original loop failure.
    }
    return {
      schema: 'narada.site_operating_loop.run.v1',
      status: 'failed',
      loop_id: loopId,
      run_id: runId,
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      finished_at: finishedAt,
      error: payload,
      steps: recordedSteps,
    };
  } finally {
    if (lock?.status === 'acquired' || lock?.status === 'stale_recovered') {
      releaseLoopLock(store, { loopId, runId });
    }
  }
}

export async function runSiteOperatingLoopStep(store, { runId, step }) {
  if (!runId) throw new Error('runId is required');
  if (!step?.stepId) throw new Error('step.stepId is required');
  const startedAt = new Date().toISOString();
  try {
    const result = typeof step.execute === 'function' ? await step.execute() : null;
    const finishedAt = new Date().toISOString();
    const record = {
      step_run_id: `${runId}_${step.stepId}_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      run_id: runId,
      step_id: step.stepId,
      status: step.status ?? 'ok',
      started_at: startedAt,
      finished_at: finishedAt,
      input_refs: typeof step.inputRefs === 'function' ? step.inputRefs(result) : step.inputRefs ?? [],
      output_refs: typeof step.outputRefs === 'function' ? step.outputRefs(result) : step.outputRefs ?? [],
      evidence: typeof step.evidence === 'function' ? step.evidence(result) : step.evidence ?? result,
    };
    recordLoopStep(store, record);
    return publicStep(record);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const record = {
      step_run_id: `${runId}_${step.stepId}_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      run_id: runId,
      step_id: step.stepId,
      status: 'failed',
      started_at: startedAt,
      finished_at: finishedAt,
      input_refs: step.inputRefs ?? [],
      output_refs: [],
      evidence: null,
      error: errorToPayload(error),
    };
    recordLoopStep(store, record);
    return publicStep(record);
  }
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `site_loop_run_${stamp}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function publicStep(step) {
  const out = {
    step_id: step.step_id,
    status: step.status,
    started_at: step.started_at,
    finished_at: step.finished_at,
    input_refs: step.input_refs ?? [],
    output_refs: step.output_refs ?? [],
    evidence: step.evidence ?? null,
  };
  if (step.error) out.error = step.error;
  return out;
}

function stepError(step) {
  const error = new Error(step.error?.message ?? `Site Operating Loop step failed: ${step.step_id}`);
  error.step = step;
  return error;
}

function errorToPayload(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
  };
}
