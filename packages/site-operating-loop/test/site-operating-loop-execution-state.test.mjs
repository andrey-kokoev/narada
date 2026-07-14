import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSiteOperatingLoopExecutionLifecycle,
  isTerminalSiteOperatingLoopExecutionState,
  siteOperatingLoopExecutionLifecycleFromRunState,
  transitionSiteOperatingLoopExecution,
} from '../src/site-operating-loop-execution-state.mjs';

test('Site loop execution records admission, waiting, retry, and completion', () => {
  let lifecycle = createSiteOperatingLoopExecutionLifecycle();
  for (const state of ['admitted', 'running', 'waiting', 'retry', 'running', 'completed']) {
    lifecycle = transitionSiteOperatingLoopExecution(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'completed');
  assert.equal(isTerminalSiteOperatingLoopExecutionState(lifecycle.state), true);
});

test('Site loop execution cannot run before admission or reopen after completion', () => {
  assert.throws(
    () => transitionSiteOperatingLoopExecution(createSiteOperatingLoopExecutionLifecycle(), 'running'),
    /invalid_site_operating_loop_execution_transition: scheduled->running/,
  );
  assert.throws(
    () => transitionSiteOperatingLoopExecution(createSiteOperatingLoopExecutionLifecycle('completed'), 'running'),
    /invalid_site_operating_loop_execution_transition: completed->running/,
  );
  assert.equal(siteOperatingLoopExecutionLifecycleFromRunState('aborted').state, 'cancelled');
});
