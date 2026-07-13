import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionSiteLiveCarrier,
  createSiteLiveCarrierLifecycle,
  transitionSiteLiveCarrierLifecycle,
} from './site-live-carrier-state.mjs';

test('site live carrier lifecycle follows plan, apply, and verification paths', () => {
  let lifecycle = createSiteLiveCarrierLifecycle();
  for (const state of ['planning', 'planned', 'applying', 'applied']) {
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'applied');
  assert.deepEqual(lifecycle.history, ['requested', 'planning', 'planned', 'applying', 'applied']);
  assert.equal(canTransitionSiteLiveCarrier('planned', 'verifying'), true);
  assert.equal(canTransitionSiteLiveCarrier('applied', 'verifying'), false);
});

test('site live carrier lifecycle refuses invalid crossings', () => {
  const lifecycle = createSiteLiveCarrierLifecycle();
  assert.throws(
    () => transitionSiteLiveCarrierLifecycle(lifecycle, 'verified'),
    /invalid_site_live_carrier_transition/,
  );
  assert.throws(
    () => transitionSiteLiveCarrierLifecycle(lifecycle, 'unknown'),
    /unsupported_site_live_carrier_state/,
  );
});
