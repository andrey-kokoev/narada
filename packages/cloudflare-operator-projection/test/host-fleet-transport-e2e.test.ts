import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  OPERATOR_CONSOLE_FLEET_OBSERVATIONS_API_PATH,
  projectOperatorWorkspaceRouteDirectory,
} from '@narada-core/operator-console-contract';
import {
  HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
  HostFleetAuthority,
  createHostFleetPublisher,
  validateHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from '../../host-fleet-runtime/src/index.ts';
import { createOperatorConsoleRemoteGateway } from '../../operator-console-remote-gateway/src/index.ts';
import { createOperatorRouterServer, registerOperatorRoute } from '../../operator-router/src/index.ts';
import { createCloudflareNarsProjectionWorker } from '../src/worker.js';

const TEST_SECRET = 'cloudflare-host-fleet-transport-secret-with-more-than-32-bytes';
const BRIDGE_TOKEN = 'cloudflare-host-fleet-transport-bridge-token';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server | null): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function availablePort(): Promise<number> {
  const server = createServer();
  const url = await listen(server);
  await close(server);
  return Number(new URL(url).port);
}

function authorityConfig(secretPath: string, port: number): HostFleetRuntimeConfig {
  return validateHostFleetRuntimeConfig({
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'authority',
    fleet_id: 'cloudflare-transport-e2e',
    host_id: 'desktop',
    authority_host_id: 'desktop',
    ingress_url: null,
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port },
    credentials: {
      active: { key_id: 'e2e-active', file: secretPath, accept_until: null },
      previous: null,
    },
    heartbeat: {
      interval_ms: 15_000,
      stale_after_ms: 45_000,
      max_clock_skew_ms: 60_000,
      max_body_bytes: 4_096,
    },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [
      {
        host_id: 'desktop',
        display_name: 'Desktop E2E authority',
        platform: 'windows',
        operator_console_url: null,
        operator_console_health_url: null,
      },
      {
        host_id: 'zima',
        display_name: 'Zima E2E publisher',
        platform: 'linux',
        operator_console_url: null,
        operator_console_health_url: null,
      },
    ],
  });
}

