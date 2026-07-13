import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOperatorSurfaceRoute,
  operatorSurfaceDescriptors,
  operatorSurfaceRoutePath,
  primaryProjectedOperatorSurfaceRoute,
  primaryOperatorSurfaceRoute,
  projectOperatorSurfaceCatalog,
  projectOperatorSurfaceNavigation,
  projectOperatorWorkspaceRouteDirectory,
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

test('navigation projection excludes routes that are unavailable within an available surface', () => {
  assert.deepEqual(projectOperatorSurfaceNavigation({
    routeAvailability: { 'site-registry': { add: 'unavailable', manage: 'unavailable' } },
  }).map((item) => item.key), ['sites', 'launcher', 'sessions']);
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

test('workspace route directory preserves concrete and template route availability', () => {
  const directory = projectOperatorWorkspaceRouteDirectory({
    availability: { artifacts: 'available' },
    routeAvailability: {
      'site-registry': { sites: 'available', add: 'unavailable', manage: 'planned' },
      artifacts: { artifact: 'available' },
    },
  });
  assert.equal(directory.schema, 'narada.operator_workspace.route_directory.v1');
  const registry = directory.surfaces.find((surface) => surface.id === 'site-registry');
  assert.equal(registry?.projectedRoutes.find((route) => route.id === 'sites')?.availability, 'available');
  assert.equal(registry?.projectedRoutes.find((route) => route.id === 'add')?.availability, 'unavailable');
  const artifacts = directory.surfaces.find((surface) => surface.id === 'artifacts');
  assert.equal(primaryProjectedOperatorSurfaceRoute(artifacts!)?.path, '/artifacts/<session-id>/<artifact-id>/');
  assert.equal(artifacts?.projectedRoutes[0]?.availability, 'available');
  assert.deepEqual(projectOperatorSurfaceNavigation({
    availability: { artifacts: 'available' },
    routeAvailability: { artifacts: { artifact: 'available' } },
  }).map((item) => item.key), ['sites', 'add', 'manage', 'launcher', 'sessions']);
});
