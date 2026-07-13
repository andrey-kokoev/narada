import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect as connectTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { registerNarsArtifact } from '@narada2/nars-session-core/artifacts';
import { writeNarsSessionStartedIndex } from '@narada2/nars-session-core/session-index';
import {
  OPERATOR_ROUTER_IDENTITY,
  OPERATOR_ROUTER_ROUTES_SCHEMA,
  createOperatorRouterServer,
  inspectOperatorRouterRouteSet,
  registerOperatorRouteSet,
  registerOperatorRoute,
  reconstructOperatorRouteSet,
  unregisterOperatorRoute,
  projectRouteRegistration,
  type OperatorRouterRoutesResponse,
} from '../src/index.ts';
import { validateRouteRegistration } from '../src/contract.ts';

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      assert.equal(typeof address, 'object');
      assert.ok(address);
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function routeInput(targetUrl: string, healthUrl: string) {
  return {
    route_id: 'agent-session-demo',
    route_class: 'agent-web-ui' as const,
    public_path: '/sessions/demo',
    target_url: targetUrl,
    health_url: healthUrl,
    owner_id: 'agent-web-ui:demo',
    session_id: 'demo',
    process_evidence: { instance_nonce: 'agentnonce123', pid: null, started_at: new Date().toISOString() },
    methods: ['GET', 'HEAD'],
    protocols: ['http'] as const,
    lease_ms: 60_000,
  };
}

test('route admission requires loopback targets and non-PID process identity', () => {
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://example.com', 'http://127.0.0.1:1/health'),
  }), /target_not_loopback/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    process_evidence: { instance_nonce: '', pid: 123, started_at: null },
  }), /process_nonce_required/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://example.com/health'),
  }), /health_target_not_loopback/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    public_path: '/sessions/%2e%2e/admin',
  }), /public_path_invalid/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    protocols: 'http' as never,
  }), /protocols_invalid/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    site_id: 42 as never,
  }), /site_id_invalid/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    route_class: 'nars-artifact',
  }), /route_class_backend_mismatch/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    route_class: 'site-operations',
  }), /site_operation_reconstruction_required/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    session_id: null,
  }), /agent_session_identity_required/);
  assert.throws(() => validateRouteRegistration({
    ...routeInput('http://user:password@127.0.0.1:1', 'http://127.0.0.1:1/health'),
  }), /target_not_loopback/);
});

