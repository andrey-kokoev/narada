import { createServer, type Server } from 'node:http';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { projectOperatorWorkspaceRouteDirectory } from '@narada-core/operator-console-contract';
import { createCloudflareNarsProjectionWorker } from '../src/worker.js';

const bridgeToken = 'operator-console-bridge-token-012345';

class MockWebSocket {
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  readyState = 1;

  accept(): void {}

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const listener of this.listeners.get('close') ?? []) listener({});
  }

  dispatch(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

class MockWebSocketPair {
  0: MockWebSocket;
  1: MockWebSocket;

  constructor() {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
  return `http://127.0.0.1:${address.port}`;
}

describe('Cloudflare Operator Console mirror', () => {
  test('pins the gateway, forwards console APIs, and projects the local directory without leaking the bridge token', async () => {
    const seen: Array<{ path: string; bridge: string | undefined; body: string; contentLength: string | undefined }> = [];
    const gateway = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      seen.push({
        path: request.url ?? '/',
        bridge: request.headers['x-narada-operator-console-bridge-token'],
        body: Buffer.concat(chunks).toString('utf8'),
        contentLength: request.headers['content-length'],
      });
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'healthy', identity: 'narada.operator-console-remote-gateway' }));
        return;
      }
      if (request.url === '/console/routes') {
        response.writeHead(200, { 'content-type': 'application/json' });
        const directory = projectOperatorWorkspaceRouteDirectory({
          workspaceHost: { kind: 'local', id: 'operator-console', origin: null },
        });
        response.end(JSON.stringify({
          ...directory,
          httpRouteParity: {
            schema: 'narada.operator_console.http_route_parity.v1',
            status: 'complete',
            source: 'local_operator_console_route_table',
            generatedAt: new Date().toISOString(),
            routes: [
              {
                routeId: 'router.session-a.http.get',
                method: 'GET',
                protocol: 'http',
                pattern: '^\\/sessions\\/session-a(?:\\/.*)?$',
                disposition: 'proxy',
                kind: 'observation',
                intentKind: null,
              },
              {
                routeId: 'router.session-a.websocket.get',
                method: 'GET',
                protocol: 'websocket',
                pattern: '^\\/sessions\\/session-a\\/events$',
                disposition: 'proxy',
                kind: 'observation',
                intentKind: null,
              },
              {
                routeId: 'router.console-health.http.get',
                method: 'GET',
                protocol: 'http',
                pattern: '^\\/console\\/health$',
                disposition: 'proxy',
                kind: 'observation',
                intentKind: null,
              },
              {
                routeId: 'router.console-registry-sites.http.get',
                method: 'GET',
                protocol: 'http',
                pattern: '^\\/console\\/registry\\/api\\/sites$',
                disposition: 'proxy',
                kind: 'observation',
                intentKind: null,
              },
              {
                routeId: 'router.console-registry-plan.http.post',
                method: 'POST',
                protocol: 'http',
                pattern: '^\\/console\\/registry\\/api\\/operations\\/plan$',
                disposition: 'proxy',
                kind: 'mutation',
                intentKind: 'registry-plan',
              },
            ],
          },
        }));
        return;
      }
      if (request.url === '/console/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok', path: request.url, siteRoot: 'C:\\ProgramData\\Narada\\sites\\private' }));
        return;
      }
      if (request.url === '/sessions/session-a') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<script type="application/json" id="nars-config">{"eventEndpoint":"ws://127.0.0.1:61729/sessions/session-a/events","healthEndpoint":"/sessions/session-a/api/health"}</script>');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', method: request.method, path: request.url }));
    });
    const gatewayUrl = await listen(gateway);
    let upstreamWebSocket: MockWebSocket | null = null;
    const worker = createCloudflareNarsProjectionWorker({
      fetch_fn: async (input, init) => {
        const target = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (target.origin === gatewayUrl && target.pathname === '/sessions/session-a/events') {
          upstreamWebSocket = new MockWebSocket();
          return { status: 101, webSocket: upstreamWebSocket } as unknown as Response;
        }
        return fetch(input, init);
      },
    });
    const assetRequests: string[] = [];
    const env = {
      OPERATOR_CONSOLE_GATEWAY_URL: gatewayUrl,
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: gatewayUrl,
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      ASSETS: {
        fetch: (request: Request) => {
          const path = new URL(request.url).pathname;
          assetRequests.push(path);
          if (path === '/console/index.html') return new Response(null, { status: 301, headers: { location: '/console/' } });
          return new Response('<script id="operator-console-config">__NARADA_OPERATOR_CONSOLE_CONFIG__</script>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        },
      },
    };
    try {
      for (const path of ['/console', '/console/']) {
        const entry = await worker.fetch(new Request(`https://console.example.test${path}`), env);
        expect(entry.status).toBe(302);
        expect(new URL(entry.headers.get('location') ?? '', 'https://console.example.test').pathname).toBe('/console/agents');
      }

      const api = await worker.fetch(new Request('https://console.example.test/console/registry/api/sites', {
        headers: { origin: 'https://console.example.test' },
      }), env);
      expect(api.status).toBe(200);
      expect(await api.json()).toMatchObject({ status: 'ok', path: '/console/registry/api/sites' });

      const mutationBody = JSON.stringify({ operation: 'plan', site_id: 'fixture-site' });
      const mutation = await worker.fetch(new Request('https://console.example.test/console/registry/api/operations/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://console.example.test' },
        body: mutationBody,
      }), env);
      expect(mutation.status).toBe(200);
      expect(await mutation.json()).toMatchObject({
        status: 'ok',
        method: 'POST',
        path: '/console/registry/api/operations/plan',
      });
      expect(seen.find((entry) => entry.path === '/console/registry/api/operations/plan')).toMatchObject({
        bridge: bridgeToken,
        body: mutationBody,
        contentLength: String(Buffer.byteLength(mutationBody)),
      });

      const undeclaredApi = await worker.fetch(new Request('https://console.example.test/console/registry/api/not-declared'), env);
      expect(undeclaredApi.status).toBe(404);
      expect(await undeclaredApi.json()).toEqual({ status: 'refused', code: 'operator_console_workspace_route_not_admitted' });

      const legacyApi = await worker.fetch(new Request('https://console.example.test/console/health'), env);
      expect(legacyApi.status).toBe(200);
      expect(await legacyApi.json()).toEqual({ status: 'ok', path: '/console/health', siteRoot: '[local value withheld]' });

      const directory = await worker.fetch(new Request('https://console.example.test/api/nars/operator-console/routes'), env);
      expect(directory.status).toBe(200);
      const directoryBody = await directory.json() as { workspaceHost?: unknown };
      expect(directoryBody.workspaceHost).toEqual({ kind: 'cloudflare', id: 'worker', origin: 'https://console.example.test' });
      expect(JSON.stringify(directoryBody)).not.toContain(bridgeToken);

      const session = await worker.fetch(new Request('https://console.example.test/sessions/session-a'), env);
      const sessionBody = await session.text();
      expect(session.status, sessionBody).toBe(200);
      expect(sessionBody).toContain('"eventEndpoint":"wss://console.example.test/sessions/session-a/events"');
      expect(sessionBody).not.toContain('127.0.0.1');
      const previousPair = (globalThis as typeof globalThis & { WebSocketPair?: typeof MockWebSocketPair }).WebSocketPair;
      const runtimeGlobal = globalThis as typeof globalThis & { WebSocketPair?: typeof MockWebSocketPair };
      let pair: MockWebSocketPair | null = null;
      runtimeGlobal.WebSocketPair = class extends MockWebSocketPair {
        constructor() {
          super();
          pair = this;
        }
      };
      try {
        const websocket = await worker.fetch(new Request('https://console.example.test/sessions/session-a/events', {
          headers: { upgrade: 'websocket' },
        }), env);
        expect(websocket.status).toBe(101);
        expect(upstreamWebSocket).not.toBeNull();
        expect(pair).not.toBeNull();
        pair![1].dispatch('message', 'from-client');
        expect(upstreamWebSocket!.sent).toEqual(['from-client']);
        upstreamWebSocket!.dispatch('message', 'from-router');
        expect(pair![1].sent).toEqual(['from-router']);
      } finally {
        runtimeGlobal.WebSocketPair = previousPair;
      }

      const document = await worker.fetch(new Request('https://console.example.test/console/registry'), env);
      expect(document.status).toBe(200);
      const documentBody = await document.text();
      expect(documentBody).toContain('/api/nars/operator-console/routes');
      expect(documentBody).toContain('"timeoutMs":30000');
      expect(assetRequests).toEqual(['/console/']);

      const health = await worker.fetch(new Request('https://console.example.test/api/nars/operator-console/health'), env);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        status: 'healthy',
        transport: {
          status: 'ready',
          transport: 'public-tunnel',
          websocket: { status: 'ready', transport: 'gateway-websocket-upgrade' },
        },
      });
      expect(seen.filter((entry) => entry.path?.startsWith('/console/')).every((entry) => entry.bridge === bridgeToken)).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
    }
  });

  test('requires a real Cloudflare Access assertion when protected mode is enabled', async () => {
    const worker = createCloudflareNarsProjectionWorker();
    const response = await worker.fetch(new Request('https://console.example.test/console/registry'), {
      OPERATOR_CONSOLE_GATEWAY_URL: 'https://gateway.example.test',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'https://gateway.example.test',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
      OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      OPERATOR_CONSOLE_ACCESS_AUDIENCE: 'audience',
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'refused', code: 'operator_console_access_required' });
  });

  test('uses the tunnel-backed TCP binding for the WebSocket leg', async () => {
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    const upstreamEvent = JSON.stringify({ event: 'from-router' });
    const eventBytes = new TextEncoder().encode(upstreamEvent);
    const handshake = new TextEncoder().encode([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));
    const upstreamBytes = new Uint8Array(handshake.byteLength + 2 + eventBytes.byteLength);
    upstreamBytes.set(handshake, 0);
    upstreamBytes.set(new Uint8Array([0x81, eventBytes.byteLength]), handshake.byteLength);
    upstreamBytes.set(eventBytes, handshake.byteLength + 2);
    const writes: Uint8Array[] = [];
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(upstreamBytes);
      },
    });
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        writes.push(new Uint8Array(chunk));
      },
    });
    const previousPair = (globalThis as typeof globalThis & { WebSocketPair?: typeof MockWebSocketPair }).WebSocketPair;
    const runtimeGlobal = globalThis as typeof globalThis & { WebSocketPair?: typeof MockWebSocketPair };
    let pair: MockWebSocketPair | null = null;
    runtimeGlobal.WebSocketPair = class extends MockWebSocketPair {
      constructor() {
        super();
        pair = this;
      }
    };
    const worker = createCloudflareNarsProjectionWorker({ require_operator_console_access: false });
    const parity = {
      schema: 'narada.operator_console.http_route_parity.v1',
      status: 'complete',
      source: 'local_operator_console_route_table',
      generatedAt: new Date().toISOString(),
      routes: [{
        routeId: 'router.session-a.websocket.get',
        method: 'GET',
        protocol: 'websocket',
        pattern: '^\\/sessions\\/session-a\\/events$',
        disposition: 'proxy',
        kind: 'observation',
        intentKind: null,
      }],
    };
    const env = {
      OPERATOR_CONSOLE_GATEWAY_URL: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'vpc-service',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      OPERATOR_CONSOLE_GATEWAY: {
        fetch: async () => new Response(JSON.stringify({
          ...projectOperatorWorkspaceRouteDirectory({
            workspaceHost: { kind: 'local', id: 'operator-console', origin: null },
          }),
          httpRouteParity: parity,
        }), { headers: { 'content-type': 'application/json' } }),
      },
      OPERATOR_CONSOLE_GATEWAY_NETWORK: {
        connect: () => ({ readable, writable }),
      },
      OPERATOR_CONSOLE_GATEWAY_TCP_HOST: '127.0.0.1',
      OPERATOR_CONSOLE_GATEWAY_TCP_PORT: '61730',
    };
    try {
      const response = await worker.fetch(new Request('https://console.example.test/sessions/session-a/events', {
        headers: {
          upgrade: 'websocket',
          'sec-websocket-key': key,
          'sec-websocket-version': '13',
        },
      }), env);
      expect(response.status).toBe(101);
      expect(pair).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pair![1].sent).toEqual([upstreamEvent]);
      expect(new TextDecoder().decode(writes[0])).toContain(`x-narada-operator-console-bridge-token: ${bridgeToken}`);
      pair![1].dispatch('message', 'from-client');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(writes.length).toBeGreaterThanOrEqual(2);
      expect(writes[1]!.byteLength).toBeGreaterThan(8);
    } finally {
      pair?.[1].close();
      runtimeGlobal.WebSocketPair = previousPair;
    }
  });

  test('reports a degraded health state when the VPC WebSocket binding is absent', async () => {
    const worker = createCloudflareNarsProjectionWorker({ require_operator_console_access: false });
    const response = await worker.fetch(new Request('https://console.example.test/api/nars/operator-console/health'), {
      OPERATOR_CONSOLE_GATEWAY_URL: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'vpc-service',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      OPERATOR_CONSOLE_GATEWAY: {
        fetch: async () => new Response(JSON.stringify({ status: 'healthy' }), {
          headers: { 'content-type': 'application/json' },
        }),
      },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      transport: {
        status: 'degraded',
        transport: 'vpc-service',
        websocket: {
          status: 'unavailable',
          transport: 'vpc-network-tcp',
          refusal_code: 'operator_console_gateway_network_binding_unavailable',
        },
      },
    });
  });

  test('routes an explicitly configured private VPC gateway without accepting public HTTP origins', async () => {
    const seen: Array<{ path: string; bridge: string | undefined; method: string | undefined; body: string }> = [];
    const gateway = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      seen.push({
        path: request.url ?? '/',
        bridge: request.headers['x-narada-operator-console-bridge-token'],
        method: request.method,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      if (request.url === '/console/routes') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          ...projectOperatorWorkspaceRouteDirectory({
            workspaceHost: { kind: 'local', id: 'operator-console', origin: null },
          }),
          httpRouteParity: {
            schema: 'narada.operator_console.http_route_parity.v1',
            status: 'complete',
            source: 'local_operator_console_route_table',
            generatedAt: new Date().toISOString(),
            routes: [
              {
                routeId: 'router.console-registry-sites.http.get',
                method: 'GET',
                protocol: 'http',
                pattern: '^\\/console\\/registry\\/api\\/sites$',
                disposition: 'proxy',
                kind: 'observation',
                intentKind: null,
              },
              {
                routeId: 'router.console-registry-plan.http.post',
                method: 'POST',
                protocol: 'http',
                pattern: '^\\/console\\/registry\\/api\\/operations\\/plan$',
                disposition: 'proxy',
                kind: 'intent',
                intentKind: 'registry.plan',
              },
            ],
          },
        }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', method: request.method, path: request.url }));
    });
    const gatewayUrl = await listen(gateway);
    const vpcRequests: string[] = [];
    const worker = createCloudflareNarsProjectionWorker({ require_operator_console_access: false });
    const env = {
      OPERATOR_CONSOLE_GATEWAY_URL: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'http://operator-console.internal',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'vpc-service',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      OPERATOR_CONSOLE_GATEWAY: {
        fetch: async (input: Request | string | URL, init?: RequestInit) => {
          const target = input instanceof Request ? new URL(input.url) : new URL(String(input));
          vpcRequests.push(target.toString());
          const gatewayTarget = new URL(target.pathname + target.search, gatewayUrl);
          return input instanceof Request
            ? fetch(new Request(gatewayTarget, input))
            : fetch(gatewayTarget, init);
        },
      },
      OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
    };
    try {
      const response = await worker.fetch(new Request('https://console.example.test/console/registry/api/sites'), env);
      expect(response.status).toBe(200);
      expect(vpcRequests).toEqual([
        'http://operator-console.internal/console/routes',
        'http://operator-console.internal/console/registry/api/sites',
      ]);
      expect(seen).toEqual([
        { path: '/console/routes', bridge: bridgeToken, method: 'GET', body: '' },
        { path: '/console/registry/api/sites', bridge: bridgeToken, method: 'GET', body: '' },
      ]);

      const mutationBody = JSON.stringify({ operation: 'retire', reference: 'fixture-site', reason: 'plan only' });
      const mutation = await worker.fetch(new Request('https://console.example.test/console/registry/api/operations/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: mutationBody,
      }), env);
      expect(mutation.status).toBe(200);
      expect(await mutation.json()).toMatchObject({ status: 'ok', method: 'POST', path: '/console/registry/api/operations/plan' });
      expect(seen).toContainEqual({ path: '/console/registry/api/operations/plan', bridge: bridgeToken, method: 'POST', body: mutationBody });

      const publicHttpWorker = createCloudflareNarsProjectionWorker({ require_operator_console_access: false });
      const publicHttpResponse = await publicHttpWorker.fetch(new Request('https://console.example.test/console/registry/api/sites'), {
        OPERATOR_CONSOLE_GATEWAY_URL: 'http://operator-console.internal',
        OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'http://operator-console.internal',
        OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
        OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
      });
      expect(publicHttpResponse.status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
    }
  });

  test('verifies the Access JWT signature, issuer, audience, and expiry before serving the Console', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const issuer = 'https://team.cloudflareaccess.com';
    const audience = 'audience';
    const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'test-key' }));
    const payload = base64Url(JSON.stringify({ iss: issuer, aud: [audience], exp: Math.floor(Date.now() / 1000) + 60 }));
    const signingInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey).toString('base64url');
    const jwt = `${signingInput}.${signature}`;
    const jwk = publicKey.export({ format: 'jwk' });
    const worker = createCloudflareNarsProjectionWorker({
      fetch_fn: async (input) => new URL(String(input)).pathname.endsWith('/cdn-cgi/access/certs')
        ? new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }), { headers: { 'content-type': 'application/json' } })
        : fetch(input),
    });
    const env = {
      OPERATOR_CONSOLE_GATEWAY_URL: 'https://gateway.example.test',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'https://gateway.example.test',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: bridgeToken,
      OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
      OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN: issuer,
      OPERATOR_CONSOLE_ACCESS_AUDIENCE: audience,
      ASSETS: {
        fetch: () => new Response('<html>console</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      },
    };
    const accepted = await worker.fetch(new Request('https://console.example.test/console/registry', {
      headers: { 'cf-access-jwt-assertion': jwt },
    }), env);
    expect(accepted.status).toBe(200);
    const rejected = await worker.fetch(new Request('https://console.example.test/console/registry', {
      headers: { 'cf-access-jwt-assertion': `${jwt.slice(0, -2)}xx` },
    }), env);
    expect(rejected.status).toBe(403);
  });
});

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}
