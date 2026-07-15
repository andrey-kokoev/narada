import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperatorWorkspaceRouteDirectoryTransport,
  parseOperatorWorkspaceRouteDirectory,
} from '../src/console/route-directory.ts';
import { findOperatorRouteTarget, operatorConsoleNavigationFromDirectory } from '../src/console/routes.ts';

const directoryPayload = {
  schema: 'narada.operator_workspace.route_directory.v3',
  workspaceHost: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' },
  surfaces: [{
    schema: 'narada.operator.surface_descriptor.v3',
    id: 'agent-sessions',
    name: 'Agent Sessions',
    scope: 'nars-session',
    owner: 'Agent Web UI',
    authority: { kind: 'nars-session-index', id: null },
    authorityHost: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' },
    projection: { kind: 'session-inventory', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'none', endpoint: null, endpointBase: null, protocols: [] },
    diagnosticOnly: false,
    routes: [
      { id: 'sessions', path: '/console/sessions', kind: 'page', label: 'Sessions', navigationKey: 'sessions' },
      { id: 'router-session-demo', path: '/sessions/session-demo', kind: 'page', label: 'Session session-demo', target: { kind: 'session', id: 'session-demo' } },
    ],
    defaultAvailability: 'available',
    detail: { available: 'available', unavailable: 'unavailable', planned: 'planned' },
    availability: 'available',
    projectedDetail: 'Route is available from this host.',
    projectedRoutes: [
      { id: 'sessions', path: '/console/sessions', kind: 'page', label: 'Sessions', navigationKey: 'sessions', availability: 'available', projectedDetail: 'Route is available from this host.', authority: { kind: 'nars-session-index', id: null }, authorityHost: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' }, projection: { kind: 'session-inventory', owner: '@narada2/operator-console-ui' }, intent: { kind: 'none', endpoint: null, endpointBase: null, protocols: [] }, diagnosticOnly: false },
      { id: 'router-session-demo', path: '/sessions/session-demo', kind: 'page', label: 'Session session-demo', target: { kind: 'session', id: 'session-demo' }, availability: 'available', projectedDetail: 'Route is available from this host.', authority: { kind: 'nars-session-index', id: null }, authorityHost: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' }, projection: { kind: 'session-inventory', owner: '@narada2/operator-console-ui' }, intent: { kind: 'none', endpoint: null, endpointBase: null, protocols: [] }, diagnosticOnly: false },
    ],
  }],
};

test('route-directory parser preserves declared and projected route shapes', () => {
  const directory = parseOperatorWorkspaceRouteDirectory(directoryPayload);
  assert.ok(directory);
  assert.equal(directory.surfaces[0]?.routes[0]?.path, '/console/sessions');
  assert.equal(directory.surfaces[0]?.projectedRoutes[1]?.target?.id, 'session-demo');
  assert.equal(findOperatorRouteTarget(directory, { kind: 'session', id: 'session-demo' }), '/sessions/session-demo');
  assert.deepEqual(operatorConsoleNavigationFromDirectory(directory, 'sessions'), [
    { key: 'sessions', label: 'Sessions', href: '/console/sessions', current: true },
  ]);
});

test('route-directory parser rejects malformed projections instead of inventing defaults', () => {
  const malformed = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
  malformed.surfaces[0].projectedRoutes = malformed.surfaces[0].routes;
  assert.equal(parseOperatorWorkspaceRouteDirectory(malformed), null);
});

test('route-directory parser rejects incomplete authority or intent bindings', () => {
  const malformed = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
  const projectedRoutes = malformed.surfaces[0].projectedRoutes as Array<Record<string, unknown>>;
  delete projectedRoutes[0].authority;
  assert.equal(parseOperatorWorkspaceRouteDirectory(malformed), null);

  const malformedIntent = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
  const intent = malformedIntent.surfaces[0].intent as Record<string, unknown>;
  intent.protocols = ['invalid'];
  assert.equal(parseOperatorWorkspaceRouteDirectory(malformedIntent), null);
});

test('route-directory transport validates the response boundary', async () => {
  const transport = createOperatorWorkspaceRouteDirectoryTransport('/console/routes', async () => (
    new Response(JSON.stringify(directoryPayload), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ));
  const directory = await transport.read();
  assert.equal(directory.schema, 'narada.operator_workspace.route_directory.v3');
});

test('route-directory transport carries Cloudflare projection scope and browser capability', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const transport = createOperatorWorkspaceRouteDirectoryTransport(
    '/api/nars/workspace/routes',
    async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(directoryPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    { projectionId: 'proj_console', browserToken: 'browser-fingerprint' },
  );
  await transport.read();
  assert.equal(calls[0]?.input, '/api/nars/workspace/routes?projection_id=proj_console');
  assert.equal(new Headers(calls[0]?.init?.headers).get('x-narada-browser-token-fingerprint'), 'browser-fingerprint');
});