test('router fails closed on an unreadable singleton lock', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-lock-'));
  await writeFile(join(stateRoot, 'router.lock'), '{not-json', 'utf8');
  const router = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot });
  try {
    await assert.rejects(() => router.start(), /singleton_lock_invalid/);
  } finally {
    await router.stop();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('route sets renew missing routes and stop without leaving a renewal race', async () => {
  const input = routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health');
  const registerCalls: string[] = [];
  const unregisterCalls: string[] = [];
  let renewCalls = 0;
  const routeSet = await registerOperatorRouteSet({
    admin: { url: 'http://127.0.0.1:1', registration_token: 'test-token' },
    routes: [input],
    renew_interval_ms: 1_000,
    register_fn: async (_admin, route) => {
      registerCalls.push(route.route_id);
      return validateRouteRegistration(route);
    },
    renew_fn: async (_admin, routeId, route) => {
      renewCalls += 1;
      if (renewCalls === 1) throw new Error('operator_router_route_not_found');
      return validateRouteRegistration({ ...input, route_id: routeId, owner_id: route.owner_id, process_evidence: { ...input.process_evidence, instance_nonce: route.instance_nonce } });
    },
    unregister_fn: async (_admin, routeId) => {
      unregisterCalls.push(routeId);
      return { status: 'removed', route_id: routeId };
    },
  });

  await routeSet.renew();
  assert.deepEqual(registerCalls, ['agent-session-demo', 'agent-session-demo']);
  await routeSet.stop();
  assert.deepEqual(unregisterCalls, ['agent-session-demo']);
  await routeSet.stop();
  assert.deepEqual(unregisterCalls, ['agent-session-demo']);
});

test('route-set posture distinguishes absent, incomplete live, and reconstructable owners', () => {
  const input = routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health');
  const healthy = projectRouteRegistration(validateRouteRegistration(input));
  const degraded = { ...healthy, state: 'degraded' as const };
  assert.equal(inspectOperatorRouterRouteSet([], [input.route_id]).posture, 'absent');
  assert.equal(inspectOperatorRouterRouteSet([healthy], [input.route_id, 'missing']).posture, 'incomplete_live');
  assert.equal(inspectOperatorRouterRouteSet([degraded], [input.route_id]).posture, 'reconstructable');
});

test('owner reconstruction re-registers only an absent or stale route set', async () => {
  const input = {
    ...routeInput('http://127.0.0.1:1', 'http://127.0.0.1:1/health'),
    site_id: 'demo',
    reconstruction: { kind: 'nars-session' as const, site_root: 'C:\\site', site_id: 'demo', session_id: 'demo' },
  };
  const existing = { ...projectRouteRegistration(validateRouteRegistration(input)), state: 'degraded' as const };
  const inventory = {
    schema: OPERATOR_ROUTER_ROUTES_SCHEMA,
    identity: OPERATOR_ROUTER_IDENTITY,
    routes: [existing],
  } satisfies OperatorRouterRoutesResponse;
  const registerCalls: string[] = [];
  const unregisterCalls: string[] = [];
  const reconstructed = await reconstructOperatorRouteSet({
    admin: { url: 'http://127.0.0.1:1', registration_token: 'test-token' },
    routes: [input],
    renew_interval_ms: 1_000,
    read_routes_fn: async () => inventory,
    register_fn: async (_admin, route) => {
      registerCalls.push(route.route_id);
      return validateRouteRegistration(route);
    },
    unregister_fn: async (_admin, routeId) => {
      unregisterCalls.push(routeId);
      return { status: 'removed', route_id: routeId };
    },
  });
  assert.equal(reconstructed.posture, 'reconstructable');
  assert.deepEqual(reconstructed.existing_route_ids, [input.route_id]);
  assert.deepEqual(reconstructed.reconstructed_route_ids, [input.route_id]);
  assert.deepEqual(registerCalls, [input.route_id]);
  await reconstructed.route_set.stop();
  assert.deepEqual(unregisterCalls, [input.route_id]);
});

test('concurrent route registration preserves every route in persisted state', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-concurrent-'));
  const upstream = createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404);
    res.end();
  });
  const upstreamUrl = await listen(upstream);
  const router = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
  try {
    const routerUrl = await router.start();
    const admin = { url: routerUrl, registration_token: router.getRegistrationToken() };
    const first = routeInput(upstreamUrl, `${upstreamUrl}/health`);
    const second = {
      ...first,
      route_id: 'agent-session-second',
      public_path: '/sessions/second',
      session_id: 'second',
    };
    await Promise.all([
      registerOperatorRoute(admin, first),
      registerOperatorRoute(admin, second),
    ]);
    const routes = await fetch(`${routerUrl}/routes`).then((response) => response.json() as Promise<{ routes: Array<Record<string, unknown>> }>);
    assert.deepEqual(routes.routes.map((route) => route.route_id).sort(), ['agent-session-demo', 'agent-session-second']);
  } finally {
    await router.stop();
    await close(upstream);
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('router registers, health-checks, proxies, projects, renews, and removes a route', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-'));
  let observedOrigin: string | undefined;
  let observedCsrf: string | undefined;
  const upstream = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('healthy');
      return;
    }
    if (req.url === '/headers') {
      observedCsrf = Array.isArray(req.headers['x-csrf-token']) ? req.headers['x-csrf-token'][0] : req.headers['x-csrf-token'];
      res.writeHead(302, { location: '/next', 'set-cookie': ['router_a=1', 'router_b=2'] });
      res.end();
      return;
    }
    observedOrigin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
    res.writeHead(200, { 'content-type': 'text/plain', 'x-upstream': 'yes' });
    res.end(`upstream:${req.url}`);
  });
  const upstreamUrl = await listen(upstream);
  const router = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
  try {
    const routerUrl = await router.start();
    const admin = { url: routerUrl, registration_token: router.getRegistrationToken() };
    const registered = await registerOperatorRoute(admin, routeInput(upstreamUrl, `${upstreamUrl}/health`));
    assert.equal(registered.state, 'healthy');
    const health = await fetch(`${routerUrl}/health`);
    assert.equal((await health.json()).version, '0.1.0');

    const proxied = await fetch(`${routerUrl}/sessions/demo/hello?x=1`);
    assert.equal(proxied.status, 200);
    assert.equal(await proxied.text(), 'upstream:/hello?x=1');
    const originForwarded = await fetch(`${routerUrl}/sessions/demo/origin`, { headers: { origin: routerUrl } });
    assert.equal(originForwarded.status, 200);
    assert.equal(observedOrigin, routerUrl);
    const foreignLoopbackHost = await fetch(`${routerUrl}/sessions/demo/origin`, {
      headers: { host: '127.0.0.1:9' },
    });
    assert.equal(foreignLoopbackHost.status, 421);
    const foreignLoopbackOrigin = await fetch(`${routerUrl}/sessions/demo/origin`, {
      headers: { origin: 'http://127.0.0.1:9' },
    });
    assert.equal(foreignLoopbackOrigin.status, 421);
    const headersForwarded = await fetch(`${routerUrl}/sessions/demo/headers`, {
      redirect: 'manual',
      headers: { 'x-csrf-token': 'csrf-demo' },
    });
    assert.equal(headersForwarded.status, 302);
    assert.equal(headersForwarded.headers.get('location'), '/next');
    assert.equal(observedCsrf, 'csrf-demo');
    assert.match(headersForwarded.headers.get('set-cookie') ?? '', /router_a=1/);
    const traversal = await fetch(`${routerUrl}/sessions/demo/%2e%2e/admin`);
    assert.equal(traversal.status, 400);

    const routeResponse = await fetch(`${routerUrl}/routes`);
    const routeBody = await routeResponse.json() as { routes: Array<Record<string, unknown>> };
    assert.equal(routeBody.routes.length, 1);
    assert.equal(routeBody.routes[0]?.public_path, '/sessions/demo');
    assert.equal('target_url' in (routeBody.routes[0] ?? {}), false);

    const renewed = await fetch(`${routerUrl}/admin/routes/agent-session-demo/renew`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-narada-router-token': router.getRegistrationToken() },
      body: JSON.stringify({ owner_id: 'agent-web-ui:demo', instance_nonce: 'agentnonce123', lease_ms: 60_000 }),
    });
    assert.equal(renewed.status, 200);

    await unregisterOperatorRoute(admin, 'agent-session-demo', { owner_id: 'agent-web-ui:demo', instance_nonce: 'agentnonce123' });
    assert.equal((await fetch(`${routerUrl}/sessions/demo/hello`)).status, 404);
  } finally {
    await router.stop();
    await close(upstream);
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('router reconstructs a persisted healthy route after singleton restart', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-restart-'));
  const upstream = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end('healthy');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`reconstructed:${req.url}`);
  });
  const upstreamUrl = await listen(upstream);
  const first = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
  let second: Awaited<ReturnType<typeof createOperatorRouterServer>> | null = null;
  try {
    const firstUrl = await first.start();
    await registerOperatorRoute({ url: firstUrl, registration_token: first.getRegistrationToken() }, routeInput(upstreamUrl, `${upstreamUrl}/health`));
    await first.stop();

    const restarted = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
    second = restarted;
    const secondUrl = await restarted.start();
    const response = await fetch(`${secondUrl}/sessions/demo/reconstructed`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'reconstructed:/reconstructed');
    const routes = await fetch(`${secondUrl}/routes`).then((result) => result.json() as Promise<{ routes: Array<Record<string, unknown>> }>);
    assert.equal(routes.routes.length, 1);
    assert.equal(routes.routes[0]?.state, 'healthy');
  } finally {
    await first.stop();
    await second?.stop();
    await close(upstream);
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('websocket route forwards the stable session event upgrade', { timeout: 5_000 }, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-websocket-'));
  const upstream = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end('healthy');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));
    socket.write(Buffer.from([0x81, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]));
  });
  const upstreamUrl = await listen(upstream);
  const upstreamPort = new URL(upstreamUrl).port;
  const router = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
  let client: ReturnType<typeof connectTcp> | null = null;
  try {
    const routerUrl = await router.start();
    await registerOperatorRoute({ url: routerUrl, registration_token: router.getRegistrationToken() }, {
      route_id: 'agent-web-ui-websocket-demo',
      route_class: 'agent-web-ui',
      public_path: '/sessions/websocket_demo/events',
      route_mode: 'exact',
      target_url: `${upstreamUrl}/`,
      websocket_target_url: `ws://127.0.0.1:${upstreamPort}/events`,
      health_url: `${upstreamUrl}/health`,
      owner_id: 'agent-web-ui:websocket-demo',
      session_id: 'websocket_demo',
      process_evidence: { instance_nonce: 'websocketnonce123', pid: null, started_at: new Date().toISOString() },
      protocols: ['websocket'],
      methods: ['GET'],
      lease_ms: 60_000,
    });
    const routerPort = new URL(routerUrl).port;
    client = connectTcp(Number(routerPort), '127.0.0.1');
    const response = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => reject(new Error('websocket_test_timeout')), 3_000);
      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        const current = Buffer.concat(chunks);
        if (current.includes(Buffer.from('\r\n\r\n')) && current.includes(Buffer.from([0x81, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]))) {
          clearTimeout(timeout);
          client?.off('data', onData);
          client?.off('error', onError);
          resolve(current);
        }
      };
      client?.on('data', onData);
      client?.once('error', onError);
      client?.once('connect', () => {
        client?.write([
          'GET /sessions/websocket_demo/events HTTP/1.1',
          `Host: 127.0.0.1:${routerPort}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          '',
          '',
        ].join('\r\n'));
      });
    });
    assert.match(response.toString('latin1'), /101 Switching Protocols/);
  } finally {
    client?.destroy();
    await router.stop();
    await close(upstream);
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('artifact route reconstructs session-owned metadata and content beneath canonical path', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-artifact-site-'));
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-artifact-router-'));
  const sessionId = 'carrier_artifact_demo';
  const sessionPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'session.jsonl');
  const sourcePath = join(siteRoot, 'artifact.txt');
  await writeFile(sourcePath, 'router artifact content\n', 'utf8');
  writeNarsSessionStartedIndex({
    sessionStartedEvent: {
      session_id: sessionId,
      site_root: siteRoot,
      site_id: 'narada.demo',
      session_path: sessionPath,
      started_at: new Date().toISOString(),
    },
    sessionPath,
    siteRoot,
  });
  const registeredArtifact = registerNarsArtifact({ sessionPath, sessionId, siteRoot, sourcePath, kind: 'text' });
  const router = await createOperatorRouterServer({ host: '127.0.0.1', port: 0, state_root: stateRoot, health_interval_ms: 60_000 });
  try {
    const routerUrl = await router.start();
    await registerOperatorRoute({ url: routerUrl, registration_token: router.getRegistrationToken() }, {
      route_id: 'nars-artifact-demo',
      route_class: 'nars-artifact',
      backend_kind: 'nars-artifact',
      public_path: `/artifacts/${encodeURIComponent(sessionId)}`,
      route_mode: 'prefix',
      owner_id: 'agent-web-ui:artifact-demo',
      site_id: 'narada.demo',
      session_id: sessionId,
      process_evidence: { instance_nonce: 'artifactnonce123', pid: null, started_at: new Date().toISOString() },
      methods: ['GET', 'HEAD'],
      protocols: ['http'],
      lease_ms: 60_000,
      reconstruction: { kind: 'nars-session', site_root: siteRoot, site_id: 'narada.demo', session_id: sessionId },
    });

    const base = `${routerUrl}/artifacts/${encodeURIComponent(sessionId)}/${encodeURIComponent(registeredArtifact.record.artifact_id)}`;
    const metadata = await fetch(base);
    assert.equal(metadata.status, 200);
    const metadataBody = await metadata.json();
    assert.equal(metadataBody.artifact_id, registeredArtifact.record.artifact_id);
    assert.equal('source_path' in metadataBody, false);
    const content = await fetch(`${base}/content`);
    assert.equal(content.status, 200);
    assert.equal(await content.text(), 'router artifact content\n');
  } finally {
    await router.stop();
    await rm(stateRoot, { recursive: true, force: true });
    await rm(siteRoot, { recursive: true, force: true });
  }
});
