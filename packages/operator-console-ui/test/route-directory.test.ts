import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOperatorWorkspaceRouteDirectory } from '@narada2/operator-console-contract';
import {
  createOperatorWorkspaceRouteDirectoryTransport,
  createOperatorWorkspaceRouteDirectoryState,
  OperatorWorkspaceRouteDirectoryError,
  parseOperatorWorkspaceRouteDirectory,
} from '../src/console/route-directory.ts';
import {
  findOperatorRouteTarget,
  operatorConsoleNavigationHref,
  operatorConsoleNavigationFromDirectory,
  resolveOperatorConsoleRoute,
} from '../src/console/routes.ts';

test('route-directory parser stays aligned with the contract surface vocabulary', () => {
  const projected = projectOperatorWorkspaceRouteDirectory();
  const directory = parseOperatorWorkspaceRouteDirectory(projected);
  assert.ok(directory);
  assert.equal(directory.surfaces.some((surface) => surface.id === 'site-agents'), true);
  assert.equal(operatorConsoleNavigationHref(directory, 'agents', '/fallback'), '/console/agents');
});

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
  assert.equal(operatorConsoleNavigationHref(directory, 'sessions', '/fallback'), '/console/sessions');
  assert.equal(operatorConsoleNavigationHref(directory, 'sites', '/fallback'), '/fallback');
});

test('runtime route directory controls which console pages can render', () => {
  const directory = parseOperatorWorkspaceRouteDirectory(directoryPayload);
  assert.ok(directory);
  assert.deepEqual(resolveOperatorConsoleRoute('/console/sessions', '', directory), {
    kind: 'agent-sessions',
    path: '/console/sessions',
  });
  assert.deepEqual(resolveOperatorConsoleRoute('/console/registry', '', directory), {
    kind: 'not-found',
    path: '/console/registry',
  });
});

test('route-directory state exposes an actionable initial failure and recovers on retry', async () => {
  const validDirectory = parseOperatorWorkspaceRouteDirectory(directoryPayload);
  assert.ok(validDirectory);
  let attempts = 0;
  const state = createOperatorWorkspaceRouteDirectoryState({
    read: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new OperatorWorkspaceRouteDirectoryError(
          'http_error',
          'Operator route directory failed with HTTP 503.',
          503,
        );
      }
      return validDirectory;
    },
  });

  await state.load();
  assert.equal(state.directory.value, null);
  assert.equal(state.hasAttempted.value, true);
  assert.equal(state.loading.value, false);
  assert.equal(state.errorCode.value, 'http_error');
  assert.equal(state.errorStatus.value, 503);
  assert.equal(state.lastSuccessfulLoadAt.value, null);

  await state.retry();
  assert.equal(state.directory.value?.schema, 'narada.operator_workspace.route_directory.v3');
  assert.equal(state.error.value, null);
  assert.equal(state.errorCode.value, null);
  assert.equal(state.errorStatus.value, null);
  assert.ok(state.lastSuccessfulLoadAt.value);
});

test('route-directory state preserves the last valid snapshot during refresh failure', async () => {
  const validDirectory = parseOperatorWorkspaceRouteDirectory(directoryPayload);
  assert.ok(validDirectory);
  let attempts = 0;
  const state = createOperatorWorkspaceRouteDirectoryState({
    read: async () => {
      attempts += 1;
      if (attempts === 2) {
        throw new OperatorWorkspaceRouteDirectoryError(
          'timeout',
          'Operator route directory timed out after 10000 ms.',
        );
      }
      return validDirectory;
    },
  });

  await state.load();
  const previousDirectory = state.directory.value;
  const previousLoadedAt = state.lastSuccessfulLoadAt.value;
  await state.retry();
  assert.strictEqual(state.directory.value, previousDirectory);
  assert.equal(state.lastSuccessfulLoadAt.value, previousLoadedAt);
  assert.equal(state.errorCode.value, 'timeout');
  assert.equal(state.loading.value, false);
});

test('route-directory parser rejects malformed projections instead of inventing defaults', () => {
  const malformed = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
  malformed.surfaces[0].projectedRoutes = malformed.surfaces[0].routes;
  assert.equal(parseOperatorWorkspaceRouteDirectory(malformed), null);
});

test('route-directory parser rejects external and protocol-relative paths', () => {
  for (const invalidPath of ['https://outside.example/', '//outside.example/']) {
    const malformed = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
    const surface = malformed.surfaces[0];
    const routes = surface.routes as Array<Record<string, unknown>>;
    const projectedRoutes = surface.projectedRoutes as Array<Record<string, unknown>>;
    routes[0].path = invalidPath;
    projectedRoutes[0].path = invalidPath;
    assert.equal(parseOperatorWorkspaceRouteDirectory(malformed), null);
  }
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

test('route-directory parser rejects duplicate navigation keys instead of collapsing them', () => {
  const malformed = structuredClone(directoryPayload) as { surfaces: Array<Record<string, unknown>> };
  const projectedRoutes = malformed.surfaces[0].projectedRoutes as Array<Record<string, unknown>>;
  projectedRoutes[1].navigationKey = 'sessions';
  assert.equal(parseOperatorWorkspaceRouteDirectory(malformed), null);
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

test('route-directory transport bounds a stalled response', async () => {
  const transport = createOperatorWorkspaceRouteDirectoryTransport(
    '/console/routes',
    () => new Promise<Response>(() => {}),
    { timeoutMs: 5 },
  );
  await assert.rejects(() => transport.read(), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'timeout');
    return true;
  });
});
