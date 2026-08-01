import { describe, expect, it } from 'vitest';
import { canonicalizeRouteDirectory, routeDirectoryDigest } from '../scripts/lib/operator-console-mirror-contract.js';

describe('operator console mirror route-directory contract', () => {
  it('compares the complete document while ignoring only generation timestamps', () => {
    const local = {
      schema: 'narada.operator_workspace.route_directory.v3',
      generatedAt: '2026-07-31T10:00:00.000Z',
      surfaces: [{ id: 'registry', projectedRoutes: [{ path: '/console/registry', availability: 'available' }] }],
      httpRouteParity: {
        status: 'complete',
        generatedAt: '2026-07-31T10:00:00.000Z',
        routes: [{ routeId: 'registry.get', method: 'GET' }],
      },
    };
    const remote = {
      httpRouteParity: {
        routes: [{ method: 'GET', routeId: 'registry.get' }],
        generatedAt: '2026-07-31T10:01:00.000Z',
        status: 'complete',
      },
      surfaces: local.surfaces,
      schema: local.schema,
      generatedAt: '2026-07-31T10:01:00.000Z',
    };

    expect(canonicalizeRouteDirectory(remote)).toEqual(canonicalizeRouteDirectory(local));
    expect(routeDirectoryDigest(remote)).toBe(routeDirectoryDigest(local));
  });

  it('does not hide an unexpected contract field', () => {
    const baseline = { schema: 'v3', surfaces: [], httpRouteParity: { status: 'complete' } };
    const changed = { ...baseline, unexpected: true };

    expect(canonicalizeRouteDirectory(changed)).not.toEqual(canonicalizeRouteDirectory(baseline));
    expect(routeDirectoryDigest(changed)).not.toBe(routeDirectoryDigest(baseline));
  });

  it('can compare route behavior across local and Cloudflare authority identities', () => {
    const local = {
      schema: 'narada.operator_workspace.route_directory.v3',
      workspaceHost: { kind: 'local', id: 'operator-console', origin: null },
      surfaces: [{ id: 'registry', projectedRoutes: [{ path: '/console/registry' }] }],
    };
    const remote = {
      schema: local.schema,
      workspaceHost: { kind: 'cloudflare', id: 'worker', origin: 'https://worker.example.test' },
      surfaces: local.surfaces,
    };

    expect(canonicalizeRouteDirectory(remote, { ignoreAuthorityIdentity: true }))
      .toEqual(canonicalizeRouteDirectory(local, { ignoreAuthorityIdentity: true }));
    expect(routeDirectoryDigest(remote, { ignoreAuthorityIdentity: true }))
      .toBe(routeDirectoryDigest(local, { ignoreAuthorityIdentity: true }));
    expect(canonicalizeRouteDirectory(remote)).not.toEqual(canonicalizeRouteDirectory(local));
  });
});
