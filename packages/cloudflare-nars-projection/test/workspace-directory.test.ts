import { describe, expect, test } from 'vitest';
import {
  OPERATOR_CONSOLE_ASSET_PATH,
  OPERATOR_CONSOLE_PATH,
} from '@narada2/operator-console-contract';
import { CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA } from '../src/index.js';
import { createCloudflareNarsWorkspaceDirectoryService, NarsWorkspaceDirectory } from '../src/workspace-directory.js';
import { createCloudflareNarsProjectionWorker, NarsProjectionState } from '../src/worker.js';

const now = '2026-07-15T22:00:00.000Z';

function route() {
  return {
    id: 'router-session-demo',
    path: '/sessions/session-demo',
    kind: 'page' as const,
    label: 'Session session-demo',
    target: { kind: 'session' as const, id: 'session-demo' },
  };
}

async function jsonOf(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe('Cloudflare Workspace Route Directory', () => {
  test('publishes a scoped route, exposes descriptors only, and revokes explicitly', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const projection = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({
        intent: {
          schema: CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA,
          projection_id: 'proj_workspace',
          site_id: 'narada.sonar',
          nars_session_id: 'session-demo',
          event_stream_policy: 'conversation',
          artifact_projection_policy: { metadata: 'public_records', content: 'none' },
          operator_input_policy: ['conversation.send'],
          replica_cache_policy: 'short_bounded',
        },
      }),
    })));
    const bridge = projection.remote_access.bridge_credential.token_fingerprint;
    const browser = projection.remote_access.browser_access_tokens[0].token_fingerprint;

    expect((await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes?projection_id=proj_workspace'))).status).toBe(401);
    const registered = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes/register', {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': bridge },
      body: JSON.stringify({
        schema: 'narada.cloudflare_nars_workspace.route_lease.v1',
        lease_id: 'lease_session_demo',
        projection_id: 'proj_workspace',
        surface_id: 'agent-sessions',
        route: route(),
        ui_config: {
          cloudflare_projection_id: 'proj_workspace',
          cloudflare_api_base_url: 'https://workspace.example.test',
          cloudflare_browser_token: browser,
        },
      }),
    })));
    expect(registered.status).toBe('registered');

    const directory = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes?projection_id=proj_workspace', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    })));
    expect(directory.schema).toBe('narada.operator_workspace.route_directory.v3');
    expect(directory.workspaceHost).toMatchObject({ kind: 'cloudflare', origin: 'https://workspace.example.test' });
    const sessionSurface = directory.surfaces.find((surface: any) => surface.id === 'agent-sessions');
    expect(sessionSurface.projectedRoutes.find((candidate: any) => candidate.id === 'router-session-demo')).toMatchObject({
      path: '/sessions/session-demo',
      availability: 'available',
      authority: { kind: 'nars-session', id: 'session-demo' },
      authorityHost: { kind: 'cloudflare' },
    });
    expect(JSON.stringify(directory)).not.toContain(browser);

    const sessionPage = await worker.fetch(new Request('https://workspace.example.test/sessions/session-demo'), {
      ASSETS: {
        fetch: () => new Response('<script id="nars-config">__NARADA_AGENT_WEB_UI_CONFIG__</script>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      },
    });
    expect(await sessionPage.text()).toContain(`"cloudflare_projection_id":"proj_workspace"`);

    const revoked = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes/revoke', {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': bridge },
      body: JSON.stringify({ projection_id: 'proj_workspace', lease_id: 'lease_session_demo' }),
    })));
    expect(revoked.status).toBe('revoked');
    const afterRevoke = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes?projection_id=proj_workspace', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    })));
    expect(afterRevoke.surfaces.find((surface: any) => surface.id === 'agent-sessions').availability).toBe('unavailable');
  });

  test('keeps unhealthy and expired leases visible as unavailable until revoked', () => {
    const service = createCloudflareNarsWorkspaceDirectoryService();
    expect(service.register({
      lease_id: 'lease_degraded',
      projection_id: 'proj_degraded',
      surface_id: 'agent-sessions',
      route: route(),
      expires_at: '2026-07-15T21:59:00.000Z',
    }, now).status).toBe('registered');
    const expired = service.projectDirectory({
      workspace_host: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' },
      projection_id: 'proj_degraded',
      now,
    });
    const projected = expired.surfaces.find((surface) => surface.id === 'agent-sessions')?.projectedRoutes.find((candidate) => candidate.id === 'router-session-demo');
    expect(projected?.availability).toBe('unavailable');
    expect(service.revoke('lease_degraded').status).toBe('revoked');
    expect(service.findByPath('/sessions/session-demo', now)).toBeNull();
  });

  test('persists the route directory through its Durable Object binding', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const storage = new Map<string, unknown>();
    const projectionStorage = new Map<string, unknown>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(_id: string) {
          return new NarsProjectionState({
            storage: {
              get<T = unknown>(key: string) { return projectionStorage.get(key) as T | undefined; },
              put(key: string, value: unknown) { projectionStorage.set(key, value); },
            },
          });
        },
      },
      NARS_WORKSPACE_DIRECTORY: {
        idFromName(name: string) { return name; },
        get(_id: string) {
          return new NarsWorkspaceDirectory({
            storage: {
              get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
              put(key: string, value: unknown) { storage.set(key, value); },
            },
          });
        },
      },
    };
    const projection = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({
        intent: {
          schema: CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA,
          projection_id: 'proj_workspace_do',
          site_id: 'narada.sonar',
          nars_session_id: 'session-demo',
          event_stream_policy: 'conversation',
          artifact_projection_policy: { metadata: 'public_records', content: 'none' },
          operator_input_policy: ['conversation.send'],
          replica_cache_policy: 'short_bounded',
        },
      }),
    }), env));
    const bridge = projection.remote_access.bridge_credential.token_fingerprint;
    const browser = projection.remote_access.browser_access_tokens[0].token_fingerprint;
    const registered = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes/register', {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': bridge },
      body: JSON.stringify({
        lease_id: 'lease_workspace_do',
        projection_id: 'proj_workspace_do',
        surface_id: 'agent-sessions',
        route: route(),
      }),
    }), env));
    expect(registered.status).toBe('registered');
    expect(storage.has(NarsWorkspaceDirectory.storageKey)).toBe(true);

    const directory = await jsonOf(await worker.fetch(new Request('https://workspace.example.test/api/nars/workspace/routes?projection_id=proj_workspace_do', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    }), env));
    expect(directory.surfaces.find((surface: any) => surface.id === 'agent-sessions').projectedRoutes)
      .toContainEqual(expect.objectContaining({ id: 'router-session-demo', availability: 'available' }));
  });

  test('injects scoped route-directory configuration into an explicitly leased Console page', async () => {
    const directory = createCloudflareNarsWorkspaceDirectoryService();
    directory.register({
      lease_id: 'lease_console_directory',
      projection_id: 'proj_console',
      surface_id: 'site-registry',
      route: { id: 'sites', path: '/console/registry', kind: 'page', label: 'Sites' },
      ui_config: {
        workspace_route_directory: {
          endpoint: 'https://workspace.example.test/api/<script>&',
          projection_id: 'proj_console',
          browser_token: 'browser-fingerprint',
        },
      },
    }, now);
    const worker = createCloudflareNarsProjectionWorker({ now: () => now, workspace_directory_service: directory });
    const response = await worker.fetch(new Request('https://workspace.example.test/console/registry'), {
      ASSETS: {
        fetch: () => new Response('<script id="operator-console-config">__NARADA_OPERATOR_CONSOLE_CONFIG__</script>', {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-length': '999',
            'content-encoding': 'gzip',
            etag: 'asset-etag',
            digest: 'sha-256=asset',
          },
        }),
      },
    });
    const body = await response.text();
    expect(body).toContain('https://workspace.example.test/api/\\u003cscript\\u003e\\u0026');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('digest')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('serves a route-directory landing and refuses unleased Console routes', async () => {
    const requestedPaths: string[] = [];
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const env = {
      ASSETS: {
        fetch: (request: Request) => {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);
          return pathname === `${OPERATOR_CONSOLE_ASSET_PATH}/index.js`
            ? new Response('asset', { headers: { 'content-type': 'application/javascript' } })
            : new Response('not found', { status: 404 });
        },
      },
    };

    const root = await worker.fetch(new Request('https://workspace.example.test/'), env);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Narada Cloudflare Workspace');
    const consoleLanding = await worker.fetch(new Request(`https://workspace.example.test${OPERATOR_CONSOLE_PATH}/`), env);
    expect(consoleLanding.status).toBe(200);
    expect(await consoleLanding.text()).toContain('Only routes currently leased');

    const unleased = await worker.fetch(new Request('https://workspace.example.test/console/registry'), env);
    expect(unleased.status).toBe(404);
    expect(await unleased.json()).toEqual({ status: 'refused', code: 'operator_console_route_not_leased' });

    const asset = await worker.fetch(new Request(`https://workspace.example.test${OPERATOR_CONSOLE_ASSET_PATH}/index.js`), env);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('asset');

    const legacyAsset = await worker.fetch(new Request('https://workspace.example.test/console/registry/assets/index.js'), env);
    expect(legacyAsset.status).toBe(404);
    expect(requestedPaths).toEqual([
      `${OPERATOR_CONSOLE_ASSET_PATH}/index.js`,
      '/console/registry/assets/index.js',
    ]);
  });
});
