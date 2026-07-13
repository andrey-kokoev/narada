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
  createOperatorRouterServer,
  registerOperatorRoute,
  unregisterOperatorRoute,
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

test('router registers, health-checks, proxies, projects, renews, and removes a route', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-operator-router-'));
  let observedOrigin: string | undefined;
  const upstream = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('healthy');
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
          'Host: 127.0.0.1',
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
