import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOperatorSurfaceRoute,
  operatorSurfaceDescriptors,
  operatorSurfaceRoutePath,
  primaryOperatorSurfaceRoute,
  projectOperatorSurfaceCatalog,
  projectOperatorSurfaceNavigation,
} from '../src/index.ts';

test('operator surface catalog describes canonical registry and launcher routes', () => {
  assert.equal(operatorSurfaceDescriptors.length, 5);
  assert.equal(findOperatorSurfaceRoute('/console/registry/')?.surface.id, 'site-registry');
  assert.equal(findOperatorSurfaceRoute('/console/registry/add')?.route.kind, 'workflow');
  assert.equal(findOperatorSurfaceRoute('/console/launch')?.surface.id, 'launcher');
  assert.equal(primaryOperatorSurfaceRoute(operatorSurfaceDescriptors[0])?.path, '/console/registry');
  assert.equal(operatorSurfaceRoutePath('agent-sessions', 'sessions'), '/console/sessions');
});

test('navigation projection follows descriptor availability and labels', () => {
  assert.deepEqual(projectOperatorSurfaceNavigation().map((item) => item.label), [
    'Sites',
    'Add Site',
    'Manage',
    'Launcher',
    'Sessions',
  ]);
  assert.deepEqual(projectOperatorSurfaceNavigation({ availability: { launcher: 'unavailable' } }).map((item) => item.key), [
    'sites',
    'add',
    'manage',
    'sessions',
  ]);
});

test('availability projection preserves planned and unavailable states', () => {
  const catalog = projectOperatorSurfaceCatalog({
    availability: {
      'site-registry': 'unavailable',
      launcher: 'available',
      'agent-sessions': 'planned',
    },
  });
  assert.equal(catalog.find((surface) => surface.id === 'site-registry')?.availability, 'unavailable');
  assert.equal(catalog.find((surface) => surface.id === 'site-registry')?.projectedDetail, 'The Site Registry projection is not available from this host.');
  assert.equal(catalog.find((surface) => surface.id === 'agent-sessions')?.availability, 'planned');
});
