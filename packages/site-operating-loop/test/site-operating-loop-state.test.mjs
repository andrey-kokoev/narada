import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransitionSiteOperatingLoopHealth,
  canTransitionSiteOperatingLoopTrigger,
  createSiteOperatingLoopHealthLifecycle,
  createSiteOperatingLoopRunLifecycle,
  createSiteOperatingLoopTriggerLifecycle,
  transitionSiteOperatingLoopHealthLifecycle,
  transitionSiteOperatingLoopRunLifecycle,
  transitionSiteOperatingLoopTriggerLifecycle,
} from '../src/site-operating-loop-state.mjs';

test('operating loop run lifecycle records locking and completion', () => {
  let lifecycle = createSiteOperatingLoopRunLifecycle();
  for (const state of ['locking', 'running', 'completed']) lifecycle = transitionSiteOperatingLoopRunLifecycle(lifecycle, state);
  assert.equal(lifecycle.state, 'completed');
  assert.deepEqual(lifecycle.history, ['requested', 'locking', 'running', 'completed']);
});

test('operating loop trigger lifecycle only completes after claim', () => {
  let lifecycle = createSiteOperatingLoopTriggerLifecycle();
  lifecycle = transitionSiteOperatingLoopTriggerLifecycle(lifecycle, 'claimed');
  lifecycle = transitionSiteOperatingLoopTriggerLifecycle(lifecycle, 'completed');
  assert.equal(lifecycle.state, 'completed');
  assert.equal(canTransitionSiteOperatingLoopTrigger('pending', 'completed'), false);
  assert.equal(canTransitionSiteOperatingLoopTrigger('claimed', 'failed'), true);
});

test('operating loop health lifecycle permits recovery and escalation', () => {
  let lifecycle = createSiteOperatingLoopHealthLifecycle();
  lifecycle = transitionSiteOperatingLoopHealthLifecycle(lifecycle, 'degraded');
  lifecycle = transitionSiteOperatingLoopHealthLifecycle(lifecycle, 'critical');
  lifecycle = transitionSiteOperatingLoopHealthLifecycle(lifecycle, 'healthy');
  assert.deepEqual(lifecycle.history, ['unknown', 'degraded', 'critical', 'healthy']);
  assert.equal(canTransitionSiteOperatingLoopHealth('healthy', 'critical'), true);
});

test('operating loop lifecycle rejects terminal shortcuts', () => {
  assert.throws(
    () => transitionSiteOperatingLoopRunLifecycle(createSiteOperatingLoopRunLifecycle(), 'completed'),
    /invalid_site_operating_loop_run_transition/,
  );
  assert.throws(
    () => transitionSiteOperatingLoopTriggerLifecycle(createSiteOperatingLoopTriggerLifecycle(), 'completed'),
    /invalid_site_operating_loop_trigger_transition/,
  );
});
