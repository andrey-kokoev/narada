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
import {
  canTransitionSiteOperatingLoopRun,
  createSiteOperatingLoopRunLifecycle,
  transitionSiteOperatingLoopRunLifecycle,
} from './site-operating-loop-state.mjs';

export async function runSiteOperatingLoop(store, {
  loopId,
  runId = makeRunId(),
  ownerId = DEFAULT_SITE_OPERATING_LOOP_OWNER_ID,
  dryRun = false,
  lockTtlMs = 5 * 60_000,
  steps = [],
  summarize = null,
  signal = null,
} = {}) {
  if (!loopId) throw new Error('loopId is required');
  const startedAt = new Date().toISOString();
  const recordedSteps = [];
  const resultsByStepId = {};
  let lock = null;
  let failedStep = null;
  let lifecycle = createSiteOperatingLoopRunLifecycle();

  try {
    lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, 'locking');
    beginLoopRun(store, {
      run_id: runId,
      loop_id: loopId,
      status: 'locking',
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      lifecycle,
    });
    if (signal?.aborted) throw createSiteOperatingLoopAbortError();
    lock = acquireLoopLock(store, { loopId, runId, ownerId, ttlMs: lockTtlMs });
    if (lock.status === 'contended') {
      lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, 'locked');
      const finishedAt = new Date().toISOString();
      finishLoopRun(store, runId, {
        status: 'locked',
        finished_at: finishedAt,
        summary: { lock },
        lifecycle,
      });
      return {
        schema: 'narada.site_operating_loop.run.v1',
        status: 'locked',
        loop_id: loopId,
        run_id: runId,
        dry_run: Boolean(dryRun),
        started_at: startedAt,
        finished_at: finishedAt,
        lock,
        health: getLoopHealth(store, loopId),
        lifecycle_schema: lifecycle.schema,
        lifecycle_state: lifecycle.state,
        lifecycle_history: lifecycle.history,
        lifecycle,
        steps: [],
      };
    }

    lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, 'running');
    finishLoopRun(store, runId, {
      status: 'running',
      finished_at: null,
      summary: lock.status === 'stale_recovered' ? { stale_lock_recovered: lock } : null,
      lifecycle,
    });

    for (const step of steps) {
      if (signal?.aborted) throw createSiteOperatingLoopAbortError();
      const recorded = await runSiteOperatingLoopStep(store, {
        loopId,
        runId,
        dryRun: Boolean(dryRun),
        step,
        priorSteps: recordedSteps,
        resultsByStepId,
        signal,
      });
      recordedSteps.push(recorded);
      resultsByStepId[recorded.step_id] = recorded.result ?? recorded.evidence ?? null;
      if (recorded.status === 'failed') {
        failedStep = recorded;
        throw stepError(recorded);
      }
      if (signal?.aborted) throw createSiteOperatingLoopAbortError();
    }

    if (signal?.aborted) throw createSiteOperatingLoopAbortError();
    const finishedAt = new Date().toISOString();
    const summary = typeof summarize === 'function'
      ? await summarize({ steps: recordedSteps, lock })
      : { step_count: recordedSteps.length };
    lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, 'completed');
    finishLoopRun(store, runId, { status: 'ok', finished_at: finishedAt, summary, lifecycle });
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
      lifecycle_schema: lifecycle.schema,
      lifecycle_state: lifecycle.state,
      lifecycle_history: lifecycle.history,
      lifecycle,
      summary,
      steps: recordedSteps,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const payload = errorToPayload(error);
    const aborted = signal?.aborted === true || error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
    const terminalState = aborted ? 'aborted' : 'failed';
    if (canTransitionSiteOperatingLoopRun(lifecycle.state, terminalState)) {
      lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, terminalState);
    }
    let health = null;
    try {
      finishLoopRun(store, runId, {
        status: aborted ? 'aborted' : 'failed',
        finished_at: finishedAt,
        summary: { step_count: recordedSteps.length },
        error: payload,
        lifecycle,
      });
      health = aborted
        ? getLoopHealth(store, loopId)
        : recordLoopHealthFailure(store, {
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
      status: aborted ? 'aborted' : 'failed',
      loop_id: loopId,
      run_id: runId,
      dry_run: Boolean(dryRun),
      started_at: startedAt,
      finished_at: finishedAt,
      error: payload,
      health,
      lifecycle_schema: lifecycle.schema,
      lifecycle_state: lifecycle.state,
      lifecycle_history: lifecycle.history,
      lifecycle,
      steps: recordedSteps,
    };
  } finally {
    if (lock?.status === 'acquired' || lock?.status === 'stale_recovered') {
      releaseLoopLock(store, { loopId, runId });
    }
  }
}

function createSiteOperatingLoopAbortError() {
  const error = new Error('site_operating_loop_aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

export async function runSiteOperatingLoopStep(store, {
  loopId = null,
  runId,
  dryRun = false,
  step,
  priorSteps = [],
  resultsByStepId = {},
  signal = null,
} = {}) {
  if (!runId) throw new Error('runId is required');
  if (!step?.stepId) throw new Error('step.stepId is required');
  const startedAt = new Date().toISOString();
  try {
    if (signal?.aborted) throw createSiteOperatingLoopAbortError();
    const stepContext = createStepContext({ loopId, runId, dryRun, step, priorSteps, resultsByStepId, startedAt });
    const result = typeof step.execute === 'function' ? await step.execute(stepContext) : null;
    if (signal?.aborted) throw createSiteOperatingLoopAbortError();
    const finishedAt = new Date().toISOString();
    const finishedContext = { ...stepContext, result, finishedAt };
    const record = {
      step_run_id: `${runId}_${step.stepId}_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      run_id: runId,
      step_id: step.stepId,
      status: step.status ?? 'ok',
      started_at: startedAt,
      finished_at: finishedAt,
      input_refs: typeof step.inputRefs === 'function' ? step.inputRefs(result, finishedContext) : step.inputRefs ?? [],
      output_refs: typeof step.outputRefs === 'function' ? step.outputRefs(result, finishedContext) : step.outputRefs ?? [],
      evidence: typeof step.evidence === 'function' ? step.evidence(result, finishedContext) : step.evidence ?? result,
      result,
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
      result: null,
    };
    recordLoopStep(store, record);
    return publicStep(record);
  }
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `site_loop_run_${stamp}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function createStepContext({ loopId, runId, dryRun, step, priorSteps, resultsByStepId, startedAt }) {
  return {
    schema: 'narada.site_operating_loop.step_context.v1',
    loopId,
    loop_id: loopId,
    runId,
    run_id: runId,
    stepId: step.stepId,
    step_id: step.stepId,
    dryRun: Boolean(dryRun),
    dry_run: Boolean(dryRun),
    startedAt,
    started_at: startedAt,
    priorSteps,
    prior_steps: priorSteps,
    resultsByStepId,
    results_by_step_id: resultsByStepId,
  };
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
  if ('result' in step) out.result = step.result;
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
