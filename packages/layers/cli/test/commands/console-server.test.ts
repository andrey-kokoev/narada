import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import {
  createConsoleServer,
  ensureConsoleServer,
  OPERATOR_CONSOLE_IDENTITY,
} from '../../src/commands/console-server.js';

// The Registry page embeds a built package artifact; this test must read it from the real checkout.
vi.unmock('node:fs');

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) })),
  close: vi.fn(),
};

const mockControlClient = {
  executeControlRequest: vi.fn(),
};

const mockCloudflareControlClient = {
  executeControlRequest: vi.fn(),
};

vi.mock('@narada2/windows-site', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@narada2/windows-site')>();
  return {
    ...mod,
    Database: vi.fn(() => mockDb),
    openRegistryDb: vi.fn(async () => mockDb),
    getWindowsSiteStatus: vi.fn(async (_siteId: string, _variant: string) => ({
      siteId: _siteId,
      variant: _variant,
      siteRoot: '/tmp/test-site',
      health: {
        site_id: _siteId,
        status: 'healthy',
        last_cycle_at: '2026-04-20T10:00:00Z',
        last_cycle_duration_ms: 1500,
        consecutive_failures: 0,
        message: 'OK',
        updated_at: '2026-04-20T10:00:00Z',
      },
      lastTrace: null,
    })),
    windowsSiteAdapter: {
      supports: vi.fn((site: { variant: string }) => site.variant === 'native' || site.variant === 'wsl'),
      createObservationApi: vi.fn((site: { siteId: string; variant: string }) => ({
        getHealth: async () => ({
          site_id: site.siteId,
          status: 'healthy',
          last_cycle_at: '2026-04-20T10:00:00Z',
          last_cycle_duration_ms: 1500,
          consecutive_failures: 0,
          message: 'OK',
          updated_at: '2026-04-20T10:00:00Z',
        }),
        getStuckWorkItems: async () => [
          { work_item_id: 'wi-1', scope_id: 'scope-1', status: 'failed_retryable' as const, context_id: 'ctx-1', last_updated_at: '2026-04-20T10:00:00Z', summary: 'Failed' },
        ],
        getPendingOutboundCommands: async () => [
          { outbound_id: 'ob-1', scope_id: 'scope-1', context_id: 'ctx-1', action_type: 'send_reply', status: 'pending', created_at: '2026-04-20T10:00:00Z', summary: 'Pending' },
        ],
        getPendingDrafts: async () => [
          { draft_id: 'draft-1', scope_id: 'scope-1', context_id: 'ctx-1', status: 'draft_ready' as const, created_at: '2026-04-20T10:00:00Z', summary: 'Draft ready' },
        ],
        getCredentialRequirements: async () => [],
      })),
      createControlClient: vi.fn((site: { siteId: string }) => {
        if (site.siteId === 'site-live' || site.siteId === 'site-x') {
          return mockControlClient;
        }
        return undefined;
      }),
    },
  };
});

vi.mock('@narada2/cloudflare-site', () => ({
  cloudflareSiteAdapter: {
    supports: vi.fn((site: { variant: string; substrate: string }) =>
      site.variant === 'cloudflare' || site.substrate === 'cloudflare'
    ),
    createObservationApi: vi.fn(() => ({
      getHealth: async () => ({
        site_id: 'cf-site',
        status: 'healthy',
        last_cycle_at: '2026-04-20T10:00:00Z',
        last_cycle_duration_ms: 1200,
        consecutive_failures: 0,
        message: 'OK',
        updated_at: '2026-04-20T10:00:00Z',
      }),
      getStuckWorkItems: async () => [],
      getPendingOutboundCommands: async () => [],
      getPendingDrafts: async () => [],
      getCredentialRequirements: async () => [],
    })),
    createControlClient: vi.fn((site: { siteId: string }) => {
      if (site.siteId === 'cf-live') {
        return mockCloudflareControlClient;
      }
      return undefined;
    }),
  },
}));

vi.mock('@narada2/linux-site', () => ({
  linuxSiteAdapter: {
    supports: vi.fn((site: { variant: string }) =>
      site.variant === 'linux-user' || site.variant === 'linux-system'
    ),
    createObservationApi: vi.fn(() => ({
      getHealth: async () => ({
        site_id: 'linux-site',
        status: 'healthy',
        last_cycle_at: '2026-04-20T10:00:00Z',
        last_cycle_duration_ms: 1000,
        consecutive_failures: 0,
        message: 'OK',
        updated_at: '2026-04-20T10:00:00Z',
      }),
      getStuckWorkItems: async () => [],
      getPendingOutboundCommands: async () => [],
      getPendingDrafts: async () => [],
      getCredentialRequirements: async () => [],
    })),
    createControlClient: vi.fn(() => ({
      executeControlRequest: async () => ({
        success: false,
        status: 'error' as const,
        detail: 'Linux Site control is not yet implemented in v0',
      }),
    })),
  },
}));

