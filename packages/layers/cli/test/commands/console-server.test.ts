import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createConsoleServer } from '../../src/commands/console-server.js';

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
  });

  describe('lifecycle', () => {
    it('starts and stops cleanly', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      const url = await server.start();
      expect(url).toContain('http://127.0.0.1:');
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('throws when started twice', async () => {
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
      await server.start();
      await expect(server.start()).rejects.toThrow('already started');
      await server.stop();
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
      const server = await createConsoleServer({ port: 0, host: '127.0.0.1', registryReadModel, registryMutationGateway });
      const url = await server.start();

      const page = await fetch(`${url}/console/registry`);
      const pageBody = await page.text();
      expect(page.status, pageBody).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      const pageHtml = pageBody;
      expect(pageHtml).toContain('<div id="app"></div>');
      expect(pageHtml).toContain('Operator Console - Sites');
      expect(pageHtml).toContain('/console/registry/assets/');
      expect(pageHtml).not.toContain('href="/workbench"');

      const assetMatch = pageHtml.match(/src="([^"]+\.js)"/);
      expect(assetMatch).not.toBeNull();
      const asset = await fetch(`${url}${assetMatch?.[1] ?? ''}`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('text/javascript');
      const assetBody = await asset.text();
      expect(assetBody).toContain('/console/registry/add');
      expect(assetBody).toContain('/console/registry/api');

      const addPage = await fetch(`${url}/console/registry/add`);
      const addHtml = await addPage.text();
      expect(addPage.status, addHtml).toBe(200);
      expect(addHtml).toContain('<div id="app"></div>');
      expect(addHtml).toContain('/console/registry/assets/');

      const managePage = await fetch(`${url}/console/registry/manage`);
      const manageHtml = await managePage.text();
      expect(managePage.status, manageHtml).toBe(200);
      expect(manageHtml).toContain('<div id="app"></div>');
      expect(manageHtml).toContain('/console/registry/assets/');

      const launcherPage = await fetch(`${url}/console/launch`);
      const launcherHtml = await launcherPage.text();
      expect(launcherPage.status, launcherHtml).toBe(200);
      expect(launcherHtml).toContain('<div id="app"></div>');
      expect(launcherHtml).toContain('/console/registry/assets/');

      const launcherSessions = await httpGet(`${url}/console/launch/api/sessions`);
      expect(launcherSessions.status).toBe(200);
      expect((launcherSessions.body as { schema: string; sessions: unknown[] }).schema).toBe('narada.workspace_launch.ui_session_list.v1');
      expect(Array.isArray((launcherSessions.body as { sessions: unknown[] }).sessions)).toBe(true);

      const unknownRoute = await fetch(`${url}/console/not-found`);
      expect(unknownRoute.status).toBe(404);

      const list = await httpGet(`${url}/console/registry/api/sites`);
      expect(list.status).toBe(200);
      expect((list.body as { sites: Array<{ site_id: string }> }).sites[0]?.site_id).toBe('site-a');
      expect(registryReadModel.list).toHaveBeenCalledOnce();

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
