import { describe, expect, it } from 'vitest';
import {
  handleCloudflareHostFleetRequest,
  projectCloudflareHostFleetOverview,
} from '../src/cloudflare-host-fleet.ts';
import { createCloudflareNarsProjectionWorker } from '../src/worker.ts';

const registry = JSON.stringify({
  schema: 'narada.cloudflare.host_fleet_registry.v1',
  revision: 4,
  hosts: [
    {
      host_id: 'desktop-sunroom-2',
      host_instance_id: 'desktop-instance',
      display_name: 'Desktop Sunroom 2',
      platform: 'windows',
      lifecycle_state: 'active',
      admitted_sites: ['sonar'],
      capabilities: ['sessions', 'events'],
      gateway: {
        transport: 'service-binding',
        binding: 'DESKTOP_GATEWAY',
        credential_binding: 'DESKTOP_TOKEN',
        admitted_paths: ['/health', '/console/sessions/api/sessions', '/sessions/*'],
      },
    },
    {
      host_id: 'zima-board-2',
      host_instance_id: 'zima-instance',
      display_name: 'ZimaBoard 2',
      platform: 'linux',
      lifecycle_state: 'active',
      admitted_sites: ['sonar'],
      capabilities: ['sessions', 'events'],
      gateway: {
        transport: 'service-binding',
        binding: 'ZIMA_GATEWAY',
        credential_binding: 'ZIMA_TOKEN',
        admitted_paths: ['/health', '/console/sessions/api/sessions', '/sessions/*'],
      },
    },
  ],
});

