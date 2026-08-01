import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { connect as connectTcp } from 'node:net';
import { OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA, type OperatorConsoleHttpRouteParityEntry } from '@narada2/operator-console-contract';
import { createOperatorConsoleRemoteGateway, operatorConsoleRemoteGatewayPathDisposition } from '../src/index.js';

const bridgeToken = 'bridge-token-0123456789';
const routerToken = 'router-token-0123456789';
const routePolicy: readonly OperatorConsoleHttpRouteParityEntry[] = [
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
    routeId: 'operator-console.agents-page',
    method: 'GET',
    protocol: 'http',
    pattern: '^\\/console\\/agents\\/?$',
    disposition: 'proxy',
    kind: 'document',
    intentKind: null,
  },
  {
    routeId: 'operator-console.registry-plan',
    method: 'POST',
    protocol: 'http',
    pattern: '^\\/console\\/registry\\/api\\/operations\\/plan$',
    disposition: 'proxy',
    kind: 'intent',
    intentKind: 'registry.plan',
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
];

test('admits observation paths but only declared mutation intents', () => {
  assert.deepEqual(operatorConsoleRemoteGatewayPathDisposition('GET', '/console/agents', routePolicy), { admitted: true });
  assert.deepEqual(operatorConsoleRemoteGatewayPathDisposition('POST', '/console/registry/api/operations/plan', routePolicy), { admitted: true });
  assert.equal(operatorConsoleRemoteGatewayPathDisposition('POST', '/console/hosts/api/lifecycle', [...routePolicy, {
    routeId: 'operator-console.host-fleet-lifecycle',
    method: 'POST',
    protocol: 'http',
    pattern: '^\\/console\\/hosts\\/api\\/lifecycle$',
    disposition: 'local-only',
    kind: 'intent',
    intentKind: 'host_fleet.lifecycle',
  }]).admitted, false);
  assert.equal(operatorConsoleRemoteGatewayPathDisposition('GET', '/console/unknown', routePolicy).admitted, false);
  assert.equal(operatorConsoleRemoteGatewayPathDisposition('DELETE', '/console/agents', routePolicy).admitted, false);
  assert.equal(operatorConsoleRemoteGatewayPathDisposition('GET', '/console/../secret', routePolicy).admitted, false);
});

test('requires the bridge credential and forwards admitted requests to the loopback router', async () => {
  const router = createServer((req, res) => {
    assert.equal(req.headers['x-narada-router-token'], routerToken);
    assert.equal(req.headers.origin, undefined);
    if (req.url === '/console/routes') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        httpRouteParity: {
          schema: OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA,
          status: 'complete',
          source: 'local_operator_console_route_table',
          generatedAt: new Date().toISOString(),
          routes: routePolicy,
        },
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, method: req.method }));
  });
  await new Promise<void>((resolve) => router.listen(0, '127.0.0.1', resolve));
  const address = router.address();
  assert.equal(typeof address, 'object');
  const routerUrl = `http://127.0.0.1:${(address as { port: number }).port}`;
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: routerUrl,
    router_token: routerToken,
    bridge_token: bridgeToken,
    port: 0,
  });
  const gatewayUrl = await gateway.start();
  try {
    const missing = await fetch(`${gatewayUrl}/console/agents`);
    assert.equal(missing.status, 401);
    await missing.arrayBuffer();
    const admitted = await fetch(`${gatewayUrl}/console/agents?scope=all`, {
      headers: { 'x-narada-operator-console-bridge-token': bridgeToken, origin: 'https://remote.example.test' },
    });
    assert.equal(admitted.status, 200);
    assert.deepEqual(await admitted.json(), { path: '/console/agents?scope=all', method: 'GET' });
    const unknown = await fetch(`${gatewayUrl}/console/unknown`, {
      headers: { 'x-narada-operator-console-bridge-token': bridgeToken },
    });
    assert.equal(unknown.status, 404);
  } finally {
    await gateway.stop();
    await new Promise<void>((resolve, reject) => router.close((error) => error ? reject(error) : resolve()));
  }
});

test('requires the dedicated credential for host-qualified requests when configured', async () => {
  const hostGatewayToken = 'host-gateway-token-0123456789';
  const router = createServer((req, res) => {
    if (req.url === '/console/routes') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        httpRouteParity: {
          schema: OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA,
          status: 'complete',
          source: 'local_operator_console_route_table',
          generatedAt: new Date().toISOString(),
          routes: routePolicy,
        },
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, method: req.method }));
  });
  await new Promise<void>((resolve) => router.listen(0, '127.0.0.1', resolve));
  const address = router.address();
  assert.equal(typeof address, 'object');
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: `http://127.0.0.1:${(address as { port: number }).port}`,
    router_token: routerToken,
    bridge_token: bridgeToken,
    host_gateway_token: hostGatewayToken,
    port: 0,
  });
  const gatewayUrl = await gateway.start();
  try {
    const bridge = await fetch(`${gatewayUrl}/console/agents`, {
      headers: {
        'x-narada-operator-console-bridge-token': bridgeToken,
        'x-narada-host-id': 'zima-board-2',
        'x-narada-host-instance-id': 'zima-instance',
      },
    });
    assert.equal(bridge.status, 401);
    await bridge.arrayBuffer();

    const dedicated = await fetch(`${gatewayUrl}/console/agents`, {
      headers: {
        'x-narada-host-gateway-token': hostGatewayToken,
        'x-narada-host-id': 'zima-board-2',
        'x-narada-host-instance-id': 'zima-instance',
      },
    });
    assert.equal(dedicated.status, 200);

    const ordinary = await fetch(`${gatewayUrl}/console/agents`, {
      headers: { 'x-narada-operator-console-bridge-token': bridgeToken },
    });
    assert.equal(ordinary.status, 200);
  } finally {
    await gateway.stop();
    await new Promise<void>((resolve, reject) => router.close((error) => error ? reject(error) : resolve()));
  }
});

