import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransitionSiteLiftLifecycle,
  createSiteLiftLifecycle,
  transitionSiteLiftLifecycle,
} from './site-lift-lifecycle.mjs';

test('site lift lifecycle records create, send, receive, and admission', () => {
  let lifecycle = createSiteLiftLifecycle();
  for (const state of ['validating', 'planned', 'sending', 'sent', 'receiving', 'received', 'admitting', 'admitted']) {
    lifecycle = transitionSiteLiftLifecycle(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'admitted');
  assert.deepEqual(lifecycle.history, [
    'requested',
    'validating',
    'planned',
    'sending',
    'sent',
    'receiving',
    'received',
    'admitting',
    'admitted',
  ]);
  assert.equal(canTransitionSiteLiftLifecycle('sent', 'receiving'), true);
  assert.equal(canTransitionSiteLiftLifecycle('created', 'admitted'), true);
});

test('site lift lifecycle preserves partial recovery as an explicit state', () => {
  let lifecycle = createSiteLiftLifecycle();
  for (const state of ['validating', 'planned', 'sending', 'partial']) lifecycle = transitionSiteLiftLifecycle(lifecycle, state);
  assert.equal(canTransitionSiteLiftLifecycle('partial', 'sending'), true);
  assert.throws(
    () => transitionSiteLiftLifecycle(lifecycle, 'admitted'),
    /invalid_site_lift_transition/,
  );
});