describe('Cloudflare Host Fleet transport', () => {
  test('admits a signed publisher heartbeat through Worker, gateway, router, and authority', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-cloudflare-host-fleet-transport-'));
    const secretPath = join(root, 'membership.secret');
    await writeFile(secretPath, TEST_SECRET, { encoding: 'utf8', mode: 0o600 });

    let upstream: Server | null = null;
    let router: Awaited<ReturnType<typeof createOperatorRouterServer>> | null = null;
    let gateway: ReturnType<typeof createOperatorConsoleRemoteGateway> | null = null;
    let authority: HostFleetAuthority | null = null;
    let authorityServer: { stop(): Promise<void> } | null = null;
    const upstreamPaths: string[] = [];
    try {
      const authorityConfigValue = authorityConfig(secretPath, await availablePort());
      authority = new HostFleetAuthority({
        config: authorityConfigValue,
        state_path: join(root, 'authority.sqlite'),
      });
      authorityServer = await authority.start();

      const routeParity = {
        schema: 'narada.operator_console.http_route_parity.v1',
        status: 'complete',
        source: 'local_operator_console_route_table',
        generatedAt: new Date().toISOString(),
        routes: [
          {
            routeId: 'operator-console.workspace-route-directory',
            method: 'GET',
            protocol: 'http',
            pattern: '^\\/console\\/routes\\/?$',
            disposition: 'proxy',
            kind: 'observation',
            intentKind: null,
          },
          {
            routeId: 'host-fleet-observation-admit',
            method: 'POST',
            protocol: 'http',
            pattern: '^\\/console\\/fleet\\/api\\/observations$',
            disposition: 'proxy',
            kind: 'intent',
            intentKind: 'host_fleet_observation_admit',
          },
        ],
      };

      upstream = createServer(async (request, response) => {
        upstreamPaths.push(request.url ?? '/');
        if (request.method === 'GET' && request.url === '/health') {
          json(response, 200, { status: 'healthy' });
          return;
        }
        if (request.method === 'GET' && request.url === '/routes') {
          json(response, 200, {
            ...projectOperatorWorkspaceRouteDirectory({
              workspaceHost: { kind: 'local', id: 'host-fleet-e2e', origin: null },
            }),
            httpRouteParity: routeParity,
          });
          return;
        }
        if (request.method === 'POST' && request.url === '/fleet/api/observations') {
          try {
            const result = authority!.admit(await readBody(request), request.headers);
            json(response, 202, {
              schema: 'narada.host_fleet.admission_result.v1',
              status: 'accepted',
              ...result,
            });
          } catch (error) {
            json(response, 401, {
              status: 'refused',
              code: error instanceof Error ? error.message : 'host_fleet_admission_failed',
            });
          }
          return;
        }
        json(response, 404, { status: 'refused', code: 'test_route_not_found' });
      });
      const upstreamUrl = await listen(upstream);

      router = await createOperatorRouterServer({
        host: '127.0.0.1',
        port: 0,
        state_root: join(root, 'router-state'),
        health_interval_ms: 60_000,
      });
      const routerUrl = await router.start();
      await registerOperatorRoute(
        { url: routerUrl, registration_token: router.getRegistrationToken() },
        {
          route_id: 'host-fleet-console-e2e',
          route_class: 'agent-web-ui',
          public_path: '/console',
          target_url: upstreamUrl,
          health_url: `${upstreamUrl}/health`,
          owner_id: 'host-fleet-e2e',
          session_id: 'host-fleet-transport-e2e',
          process_evidence: {
            instance_nonce: 'host-fleet-transport-e2e-instance',
            pid: null,
            started_at: new Date().toISOString(),
          },
          methods: ['GET', 'POST'],
          protocols: ['http'],
          lease_ms: 60_000,
        },
      );

      gateway = createOperatorConsoleRemoteGateway({
        router_url: routerUrl,
        router_token: router.getRegistrationToken(),
        bridge_token: BRIDGE_TOKEN,
        host: '127.0.0.1',
        port: 0,
      });
      const gatewayUrl = await gateway.start();
      const worker = createCloudflareNarsProjectionWorker({ require_operator_console_access: false });
      const env = {
        OPERATOR_CONSOLE_GATEWAY_URL: 'http://operator-console.internal',
        OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'http://operator-console.internal',
        OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'vpc-service',
        OPERATOR_CONSOLE_GATEWAY_TOKEN: BRIDGE_TOKEN,
        OPERATOR_CONSOLE_GATEWAY: {
          fetch: async (input: Request | string | URL, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(String(input), init);
            const source = new URL(request.url);
            const target = new URL(`${source.pathname}${source.search}`, gatewayUrl);
            return fetch(new Request(target, request));
          },
        },
      };

      let lastResponse: { status: number; body: Record<string, unknown> | null } | null = null;
      const publisherConfig = validateHostFleetRuntimeConfig({
        schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
        mode: 'publisher',
        fleet_id: authorityConfigValue.fleet_id,
        host_id: 'zima',
        authority_host_id: 'desktop',
        ingress_url: `https://cloudflare.e2e.test${OPERATOR_CONSOLE_FLEET_OBSERVATIONS_API_PATH}`,
        allow_insecure_ingress: false,
        local_health_url: null,
        listener: { host: '127.0.0.1', port: await availablePort() },
        credentials: {
          active: { key_id: 'e2e-active', file: secretPath, accept_until: null },
          previous: null,
        },
        heartbeat: {
          interval_ms: 15_000,
          stale_after_ms: 45_000,
          max_clock_skew_ms: 60_000,
          max_body_bytes: 4_096,
        },
        probe: { interval_ms: 15_000, timeout_ms: 3_000 },
        roster: [],
      });
      const publisher = createHostFleetPublisher({
        config: publisherConfig,
        fetch_fn: async (url, init) => {
          const response = await worker.fetch(new Request(url, init), env);
          const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
          lastResponse = { status: response.status, body };
          return response;
        },
      });

      await publisher.publish();
      expect(lastResponse).toMatchObject({
        status: 202,
        body: { status: 'accepted', host_id: 'zima' },
      });
      expect(upstreamUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect(upstreamPaths).toContain('/fleet/api/observations');
      const snapshot = authority.read().snapshot;
      const zima = snapshot?.hosts.find((host) => host.identity.host_id === 'zima');
      expect(zima?.reachability.publisher_freshness).toBe('fresh');
      expect(zima?.health.status).toBe('unknown');
      expect(zima?.health.detail).toBeNull();
    } finally {
      await gateway?.stop();
      await router?.stop();
      await authorityServer?.stop();
      await close(upstream);
      await rm(root, { recursive: true, force: true });
    }
  });
});
