import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium, type Page } from '@playwright/test';
import Database from '@narada-core/sqlite';
import { HostFleetRegistry } from '@narada-core/host-fleet';
import type { HostRecordInput } from '@narada-core/host-fleet/contract';
import { createConsoleServer } from '../../dist/commands/console-server.js';

type JsonObject = Record<string, unknown>;

const liveEnabled = process.env.NARADA_ENABLE_LIVE_E2E === '1';
const HOST_PATHS = ['/health', '/console/sessions/api/sessions', '/sessions/*'];

interface GatewayOptions {
  hostId: string;
  hostInstanceId: string;
  sessionId: string;
  token: string;
  closeFirstConnection?: boolean;
}

interface GatewayFixture {
  url: string;
  connectionCount: number;
  close: () => Promise<void>;
}

function jsonResponse(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(encoded),
  });
  response.end(encoded);
}

function listen(server: HttpServer): Promise<string> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('gateway_address_missing'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

function websocketFrame(payload: unknown): Buffer {
  const content = Buffer.from(JSON.stringify(payload), 'utf8');
  assert.ok(content.length <= 0xffff, 'live fixture frame must stay bounded');
  if (content.length < 126) return Buffer.concat([Buffer.from([0x81, content.length]), content]);
  return Buffer.concat([Buffer.from([0x81, 126, content.length >> 8, content.length & 0xff]), content]);
}

function websocketAccept(key: string): string {
  return createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function authorized(request: { headers: Record<string, string | string[] | undefined> }, token: string): boolean {
  const bridge = request.headers['x-narada-operator-console-bridge-token'];
  const gateway = request.headers['x-narada-host-gateway-token'];
  return bridge === token || gateway === token;
}

async function startGateway(options: GatewayOptions): Promise<GatewayFixture> {
  const sockets = new Set<Socket>();
  let connectionCount = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://gateway.fixture');
    if (!authorized(request, options.token)) {
      jsonResponse(response, 401, { schema: 'narada.host_fleet.refusal.v1', status: 'refused', reason: 'unauthenticated' });
      return;
    }
    if (url.pathname === '/health') {
      jsonResponse(response, 200, { schema: 'narada.operator_console_remote_gateway.health.v1', status: 'healthy' });
      return;
    }
    if (url.pathname === '/console/sessions/api/sessions') {
      jsonResponse(response, 200, {
        schema: 'narada.operator_console.agent_sessions.v1',
        status: 'success',
        generated_at: new Date().toISOString(),
        count: 1,
        sessions: [{
          session_id: options.sessionId,
          site_id: 'live-site',
          agent_id: 'resident',
          display_state: 'active',
          health_status: 'healthy',
          started_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        }],
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });

  server.on('upgrade', (request, socket) => {
    const url = new URL(request.url ?? '/', 'http://gateway.fixture');
    const key = request.headers['sec-websocket-key'];
    if (!authorized(request, options.token) || typeof key !== 'string' || url.pathname !== `/sessions/${options.sessionId}/events`) {
      socket.destroy();
      return;
    }
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
      '',
      '',
    ].join('\r\n'));
    sockets.add(socket);
    connectionCount += 1;
    const currentConnection = connectionCount;
    const closeAfterReplay = options.closeFirstConnection === true && currentConnection === 1;
    setTimeout(() => {
      if (socket.destroyed) return;
      socket.write(websocketFrame({
        event: 'session_events_replay_completed',
        host_id: options.hostId,
        host_instance_id: options.hostInstanceId,
        runtime_session_id: options.sessionId,
        event_sequence: currentConnection,
      }));
      socket.write(websocketFrame({
        event: 'assistant_message',
        content: `${options.hostId}-live-event-${currentConnection}`,
        event_sequence: currentConnection,
      }));
      if (closeAfterReplay) setTimeout(() => socket.end(), 80);
    }, 30);
    socket.once('close', () => sockets.delete(socket));
  });

  const url = await listen(server);
  return {
    url,
    get connectionCount() { return connectionCount; },
    async close(): Promise<void> {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
    },
  };
}

function hostInput(hostId: string, instanceId: string, endpoint: string, credentialRef: string): HostRecordInput {
  return {
    host_id: hostId,
    host_instance_id: instanceId,
    display_name: hostId,
    platform: 'linux',
    gateway: {
      endpoint,
      transport: 'loopback',
      admitted_paths: HOST_PATHS,
    },
    credential_ref: credentialRef,
    admitted_sites: ['live-site'],
    capabilities: ['sessions', 'events'],
  };
}

async function requestJson(url: string, init?: RequestInit): Promise<{ response: Response; body: JsonObject }> {
  const response = await fetch(url, init);
  const body = await response.json() as JsonObject;
  return { response, body };
}

async function waitFor(condition: () => boolean | Promise<boolean>, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`live_wait_timeout:${label}`);
}

