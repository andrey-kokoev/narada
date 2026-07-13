import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransitionSiteInitLifecycle,
  createSiteInitLifecycle,
  transitionSiteInitLifecycle,
} from './site-init-lifecycle.mjs';

test('site init lifecycle records preview and authorized seed paths', () => {
  let lifecycle = createSiteInitLifecycle();
  for (const state of ['inspecting', 'planned', 'applying', 'seeded', 'initialized']) {
    lifecycle = transitionSiteInitLifecycle(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'initialized');
  assert.deepEqual(lifecycle.history, ['requested', 'inspecting', 'planned', 'applying', 'seeded', 'initialized']);
  assert.equal(canTransitionSiteInitLifecycle('inspecting', 'planned'), true);
  assert.equal(canTransitionSiteInitLifecycle('initialized', 'applying'), false);
});

test('site init lifecycle records a recoverable partial seed', () => {
  let lifecycle = createSiteInitLifecycle();
  for (const state of ['inspecting', 'planned', 'applying', 'partial']) {
    lifecycle = transitionSiteInitLifecycle(lifecycle, state);
  }
  assert.equal(canTransitionSiteInitLifecycle('partial', 'applying'), true);
  assert.throws(
    () => transitionSiteInitLifecycle(lifecycle, 'initialized'),
    /invalid_site_init_transition/,
  );
});
