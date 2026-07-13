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