test('refreshes route policy once when a newly leased route misses the bounded cache', async () => {
  let dynamicRouteAvailable = false;
  let policyReads = 0;
  const dynamicRoute: OperatorConsoleHttpRouteParityEntry = {
    routeId: 'router.session-dynamic.http.get',
    method: 'GET',
    protocol: 'http',
    pattern: '^\\/sessions\\/dynamic-session(?:\\/.*)?$',
    disposition: 'proxy',
    kind: 'observation',
    intentKind: null,
  };
  const router = createServer((req, res) => {
    if (req.url === '/console/routes') {
      policyReads += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        httpRouteParity: {
          schema: OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA,
          status: 'complete',
          source: 'local_operator_console_route_table',
          generatedAt: new Date().toISOString(),
          routes: dynamicRouteAvailable ? [...routePolicy, dynamicRoute] : routePolicy,
        },
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, method: req.method }));
  });
  await new Promise<void>((resolve) => router.listen(0, '127.0.0.1', resolve));
  const address = router.address();
  assert.equal(typeof address, 'object');
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: `http://127.0.0.1:${(address as { port: number }).port}`,
    router_token: routerToken,
    bridge_token: bridgeToken,
    port: 0,
    route_policy_ttl_ms: 60_000,
  });
  const gatewayUrl = await gateway.start();
  try {
    dynamicRouteAvailable = true;
    const admitted = await fetch(`${gatewayUrl}/sessions/dynamic-session`, {
      headers: { 'x-narada-operator-console-bridge-token': bridgeToken },
    });
    assert.equal(admitted.status, 200);
    assert.deepEqual(await admitted.json(), { path: '/sessions/dynamic-session', method: 'GET' });
    assert.equal(policyReads, 2);
  } finally {
    await gateway.stop();
    await new Promise<void>((resolve, reject) => router.close((error) => error ? reject(error) : resolve()));
  }
});

test('refuses to start when the local route parity inventory is absent', async () => {
  const router = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  });
  await new Promise<void>((resolve) => router.listen(0, '127.0.0.1', resolve));
  const address = router.address();
  assert.equal(typeof address, 'object');
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: `http://127.0.0.1:${(address as { port: number }).port}`,
    router_token: routerToken,
    bridge_token: bridgeToken,
    port: 0,
  });
  await assert.rejects(() => gateway.start(), /operator_console_gateway_route_policy/);
  await new Promise<void>((resolve, reject) => router.close((error) => error ? reject(error) : resolve()));
});

test('bridges only declared WebSocket routes through the loopback Router', async () => {
  let routerUpgradeSocket: import('node:stream').Duplex | null = null;
  const router = createServer((req, res) => {
    if (req.url === '/console/routes') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        httpRouteParity: {
          schema: OPERATOR_CONSOLE_HTTP_ROUTE_PARITY_SCHEMA,
          status: 'complete',
          source: 'local_operator_console_route_table',
          generatedAt: new Date().toISOString(),
          routes: routePolicy,
        },
      }));
      return;
    }
    res.writeHead(200);
    res.end('ok');
  });
  router.on('upgrade', (_req, socket) => {
    routerUpgradeSocket = socket;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', (chunk) => socket.write(chunk));
    socket.once('close', () => { routerUpgradeSocket = null; });
  });
  await new Promise<void>((resolve) => router.listen(0, '127.0.0.1', resolve));
  const address = router.address();
  assert.equal(typeof address, 'object');
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: `http://127.0.0.1:${(address as { port: number }).port}`,
    router_token: routerToken,
    bridge_token: bridgeToken,
    port: 0,
  });
  const gatewayUrl = await gateway.start();
  const gatewayAddress = new URL(gatewayUrl);
  const client = connectTcp(Number(gatewayAddress.port), gatewayAddress.hostname);
  try {
    await new Promise<void>((resolve, reject) => {
      let response = Buffer.alloc(0);
      let sentFrame = false;
      let settled = false;
      const timer = setTimeout(() => finish(new Error('websocket_bridge_test_timeout')), 5_000);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      client.once('error', (error) => finish(error));
      client.on('data', (chunk) => {
        response = Buffer.concat([response, Buffer.from(chunk)]);
        const headerEnd = response.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd >= 0 && !sentFrame) {
          assert.match(response.subarray(0, headerEnd).toString('latin1'), /^HTTP\/1\.1 101/u);
          sentFrame = true;
          client.write(Buffer.from([0x81, 0x01, 0x78]));
        } else if (sentFrame && response.includes(Buffer.from([0x81, 0x01, 0x78]))) {
          finish();
          client.destroy();
        }
      });
      client.once('connect', () => {
        client.write([
          'GET /sessions/session-a/events HTTP/1.1',
          `Host: ${gatewayAddress.host}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          `x-narada-operator-console-bridge-token: ${bridgeToken}`,
          '\r\n',
        ].join('\r\n'));
      });
    });
  } finally {
    client.destroy();
    routerUpgradeSocket?.destroy();
    await gateway.stop();
    await new Promise<void>((resolve, reject) => router.close((error) => error ? reject(error) : resolve()));
  }
});