const sitesLaunchCommandMock = vi.fn();
vi.mock('../../src/commands/sites-launch.js', () => ({
  sitesLaunchCommand: (...args: unknown[]) => sitesLaunchCommandMock(...args),
}));

const doctorCommandMock = vi.fn();
const onboardingStatusCommandMock = vi.fn();
const onboardingStartCommandMock = vi.fn();
vi.mock('../../src/commands/doctor.js', () => ({
  doctorCommand: (...args: unknown[]) => doctorCommandMock(...args),
}));
vi.mock('../../src/commands/onboarding.js', () => ({
  onboardingStatusCommand: (...args: unknown[]) => onboardingStatusCommandMock(...args),
  onboardingStartCommand: (...args: unknown[]) => onboardingStartCommandMock(...args),
}));

async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function httpPost(url: string, payload: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

describe('console server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockControlClient.executeControlRequest.mockReset();
    mockCloudflareControlClient.executeControlRequest.mockReset();
    mockDb.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 0 })),
    });
    doctorCommandMock.mockResolvedValue({
      exitCode: 0,
      result: {
        schema: 'narada.doctor.bootstrap.v1',
        status: 'ready',
        provider_readiness: [{ provider: 'codex-subscription', status: 'ready' }],
        checks: [],
      },
    });
    onboardingStatusCommandMock.mockResolvedValue({
      exitCode: 0,
      result: {
        schema: 'narada.onboarding.status.v1',
        status: 'not_started',
        user_site: { root: 'D:/Narada', resident_agent: 'resident' },
        session: null,
        verification: null,
        next_action: 'Start your assistant.',
      },
    });
    onboardingStartCommandMock.mockResolvedValue({
      exitCode: 0,
      result: {
        schema: 'narada.onboarding.start.v1',
        status: 'launched',
        next_action: 'Wait for the resident session.',
        launch: { command: ['secret-process-detail'] },
      },
    });
  });

  describe('lifecycle', () => {
    it('starts and stops cleanly', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      expect(url).toContain('http://127.0.0.1:');
      expect(server.isRunning()).toBe(true);
      expect(server.getOwnership()).toBe('diagnostic');
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('throws when started twice', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      await server.start();
      await expect(server.start()).rejects.toThrow('already started');
      await server.stop();
    });

    it('exposes stable identity health and redacted surface routes', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1', ingressMode: 'router' });
      const url = await server.start();
      const health = await httpGet(`${url}/health`);
      expect(health.status).toBe(200);
      expect((health.body as { identity: string; status: string }).identity).toBe(OPERATOR_CONSOLE_IDENTITY);
      expect((health.body as { status: string }).status).toBe('healthy');

      const routes = await httpGet(`${url}/routes`);
      expect(routes.status).toBe(200);
      expect((routes.body as { routes: Array<{ path: string }> }).routes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: '/console/registry' }),
        expect.objectContaining({ path: '/console/launch' }),
      ]));

      const workspaceRoutes = await httpGet(`${url}/console/routes`);
      expect(workspaceRoutes.status).toBe(200);
      expect((workspaceRoutes.body as { schema: string; surfaces: unknown[] }).schema)
        .toBe('narada.operator_workspace.route_directory.v3');
      expect(Array.isArray((workspaceRoutes.body as { surfaces: unknown[] }).surfaces)).toBe(true);

      const ingress = await fetch(url, { redirect: 'manual' });
      expect(ingress.status).toBe(302);
      expect(ingress.headers.get('location')).toBe('/console/agents');

      const surfaces = await fetch(`${url}/console/surfaces`);
      expect(surfaces.status).toBe(200);
      expect(await surfaces.text()).toContain('Operator Workspace');
      await server.stop();
    });

    it('projects healthy Router leases into the Workspace directory and concrete links', async () => {
      const server = await createConsoleServer({
        port: 0,
        host: '127.0.0.1',
        ingressMode: 'router',
        operatorRouterUrl: 'http://127.0.0.1:61729',
        readOperatorRouterRoutes: async () => ({
          schema: 'narada.operator_router.routes.v1',
          identity: 'narada.operator-router',
          routes: [
            {
              route_id: 'site-operations-site-a',
              route_class: 'site-operations',
              backend_kind: 'http',
              public_path: '/sites/site-a/operations',
              route_mode: 'prefix',
              owner_id: 'site-operations:site-a',
              site_id: 'site-a',
              session_id: null,
              protocols: ['http'],
              methods: ['GET'],
              state: 'healthy',
              lease_expires_at: '2026-07-14T00:00:00.000Z',
              last_health_at: '2026-07-13T00:00:00.000Z',
              last_health_error: null,
            },
            {
              route_id: 'agent-session-session-a',
              route_class: 'agent-web-ui',
              backend_kind: 'http',
              public_path: '/sessions/session-a',
              route_mode: 'prefix',
              owner_id: 'agent-web-ui:session-a',
              site_id: 'site-a',
              session_id: 'session-a',
              protocols: ['http'],
              methods: ['GET'],
              state: 'healthy',
              lease_expires_at: '2026-07-14T00:00:00.000Z',
              last_health_at: '2026-07-13T00:00:00.000Z',
              last_health_error: null,
            },
            {
              route_id: 'nars-artifact-session-a',
              route_class: 'nars-artifact',
              backend_kind: 'nars-artifact',
              public_path: '/artifacts/session-a',
              route_mode: 'prefix',
              owner_id: 'agent-web-ui:session-a',
              site_id: 'site-a',
              session_id: 'session-a',
              protocols: ['http'],
              methods: ['GET'],
              state: 'healthy',
              lease_expires_at: '2026-07-14T00:00:00.000Z',
              last_health_at: '2026-07-13T00:00:00.000Z',
              last_health_error: null,
            },
          ],
        }),
      });
      const url = await server.start();

      const directory = await httpGet(`${url}/console/routes`);
      expect(directory.status).toBe(200);
      const surfaces = (directory.body as { surfaces: Array<{
        id: string;
        availability: string;
        authority: { kind: string; id: string | null };
        projection: { kind: string; owner: string };
        intent: { kind: string; endpoint: string | null; protocols: string[] };
        diagnosticOnly: boolean;
        projectedRoutes: Array<{
          path: string;
          availability: string;
          authority: { kind: string; id: string | null };
          projection: { kind: string; owner: string };
          intent: { kind: string; endpoint: string | null; protocols: string[] };
          diagnosticOnly: boolean;
          target?: { kind: string; id: string };
        }>;
      }> }).surfaces;
      expect(surfaces.find((surface) => surface.id === 'site-operations')).toEqual(expect.objectContaining({
        authority: { kind: 'site', id: null },
        projection: { kind: 'site-operations', owner: '@narada2/cli' },
        intent: { kind: 'site-control', endpoint: '/sites/<site-id>/operations/', endpointBase: 'workspace', protocols: ['http'] },
        diagnosticOnly: false,
      }));
      expect(surfaces.find((surface) => surface.id === 'site-operations')?.availability).toBe('available');
      expect(surfaces.find((surface) => surface.id === 'site-operations')?.projectedRoutes)
        .toEqual(expect.arrayContaining([expect.objectContaining({
          path: '/sites/site-a/operations',
          availability: 'available',
          target: { kind: 'site', id: 'site-a' },
          authority: { kind: 'site', id: 'site-a' },
          projection: { kind: 'site-operations', owner: '@narada2/cli' },
          intent: { kind: 'site-control', endpoint: '/sites/<site-id>/operations/', endpointBase: 'workspace', protocols: ['http'] },
          diagnosticOnly: false,
        })]));
      expect(surfaces.find((surface) => surface.id === 'agent-sessions')?.projectedRoutes)
        .toEqual(expect.arrayContaining([expect.objectContaining({
          path: '/sessions/session-a',
          availability: 'available',
          target: { kind: 'session', id: 'session-a' },
        })]));
      expect(surfaces.find((surface) => surface.id === 'artifacts')?.projectedRoutes)
        .toEqual(expect.arrayContaining([expect.objectContaining({ path: '/artifacts/session-a', availability: 'available' })]));

      const root = await fetch(url);
      expect(root.status).toBe(200);
      expect(root.url).toBe(`${url}/console/agents`);
      await server.stop();
    });

    it('attaches to a matching healthy stable server without owning its lifecycle', async () => {
      const owner = await createConsoleServer({ port: 0, host: '127.0.0.1', ingressMode: 'router' });
      const ownerUrl = await owner.start();
      const port = Number(new URL(ownerUrl).port);

      const ensured = await ensureConsoleServer({ port, host: '127.0.0.1', ingressMode: 'router' });
      expect(ensured.ownership).toBe('attached');
      expect(ensured.url).toBe(ownerUrl);
      await ensured.server.stop();
      expect(owner.isRunning()).toBe(true);
      await owner.stop();
    });

    it('refuses a stable port owned by a foreign server', async () => {
      const foreign = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('foreign');
      });
      await new Promise<void>((resolve, reject) => {
        foreign.once('error', reject);
        foreign.listen(0, '127.0.0.1', () => resolve());
      });
      const address = foreign.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      await expect(ensureConsoleServer({ port, host: '127.0.0.1', ingressMode: 'router' }))
        .rejects.toThrow(`operator_console_port_occupied:${port}`);
      await new Promise<void>((resolve, reject) => foreign.close((error) => error ? reject(error) : resolve()));
    });
  });

  describe('Operator Workspace ingress', () => {
    it('serves a site-aware surface directory and does not mount the diagnostic Workbench', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();

      const root = await fetch(url);
      const rootHtml = await root.text();
      expect(root.status, rootHtml).toBe(200);
      expect(root.headers.get('content-type')).toContain('text/html');
      expect(rootHtml).toContain('Operator Workspace');
      expect(rootHtml).toContain('data-narada-surface="operator-workspace"');
      expect(rootHtml).toContain('Direct diagnostic host');
      expect(rootHtml).toContain('<h2>Available</h2>');
      expect(rootHtml).toContain('class="status available"');
      expect(rootHtml).toContain('data-surface-id="site-registry"');
      expect(rootHtml).toContain('data-surface-id="site-operations"');
      expect(rootHtml).toContain('data-surface-id="agent-sessions"');
      expect(rootHtml).toContain('<h2>Not available yet</h2>');
      expect(rootHtml).toContain('class="surface planned"');
      expect(rootHtml).toContain('Select a Site in Site Registry');
      expect(rootHtml).not.toContain('href="/sites/');
      expect(rootHtml).not.toContain('data-surface-id="workbench"');
      expect(rootHtml).not.toContain('href="/workbench"');

      const workbench = await fetch(`${url}/workbench`);
      expect(workbench.status).toBe(404);
      await server.stop();
    });
  });

  describe('GET /console/sites', () => {
    it('returns empty array when no sites are registered', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites`);
      expect(status).toBe(200);
      expect((body as { sites: unknown[] }).sites).toEqual([]);
      await server.stop();
    });

    it('returns registered sites', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
              { site_id: 'cf-live', variant: 'cloudflare', site_root: '', substrate: 'cloudflare', aim_json: null, control_endpoint: 'https://cf.example.com', last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites`);
      expect(status).toBe(200);
      const sites = (body as { sites: Array<{ site_id: string }> }).sites;
      expect(sites.length).toBe(2);
      expect(sites[0]!.siteId).toBe('site-a');
      await server.stop();
    });
  });

  describe('GET /console/sites/:site_id', () => {
    it('returns site metadata and health', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites/site-a`);
      expect(status).toBe(200);
      const data = body as { site: { site_id: string }; health: { status: string } };
      expect(data.site.siteId).toBe('site-a');
      expect(data.health.status).toBe('healthy');
      await server.stop();
    });

    it('returns 404 for unknown site', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites/unknown`);
      expect(status).toBe(404);
      expect((body as { error: string }).error).toContain('Site not found');
      await server.stop();
    });
  });

  describe('GET /console/health', () => {
    it('aggregates health across registered sites', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
              { site_id: 'site-b', variant: 'native', site_root: 'C:\\b', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/health`);
      expect(status).toBe(200);
      const summary = (body as { summary: { total_sites: number; healthy: number } }).summary;
      expect(summary.total_sites).toBe(2);
      expect(summary.healthy).toBe(2);
      await server.stop();
    });
  });

  describe('GET /console/attention', () => {
    it('returns attention queue with live observations', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/attention`);
      expect(status).toBe(200);
      const items = (body as { items: Array<{ item_type: string }> }).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((i) => i.item_type === 'stuck_work_item')).toBe(true);
      await server.stop();
    });
  });

  describe('GET /console/sites/:site_id/logs', () => {
    it('returns bounded audit log for a site', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-x', variant: 'wsl', site_root: '/tmp/x', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() =>
              ({ site_id: 'site-x', variant: 'wsl', site_root: '/tmp/x', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => [
              { request_id: 'req-1', site_id: 'site-x', action_type: 'approve', target_id: 'out-1', routed_at: '2026-04-20T11:00:00Z', site_response_status: 'accepted', site_response_detail: null },
            ]),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites/site-x/logs`);
      expect(status).toBe(200);
      const logs = (body as { site_id: string; logs: unknown[] }).logs;
      expect(logs.length).toBe(1);
      await server.stop();
    });

    it('returns 404 for unknown site', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status } = await httpGet(`${url}/console/sites/unknown/logs`);
      expect(status).toBe(404);
      await server.stop();
    });
  });

  describe('GET /console/sites/:site_id/traces', () => {
    it('returns empty traces with note for v0', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() =>
              ({ site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites/site-a/traces`);
      expect(status).toBe(200);
      const data = body as { traces: unknown[]; note: string };
      expect(data.traces).toEqual([]);
      expect(data.note).toContain('v0');
      await server.stop();
    });
  });

  describe('GET /console/sites/:site_id/cycles', () => {
    it('returns empty cycles with note for v0', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() =>
              ({ site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/console/sites/site-a/cycles`);
      expect(status).toBe(200);
      const data = body as { cycles: unknown[]; note: string };
      expect(data.cycles).toEqual([]);
      expect(data.note).toContain('v0');
      await server.stop();
    });
  });

  describe('POST /console/sites/:site_id/control', () => {
    it('routes control request through ControlRequestRouter', async () => {
      mockControlClient.executeControlRequest.mockResolvedValue({
        success: true,
        status: 'accepted' as const,
        detail: 'Approved',
      });

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-live', variant: 'wsl', site_root: '/tmp/live', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/console/sites/site-live/control`, {
        action_type: 'approve',
        target_id: 'out-1',
        target_kind: 'outbound_command',
      });
      expect(status).toBe(200);
      expect((body as { success: boolean }).success).toBe(true);
      expect(mockControlClient.executeControlRequest).toHaveBeenCalled();
      await server.stop();
    });

    it('returns 404 for unknown site', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/console/sites/unknown/control`, {
        action_type: 'approve',
        target_id: 'out-1',
      });
      expect(status).toBe(404);
      expect((body as { error: string }).error).toContain('Site not found');
      await server.stop();
    });

    it('returns 400 for invalid JSON', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-live', variant: 'wsl', site_root: '/tmp/live', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();

      const response = await fetch(`${url}/console/sites/site-live/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(response.status).toBe(400);
      await server.stop();
    });

    it('returns 400 for missing action_type', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-live', variant: 'wsl', site_root: '/tmp/live', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/console/sites/site-live/control`, {
        target_id: 'out-1',
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('action_type');
      await server.stop();
    });

    it('returns 502 when no control client is available', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-no-client', variant: 'cloudflare', site_root: '/tmp/x', substrate: 'cloudflare', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/console/sites/site-no-client/control`, {
        action_type: 'approve',
        target_id: 'out-1',
      });
      expect(status).toBe(502);
      expect((body as { detail?: string }).detail).toContain('No control client available');
      await server.stop();
    });

    it('audits the routed request', async () => {
      mockControlClient.executeControlRequest.mockResolvedValue({
        success: false,
        status: 'error' as const,
        detail: 'DB error',
      });

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-x', variant: 'wsl', site_root: '/tmp/x', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        if (sql.includes('registry_audit_log')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status } = await httpPost(`${url}/console/sites/site-x/control`, {
        action_type: 'retry',
        target_id: 'wi-1',
        target_kind: 'work_item',
      });
      // Audit is logged regardless of client result; status reflects Site response
      expect(status).toBe(502);
      await server.stop();
    });
  });

  describe('first-use onboarding projection', () => {
    it('serves the CLI-owned page, requires confirmation, and redacts launch internals', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();

      const page = await fetch(`${url}/console/onboarding`);
      const pageBody = await page.text();
      expect(page.status, pageBody).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(pageBody).toContain('<div id="app"></div>');

      const status = await httpGet(`${url}/console/onboarding/api/status`);
      expect(status.status).toBe(200);
      expect((status.body as { schema: string }).schema).toBe('narada.operator_console.onboarding.v1');
      expect((status.body as { ui_state: string }).ui_state).toBe('ready');
      expect((status.body as { onboarding: { launch: unknown } }).onboarding.launch).toBeNull();

      const unconfirmed = await httpPost(`${url}/console/onboarding/api/start`, { mode: 'live' });
      expect(unconfirmed.status).toBe(400);
      expect((unconfirmed.body as { error: string }).error).toBe('confirmed_onboarding_action_required');
      expect(onboardingStartCommandMock).not.toHaveBeenCalled();

      const started = await httpPost(`${url}/console/onboarding/api/start`, { mode: 'live', confirm: true });
      expect(started.status).toBe(200);
      expect((started.body as { ui_state: string }).ui_state).toBe('starting');
      expect((started.body as { onboarding: { launch: unknown } }).onboarding.launch).toBeNull();
      expect(doctorCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({ bootstrap: true, format: 'json' }),
        expect.anything(),
      );
      expect(onboardingStartCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'windows', scope: 'user-site', demo: false, interactive: false, noExec: false, format: 'json' }),
        expect.anything(),
      );

      onboardingStartCommandMock.mockResolvedValueOnce({
        exitCode: 0,
        result: {
          schema: 'narada.onboarding.start.v1',
          status: 'demo_available',
          next_action: 'Open the demo session.',
          launch: { command: ['secret-demo-process-detail'] },
        },
      });
      const demo = await httpPost(`${url}/console/onboarding/api/start`, { mode: 'demo', confirm: true });
      expect(demo.status).toBe(200);
      expect((demo.body as { onboarding: { launch: unknown } }).onboarding.launch).toBeNull();
      expect(onboardingStartCommandMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ platform: 'windows', scope: 'user-site', demo: true, interactive: false, noExec: false, format: 'json' }),
        expect.anything(),
      );

      await server.stop();
    });
  });

  describe('canonical Site Registry browser projection', () => {
    it('serves the read-only page and delegates list, detail, and dry-run discovery through the registry read model', async () => {
      const registryReadModel = {
        list: vi.fn(async () => ({
          exitCode: 0,
          result: {
            schema: 'narada.site_registry.management.v0',
            status: 'success',
            operation: 'list',
            mutation_performed: false,
            count: 1,
            sites: [{
              site_id: 'site-a',
              site_root: 'D:/code/site-a',
              variant: 'native',
              substrate: 'windows',
              lifecycle_status: 'active',
              observation_status: 'present',
              sources: [{ kind: 'manual', ref: 'test', observed_at: '2026-07-10T00:00:00Z' }],
              aliases: [{ value: 'site-alias', source: 'legacy' }],
              revision: 3,
            }],
          },
        })),
        show: vi.fn(async (reference: string) => ({
          exitCode: 0,
          result: {
            schema: 'narada.site_registry.management.v0',
            status: 'success',
            operation: 'show',
            mutation_performed: false,
            site_id: 'site-a',
            site: { site_id: 'site-a', aliases: [{ value: 'site-alias', source: 'legacy' }] },
            conflicts: [],
            next_actions: ['edit', 'retire'],
            requested_reference: reference,
          },
        })),
        discoverPlan: vi.fn(async (options: unknown) => ({
          exitCode: 0,
          result: {
            schema: 'narada.site_registry.management.v0',
            status: 'planned',
            operation: 'discover',
            mutation_performed: false,
            options,
          },
        })),
      };
      const registryMutationGateway = {
        plan: vi.fn(async (input: unknown) => ({ exitCode: 0, result: { status: 'planned', operation: 'retire', mutation_performed: false, before: { revision: 4 }, input } })),
        apply: vi.fn(async (input: unknown) => ({ exitCode: 0, result: { status: 'applied', operation: 'retire', mutation_performed: true, input } })),
      };
      const siteAgentOverview = {
        read: vi.fn(async () => ({
          schema: 'narada.operator_console.site_agent_overview.v1' as const,
          status: 'success' as const,
          generated_at: '2026-07-18T00:00:00.000Z',
          groups: [],
          refusals: [],
        })),
      };
      const siteAgentLaunch = {
        launch: vi.fn(async ({ siteId, agentId }: { siteId: string; agentId: string }) => ({
          schema: 'narada.operator_console.agent_launch.v1' as const,
          status: 'launched' as const,
          site_id: siteId,
          agent_id: agentId,
          session_id: 'session-new',
          reason: null,
        })),
      };
      const server = await createConsoleServer({
        port: 0,
        host: '127.0.0.1',
        registryReadModel,
        registryMutationGateway,
        siteAgentOverview,
        siteAgentLaunch,
      });
      const url = await server.start();

      const page = await fetch(`${url}/console/registry`);
      const pageBody = await page.text();
      expect(page.status, pageBody).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      const pageHtml = pageBody;
      expect(pageHtml).toContain('<div id="app"></div>');
      expect(pageHtml).toContain('Operator Console - Sites');
      expect(pageHtml).toContain('/console/assets/');
      expect(pageHtml).not.toContain('href="/workbench"');

      const assetMatch = pageHtml.match(/src="([^"]+\.js)"/);
      expect(assetMatch).not.toBeNull();
      const asset = await fetch(`${url}${assetMatch?.[1] ?? ''}`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('text/javascript');
      const assetBody = await asset.text();
      expect(assetBody.length).toBeGreaterThan(0);

      const addPage = await fetch(`${url}/console/registry/add`);
      const addHtml = await addPage.text();
      expect(addPage.status, addHtml).toBe(200);
      expect(addHtml).toContain('<div id="app"></div>');
      expect(addHtml).toContain('/console/assets/');

      const managePage = await fetch(`${url}/console/registry/manage`);
      const manageHtml = await managePage.text();
      expect(managePage.status, manageHtml).toBe(200);
      expect(manageHtml).toContain('<div id="app"></div>');
      expect(manageHtml).toContain('/console/assets/');

      const launcherPage = await fetch(`${url}/console/launch`);
      const launcherHtml = await launcherPage.text();
      expect(launcherPage.status, launcherHtml).toBe(200);
      expect(launcherHtml).toContain('<div id="app"></div>');
      expect(launcherHtml).toContain('/console/assets/');

      const sessionsPage = await fetch(`${url}/console/sessions`);
      const sessionsHtml = await sessionsPage.text();
      expect(sessionsPage.status, sessionsHtml).toBe(200);
      expect(sessionsHtml).toContain('<div id="app"></div>');

      const agentsPage = await fetch(`${url}/console/agents`);
      expect(agentsPage.status).toBe(200);
      expect(await agentsPage.text()).toContain('<div id="app"></div>');

      const neutralConsole = await fetch(`${url}/console`, { redirect: 'manual' });
      expect(neutralConsole.status).toBe(302);
      expect(neutralConsole.headers.get('location')).toBe('/console/agents');

      for (const pagePath of ['/console/agents', '/console/registry', '/console/registry/add', '/console/registry/manage', '/console/launch', '/console/sessions']) {
        const trailingSlashPage = await fetch(`${url}${pagePath}/`);
        expect(trailingSlashPage.status, `${pagePath}/ should be accepted`).toBe(200);
      }

      const sessionList = await httpGet(`${url}/console/sessions/api/sessions`);
      expect(sessionList.status).toBe(200);
      expect((sessionList.body as { schema: string; status: string }).schema).toBe('narada.operator_console.agent_sessions.v1');
      expect((sessionList.body as { status: string }).status).toBe('success');

      const agentOverview = await httpGet(`${url}/console/agents/api/overview`);
      expect(agentOverview.status).toBe(200);
      expect((agentOverview.body as { schema: string }).schema).toBe('narada.operator_console.site_agent_overview.v1');

      const agentLaunch = await httpPost(`${url}/console/agents/api/launch`, {
        site_id: 'sonar',
        agent_id: 'sonar.resident',
      });
      expect(agentLaunch.status).toBe(200);
      expect((agentLaunch.body as { session_id: string }).session_id).toBe('session-new');
      expect(siteAgentLaunch.launch).toHaveBeenCalledWith({ siteId: 'sonar', agentId: 'sonar.resident' });

      const unknownRoute = await fetch(`${url}/console/not-found`);
      expect(unknownRoute.status).toBe(404);

      const list = await httpGet(`${url}/console/registry/api/sites`);
      expect(list.status).toBe(200);
      expect((list.body as { sites: Array<{ site_id: string }> }).sites[0]?.site_id).toBe('site-a');
      expect(registryReadModel.list).toHaveBeenCalledTimes(2);

      const detail = await httpGet(`${url}/console/registry/api/sites/site-alias`);
      expect(detail.status).toBe(200);
      expect(registryReadModel.show).toHaveBeenCalledWith('site-alias');

      const discovery = await httpGet(`${url}/console/registry/api/discover-plan?source=filesystem&root=D%3A%2Fcode&actor=operator`);
      expect(discovery.status).toBe(200);
      expect(registryReadModel.discoverPlan).toHaveBeenCalledWith({ source: 'filesystem', root: 'D:/code', actor: 'operator' });
      expect((discovery.body as { mutation_performed: boolean }).mutation_performed).toBe(false);

      const previewResponse = await httpPost(`${url}/console/registry/api/operations/plan`, {
        operation: 'retire',
        reference: 'site-a',
        reason: 'duplicate',
        expected_revision: 4,
      });
      expect(previewResponse.status).toBe(200);
      expect((previewResponse.body as { mutation_performed: boolean }).mutation_performed).toBe(false);
      expect(registryMutationGateway.plan).toHaveBeenCalledWith({ operation: 'retire', reference: 'site-a', reason: 'duplicate', reAdmit: false, expectedRevision: 4 });

      const clearPreviewResponse = await httpPost(`${url}/console/registry/api/operations/plan`, {
        operation: 'edit',
        reference: 'site-a',
        reason: 'remove obsolete metadata',
        clear_aim_json: true,
        clear_control_endpoint: true,
        clear_aliases: true,
      });
      expect(clearPreviewResponse.status).toBe(200);
      expect(registryMutationGateway.plan).toHaveBeenCalledWith({
        operation: 'edit',
        reference: 'site-a',
        reason: 'remove obsolete metadata',
        reAdmit: false,
        clearAimJson: true,
        clearControlEndpoint: true,
        clearAliases: true,
      });

      const unconfirmedApply = await httpPost(`${url}/console/registry/api/operations/apply`, {
        operation: 'retire',
        reference: 'site-a',
        reason: 'duplicate',
      });
      expect(unconfirmedApply.status).toBe(400);
      expect(registryMutationGateway.apply).not.toHaveBeenCalled();

      const applyResponse = await httpPost(`${url}/console/registry/api/operations/apply`, {
        operation: 'retire',
        reference: 'site-a',
        reason: 'duplicate',
        expected_revision: 4,
        confirm_apply: true,
      });
      expect(applyResponse.status).toBe(200);
      expect((applyResponse.body as { mutation_performed: boolean }).mutation_performed).toBe(true);
      expect(registryMutationGateway.apply).toHaveBeenCalledWith({ operation: 'retire', reference: 'site-a', reason: 'duplicate', reAdmit: false, expectedRevision: 4 });
      const invalidDiscovery = await httpGet(`${url}/console/registry/api/discover-plan?source=invalid`);
      expect(invalidDiscovery.status).toBe(400);
      expect(registryReadModel.discoverPlan).toHaveBeenCalledTimes(1);
      await server.stop();
    });
  });
  describe('per-site launch route', () => {
    it('defaults to dry-run and forwards an explicit apply request', async () => {
      sitesLaunchCommandMock.mockImplementation(async (options: { siteId: string; dryRun: boolean }) => ({
        exitCode: 0,
        result: {
          schema: 'narada.sites.launch.result.v0',
          status: options.dryRun ? 'dry_run' : 'ok',
          dry_run: options.dryRun,
          mutation_performed: !options.dryRun,
          site_id: options.siteId,
          site_root: '/tmp/site-a',
          checks: [],
          actions: [],
          console_url: 'http://127.0.0.1:61729/console/registry',
        },
      }));
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      try {
        const url = await server.start();

        const planned = await httpPost(`${url}/console/registry/api/sites/site-a/launch`, {});
        expect(planned.status).toBe(200);
        expect((planned.body as { status: string }).status).toBe('dry_run');
        expect(sitesLaunchCommandMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ siteId: 'site-a', dryRun: true, format: 'json' }),
          expect.anything(),
        );

        const applied = await httpPost(`${url}/console/registry/api/sites/site-a/launch`, { dry_run: false });
        expect(applied.status).toBe(200);
        expect((applied.body as { status: string }).status).toBe('ok');
        expect(sitesLaunchCommandMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ siteId: 'site-a', dryRun: false, format: 'json' }),
          expect.anything(),
        );

        // An unparseable body fails safe: treated as a dry-run plan request.
        const response = await fetch(`${url}/console/registry/api/sites/site-a/launch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{not json',
        });
        expect(response.status).toBe(200);
        expect(sitesLaunchCommandMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ siteId: 'site-a', dryRun: true }),
          expect.anything(),
        );
      } finally {
        await server.stop();
      }
    });

    it('maps a failed ensure onto a 400 with the command result', async () => {
      sitesLaunchCommandMock.mockResolvedValue({
        exitCode: 1,
        result: {
          schema: 'narada.sites.launch.result.v0',
          status: 'failed',
          dry_run: false,
          mutation_performed: true,
          site_id: 'site-a',
          site_root: '/tmp/site-a',
          checks: [{ id: 'resident_ensure', status: 'fail', summary: 'boom' }],
          actions: [],
          console_url: 'http://127.0.0.1:61729/console/registry',
        },
      });
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      try {
        const url = await server.start();
        const failed = await httpPost(`${url}/console/registry/api/sites/site-a/launch`, { dry_run: false });
        expect(failed.status).toBe(400);
        expect((failed.body as { status: string }).status).toBe('failed');
        expect((failed.body as { mutation_performed: boolean }).mutation_performed).toBe(true);
      } finally {
        await server.stop();
      }
    });
  });
  describe('CORS and safety', () => {
    it('allows localhost origin', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const response = await fetch(`${url}/console/sites`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      await server.stop();
    });

    it('allows 127.0.0.1 origin', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const response = await fetch(`${url}/console/sites`, {
        headers: { Origin: 'http://127.0.0.1:3000' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:3000');
      await server.stop();
    });

    it('rejects non-localhost origin', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const response = await fetch(`${url}/console/sites`, {
        headers: { Origin: 'https://evil.com' },
      });
      expect(response.status).toBe(403);
      await server.stop();
    });

    it('rejects GET on control path', async () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => []),
            get: vi.fn(() =>
              ({ site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' }),
            ),
            run: vi.fn(() => ({ changes: 0 })),
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: vi.fn(() => ({ changes: 0 })) };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const { status } = await httpGet(`${url}/console/sites/site-a/control`);
      expect(status).toBe(405);
      await server.stop();
    });

    it('rejects POST on observation path', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      const response = await fetch(`${url}/console/sites`, { method: 'POST' });
      expect(response.status).toBe(405);
      await server.stop();
    });
  });

  describe('read-only guarantee', () => {
    it('GET /console/sites does not mutate registry', async () => {
      const runSpy = vi.fn(() => ({ changes: 0 }));
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('site_registry')) {
          return {
            all: vi.fn(() => [
              { site_id: 'site-a', variant: 'wsl', site_root: '/tmp/a', substrate: 'windows', aim_json: null, control_endpoint: null, last_seen_at: null, created_at: '2026-04-20T10:00:00Z' },
            ]),
            get: vi.fn(() => null),
            run: runSpy,
          };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null), run: runSpy };
      });

      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      await httpGet(`${url}/console/sites`);
      await httpGet(`${url}/console/health`);
      await httpGet(`${url}/console/attention`);
      await httpGet(`${url}/console/sites/site-a/logs`);
      await httpGet(`${url}/console/sites/site-a/traces`);
      await httpGet(`${url}/console/sites/site-a/cycles`);
      await httpGet(`${url}/console/audit`);

      // No INSERT/UPDATE/DELETE calls on GET routes
      const mutationCalls = runSpy.mock.calls.filter(([sql]: [string]) =>
        /INSERT|UPDATE|DELETE/i.test(sql)
      );
      expect(mutationCalls).toHaveLength(0);
      await server.stop();
    });
  });
});
