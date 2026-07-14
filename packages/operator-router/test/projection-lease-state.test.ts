import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOperatorRouterProjectionLeaseLifecycle,
  transitionOperatorRouterProjectionLease,
} from '../src/projection-lease-state.js';

test('projection lease records renewal and recovery', () => {
  let lifecycle = createOperatorRouterProjectionLeaseLifecycle();
  for (const state of ['registering', 'active', 'renewing', 'degraded', 'recovering', 'active'] as const) {
    lifecycle = transitionOperatorRouterProjectionLease(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'active');
  assert.deepEqual(lifecycle.history, ['requested', 'registering', 'active', 'renewing', 'degraded', 'recovering', 'active']);
});

test('projection lease cannot skip registration or renew after expiry', () => {
  assert.throws(
    () => transitionOperatorRouterProjectionLease(createOperatorRouterProjectionLeaseLifecycle(), 'active'),
    /invalid_operator_router_projection_lease_transition: requested->active/,
  );
  assert.throws(
    () => transitionOperatorRouterProjectionLease(createOperatorRouterProjectionLeaseLifecycle('expired'), 'registering'),
    /invalid_operator_router_projection_lease_transition: expired->registering/,
  );
});
