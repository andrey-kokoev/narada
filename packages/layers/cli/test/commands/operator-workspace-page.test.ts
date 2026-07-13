import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOperatorWorkspacePage } from '../../src/commands/operator-workspace-page.ts';

test('operator workspace navigation is projected from available surface descriptors', () => {
  const page = renderOperatorWorkspacePage({
    ingressMode: 'router',
    surfaceAvailability: {},
  });

  assert.match(page, /href="\/console\/registry"[^>]*>Sites<\/a>/);
  assert.match(page, /href="\/console\/launch"[^>]*>Launcher<\/a>/);
  assert.match(page, /href="\/console\/sessions"[^>]*>Sessions<\/a>/);
});

test('operator workspace navigation excludes unavailable descriptor routes', () => {
  const page = renderOperatorWorkspacePage({
    ingressMode: 'router',
    surfaceAvailability: { launcher: 'unavailable' },
  });

  assert.doesNotMatch(page, /href="\/console\/launch"[^>]*>Launcher<\/a>/);
  assert.match(page, /data-surface-id="launcher"/);
});

test('operator workspace navigation excludes unavailable routes within an available surface', () => {
  const page = renderOperatorWorkspacePage({
    ingressMode: 'router',
    surfaceAvailability: {},
    routeAvailability: { 'site-registry': { add: 'unavailable', manage: 'unavailable' } },
  });

  assert.match(page, /href="\/console\/registry"[^>]*>Sites<\/a>/);
  assert.doesNotMatch(page, /href="\/console\/registry\/add"[^>]*>Add Site<\/a>/);
  assert.doesNotMatch(page, /href="\/console\/registry\/manage"[^>]*>Manage<\/a>/);
});