function sessionResponse(sessionId: string): Response {
  return new Response(JSON.stringify({
    schema: 'narada.operator_console.agent_sessions.v1',
    status: 'success',
    generated_at: '2026-07-31T12:00:00.000Z',
    count: 1,
    sessions: [{
      session_id: sessionId,
      site_id: 'sonar',
      agent_id: 'resident',
      display_state: 'active',
      health_status: 'healthy',
      started_at: '2026-07-31T11:59:00.000Z',
      last_seen_at: '2026-07-31T12:00:00.000Z',
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function environment() {
  const gateway = (hostId: string, expectedToken: string, sessionId: string) => ({
    fetch: async (input: Request | string | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.headers.get('x-narada-host-id')).toBe(hostId);
      expect(request.headers.get('x-narada-operator-console-bridge-token')).toBe(expectedToken);
      if (new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ schema: 'narada.operator_console_remote_gateway.health.v1', status: 'healthy' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return sessionResponse(sessionId);
    },
  });
  return {
    NARADA_HOST_FLEET_REGISTRY: registry,
    DESKTOP_TOKEN: 'desktop-secret',
    ZIMA_TOKEN: 'zima-secret',
    DESKTOP_GATEWAY: gateway('desktop-sunroom-2', 'desktop-secret', 'desktop-session'),
    ZIMA_GATEWAY: gateway('zima-board-2', 'zima-secret', 'zima-session'),
  };
}

type FakeWebSocketEvent = 'close' | 'error' | 'message';

class FakeWebSocket {
  readonly sent: unknown[] = [];
  readonly messages: unknown[] = [];
  peer: FakeWebSocket | null = null;
  accepted = false;
  closed = false;
  private readonly listeners = new Map<FakeWebSocketEvent, Array<(event: { data?: unknown }) => void>>();

  accept(): void {
    this.accepted = true;
  }

  addEventListener(type: FakeWebSocketEvent, handler: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  emit(type: FakeWebSocketEvent, event: { data?: unknown } = {}): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  send(data: unknown): void {
    this.sent.push(data);
    this.peer?.messages.push(data);
    this.peer?.emit('message', { data });
  }

  close(): void {
    this.closed = true;
  }
}

class FakeWebSocketPair {
  readonly 0: FakeWebSocket;
  readonly 1: FakeWebSocket;

  constructor() {
    const client = new FakeWebSocket();
    const server = new FakeWebSocket();
    client.peer = server;
    server.peer = client;
    this[0] = client;
    this[1] = server;
  }
}

async function withCloudflareWebSocketResponse(run: () => Promise<Response>): Promise<Response> {
  const globals = globalThis as typeof globalThis & { Response: typeof Response };
  const originalResponse = globals.Response;
  globals.Response = class extends originalResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
      if (init?.status === 101) {
        super(null, { ...init, status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        Object.defineProperty(this, 'webSocket', { value: init.webSocket });
        return;
      }
      super(body, init);
    }
  } as typeof Response;
  try {
    return await run();
  } finally {
    globals.Response = originalResponse;
  }
}

const now = () => '2026-07-31T12:00:00.000Z';

describe('Cloudflare Host Fleet projection', () => {
  it('projects qualified hosts without exposing gateway bindings or credentials', () => {
    const response = projectCloudflareHostFleetOverview(registry, now());
    expect(response.status).toBe('success');
    expect(response.count).toBe(2);
    expect(response.hosts.map((host) => `${host.host_id}@${host.host_instance_id}`)).toEqual([
      'desktop-sunroom-2@desktop-instance',
      'zima-board-2@zima-instance',
    ]);
    expect(JSON.stringify(response)).not.toContain('DESKTOP_GATEWAY');
    expect(JSON.stringify(response)).not.toContain('desktop-secret');
  });

  it('routes fleet inventory through the Cloudflare Worker boundary', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now });
    const response = await worker.fetch(
      new Request('https://fleet.example/api/narada/fleet/hosts'),
      environment(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schema: 'narada.cloudflare.host_fleet.overview.v1',
      status: 'success',
      count: 2,
    });
  });

  it('keeps session discovery and target resolution host-qualified', async () => {
    const env = environment();
    const sessions = await handleCloudflareHostFleetRequest(
      new Request('https://fleet.example/api/narada/fleet/hosts/zima-board-2/zima-instance/sessions'),
      env,
      now,
    );
    expect(sessions?.status).toBe(200);
    const sessionBody = await sessions!.json() as { count: number; sessions: Array<{ target: { host_id: string; runtime_session_id: string } }> };
    expect(sessionBody.count).toBe(1);
    expect(sessionBody.sessions[0]?.target.host_id).toBe('zima-board-2');
    expect(sessionBody.sessions[0]?.target.runtime_session_id).toBe('zima-session');

    const target = await handleCloudflareHostFleetRequest(
      new Request('https://fleet.example/api/narada/fleet/hosts/zima-board-2/zima-instance/target?site_id=sonar&agent_id=resident'),
      env,
      now,
    );
    expect(target?.status).toBe(200);
    const targetBody = await target!.json() as { status: string; target: { host_id: string; runtime_session_id: string } };
    expect(targetBody.status).toBe('resolved');
    expect(targetBody.target.host_id).toBe('zima-board-2');
    expect(targetBody.target.runtime_session_id).toBe('zima-session');

    const denied = await handleCloudflareHostFleetRequest(
      new Request('https://fleet.example/api/narada/fleet/hosts/zima-board-2/zima-instance/target?site_id=other-site&agent_id=resident'),
      env,
      now,
    );
    expect(denied?.status).toBe(409);
    expect(await denied!.json()).toMatchObject({ status: 'refused', reason: 'host_site_not_admitted' });
  });

  it('refuses revoked hosts before touching their gateway binding', async () => {
    const revoked = JSON.stringify(JSON.parse(registry).hosts.map((host: Record<string, unknown>, index: number) => index === 1 ? { ...host, lifecycle_state: 'revoked' } : host));
    const env = { ...environment(), NARADA_HOST_FLEET_REGISTRY: JSON.stringify({ schema: 'narada.cloudflare.host_fleet_registry.v1', revision: 5, hosts: JSON.parse(revoked) }) };
    const response = await handleCloudflareHostFleetRequest(
      new Request('https://fleet.example/api/narada/fleet/hosts/zima-board-2/zima-instance/sessions'),
      env,
      now,
    );
    expect(response?.status).toBe(409);
    expect(await response!.json()).toMatchObject({ status: 'refused', reason: 'host_revoked' });
  });

  it('relays the exact host session WebSocket in both directions', async () => {
    const env = environment();
    let upstreamSocket: FakeWebSocket | null = null;
    const previousPair = (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;
    const runtimeGlobal = globalThis as typeof globalThis & { WebSocketPair?: typeof FakeWebSocketPair };
    runtimeGlobal.WebSocketPair = FakeWebSocketPair;
    env.ZIMA_GATEWAY = {
      fetch: async (input: Request | string | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/sessions/zima-session/events') {
          expect(request.headers.get('connection')).toBe('Upgrade');
          expect(request.headers.get('upgrade')).toBe('websocket');
          expect(request.headers.get('sec-websocket-key')).toBe('fleet-test-key');
          expect(request.headers.get('sec-websocket-version')).toBe('13');
          expect(request.headers.get('x-narada-host-id')).toBe('zima-board-2');
          expect(request.headers.get('x-narada-host-instance-id')).toBe('zima-instance');
          expect(request.headers.get('x-narada-operator-console-bridge-token')).toBe('zima-secret');
          upstreamSocket = new FakeWebSocket();
          return { status: 101, webSocket: upstreamSocket } as unknown as Response;
        }
        return sessionResponse('zima-session');
      },
    };
    try {
      const response = await withCloudflareWebSocketResponse(() => handleCloudflareHostFleetRequest(
        new Request('https://fleet.example/api/narada/fleet/hosts/zima-board-2/zima-instance/sessions/zima-session/events?site_id=sonar&agent_id=resident', {
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            'Sec-WebSocket-Key': 'fleet-test-key',
            'Sec-WebSocket-Version': '13',
          },
        }),
        env,
        now,
      ) as Promise<Response>);
      expect(response.status).toBe(101);
      const client = (response as Response & { webSocket: FakeWebSocket }).webSocket;
      expect(client.accepted).toBe(false);
      expect(upstreamSocket).not.toBeNull();

      client.send('operator-input');
      expect(upstreamSocket!.sent).toEqual(['operator-input']);
      upstreamSocket!.emit('message', { data: 'host-event' });
      expect(client.messages).toEqual(['host-event']);
    } finally {
      if (previousPair === undefined) delete runtimeGlobal.WebSocketPair;
      else runtimeGlobal.WebSocketPair = previousPair as typeof FakeWebSocketPair;
    }
  });
});