async function waitForMutationFeedback(page: Page): Promise<void> {
  await page.getByRole('status').filter({ hasText: /Host Fleet mutation (applied|replayed|unchanged)\./ }).waitFor({ timeout: 10_000 });
  const mutationRefusals = await page.getByRole('alert').filter({ hasText: /Host Fleet mutation/ }).allTextContents();
  assert.deepEqual(mutationRefusals, [], `Host Fleet mutation was refused: ${mutationRefusals.join(' | ')}`);
}

async function openPage(url: string): Promise<{ page: Page; close: () => Promise<void>; errors: string[] }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, errors, close: () => browser.close() };
}

test('live local authority journey performs enrollment, browser attachment, and lifecycle mutation', { skip: !liveEnabled }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-authority-live-'));
  const gateway = await startGateway({
    hostId: 'live-host-1',
    hostInstanceId: 'live-instance-1',
    sessionId: 'live-session-1',
    token: 'live-host-1-token',
  });
  const registry = new HostFleetRegistry(new Database(join(root, 'host-fleet.db')));
  const consoleServer = await createConsoleServer({
    port: 0,
    host: '127.0.0.1',
    hostFleetRegistry: registry,
    hostFleetCredentialResolver: (reference) => reference === 'secret://live-host-1' ? 'live-host-1-token' : null,
  });
  let pageHandle: Awaited<ReturnType<typeof openPage>> | null = null;
  try {
    const consoleUrl = await consoleServer.start();
    const initial = await requestJson(`${consoleUrl}/console/hosts/api`);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.body.count, 0);

    pageHandle = await openPage(`${consoleUrl}/console/hosts`);
    const { page } = pageHandle;
    await page.getByText(/No hosts are enrolled yet/).waitFor();
    await page.getByText('Enroll or re-enroll a host', { exact: true }).click();
    await page.getByLabel('Host ID', { exact: true }).fill('live-host-1');
    await page.getByLabel('Host instance ID', { exact: true }).fill('live-instance-1');
    await page.getByLabel('Display name', { exact: true }).fill('Live Host 1');
    await page.getByLabel('Gateway endpoint', { exact: true }).fill(gateway.url);
    await page.getByLabel('Credential reference', { exact: true }).fill('secret://live-host-1');
    await page.getByLabel('Admitted paths', { exact: true }).fill(HOST_PATHS.join('\n'));
    await page.getByLabel('Capabilities', { exact: true }).fill('sessions\nevents');
    await page.getByLabel('Admitted Sites', { exact: true }).fill('live-site');
    await page.getByRole('button', { name: 'Review enrollment', exact: true }).click();
    await page.getByText('intent ready', { exact: true }).waitFor();
    await page.getByLabel(/I reviewed this enrollment intent/).check();
    await page.getByRole('button', { name: 'Apply enrollment', exact: true }).click();
    await waitForMutationFeedback(page);

    const enrolled = registry.getHost({ host_id: 'live-host-1', host_instance_id: 'live-instance-1' });
    assert.equal(enrolled?.revision, 1);
    assert.equal(enrolled?.lifecycle_state, 'pending');
    assert.equal(JSON.stringify(enrolled).includes('live-host-1-token'), false);

    const selectHost = page.getByRole('button', { name: /Select Live Host 1 \(live-host-1@live-instance-1\)/ });
    await selectHost.click();
    await page.getByText('live-session-1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Attach', exact: true }).click();
    await page.getByText(/session_events_replay_completed/).waitFor();

    await page.getByLabel('Reason', { exact: true }).fill('live authority lifecycle test');
    await page.getByRole('button', { name: 'Plan revoke', exact: true }).click();
    await page.getByText('preflight ready', { exact: true }).waitFor();
    await page.getByLabel(/I reviewed this revision-checked plan/).check();
    await page.getByRole('button', { name: 'Apply revoke', exact: true }).click();
    await waitForMutationFeedback(page);
    await page.getByRole('alert').filter({ hasText: 'host_revoked' }).waitFor();

    const revoked = registry.getHost({ host_id: 'live-host-1', host_instance_id: 'live-instance-1' });
    assert.equal(revoked?.lifecycle_state, 'revoked');
    assert.equal(revoked?.revision, 2);
    assert.ok(registry.listAudit({ host: { host_id: 'live-host-1', host_instance_id: 'live-instance-1' } }).length >= 2);
    assert.deepEqual(pageHandle.errors, []);
  } finally {
    if (pageHandle) await pageHandle.close();
    await consoleServer.stop();
    registry.close();
    await gateway.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('live multi-host aggregate observation reconnects after one gateway drops the first stream', { skip: !liveEnabled }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-recovery-live-'));
  const firstGateway = await startGateway({
    hostId: 'live-host-a',
    hostInstanceId: 'instance-a',
    sessionId: 'session-a',
    token: 'live-host-a-token',
  });
  const recoveringGateway = await startGateway({
    hostId: 'live-host-b',
    hostInstanceId: 'instance-b',
    sessionId: 'session-b',
    token: 'live-host-b-token',
    closeFirstConnection: true,
  });
  const registry = new HostFleetRegistry(new Database(join(root, 'host-fleet.db')));
  registry.registerHost(hostInput('live-host-a', 'instance-a', firstGateway.url, 'secret://live-host-a'));
  registry.registerHost(hostInput('live-host-b', 'instance-b', recoveringGateway.url, 'secret://live-host-b'));
  const consoleServer = await createConsoleServer({
    port: 0,
    host: '127.0.0.1',
    hostFleetRegistry: registry,
    hostFleetCredentialResolver: (reference) => ({
      'secret://live-host-a': 'live-host-a-token',
      'secret://live-host-b': 'live-host-b-token',
    }[reference] ?? null),
  });
  let pageHandle: Awaited<ReturnType<typeof openPage>> | null = null;
  try {
    const consoleUrl = await consoleServer.start();
    pageHandle = await openPage(`${consoleUrl}/console/hosts`);
    const { page } = pageHandle;
    await page.getByText('Host Fleet', { exact: true }).waitFor();
    const observe = page.getByRole('button', { name: 'Observe all active sessions', exact: true });
    await waitFor(() => observe.isEnabled(), 'aggregate-observe-enabled');
    await observe.click();
    const aggregate = page.locator('[aria-label="Aggregate fleet observation"]');
    await aggregate.getByText(/live-host-b-live-event-1/).waitFor();
    await waitFor(() => recoveringGateway.connectionCount >= 2, 'gateway-reconnect');
    await aggregate.getByText(/live-host-b-live-event-2/).waitFor();
    await waitFor(() => aggregate.getByText(/sequence 2/).count().then((count) => count > 0), 'reconnected-sequence');
    await waitFor(async () => (await aggregate.locator('.status').textContent())?.trim() === 'connected', 'aggregate-connected-after-reconnect');
    assert.deepEqual(pageHandle.errors, []);
  } finally {
    if (pageHandle) await pageHandle.close();
    await consoleServer.stop();
    registry.close();
    await firstGateway.close();
    await recoveringGateway.close();
    await rm(root, { recursive: true, force: true });
  }
});
