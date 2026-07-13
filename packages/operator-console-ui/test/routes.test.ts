import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorConsoleNavigation,
  resolveOperatorConsoleRoute,
  siteRegistryNavigation,
} from '../src/console/routes.ts';

test('operator console route resolver admits canonical registry and launcher routes', () => {
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry/'), {
    kind: 'site-registry',
    path: '/console/registry',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry', '?site=staccato'), {
    kind: 'site-registry',
    path: '/console/registry',
    siteId: 'staccato',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry/add'), {
    kind: 'site-registry-add',
    path: '/console/registry/add',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry/manage', '?site=staccato&operation=retire'), {
    kind: 'site-registry-manage',
    path: '/console/registry/manage',
    siteId: 'staccato',
    operation: 'retire',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry/manage', '?operation=unknown'), {
    kind: 'site-registry-manage',
    path: '/console/registry/manage',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/launch'), {
    kind: 'launcher',
    path: '/console/launch',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/sessions/'), {
    kind: 'agent-sessions',
    path: '/console/sessions',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/workbench'), {
    kind: 'not-found',
    path: '/console/workbench',
  });
});

test('operator navigation marks exactly one current route and includes launcher routing', () => {
  const items = siteRegistryNavigation('manage');
  assert.equal(items.filter((item) => item.current).length, 1);
  assert.equal(items.find((item) => item.current)?.href, '/console/registry/manage');
  assert.equal(items.find((item) => item.key === 'launcher')?.href, '/console/launch');
  assert.equal(items.find((item) => item.key === 'sessions')?.href, '/console/sessions');

  const launcherItems = operatorConsoleNavigation('launcher');
  assert.equal(launcherItems.filter((item) => item.current).length, 1);
  assert.equal(launcherItems.find((item) => item.current)?.href, '/console/launch');
});
