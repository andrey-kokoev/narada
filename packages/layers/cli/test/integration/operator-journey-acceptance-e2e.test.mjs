import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createAgentWebUiServer } from '@narada2/agent-web-ui/server';
import { registerNarsArtifact } from '@narada2/nars-session-core/artifacts';
import { writeNarsSessionStartedIndex } from '@narada2/nars-session-core/session-index';
import { SiteRegistry, openRegistryDb, resolveRegistryDbPathByLocus } from '@narada2/windows-site';
import { ensureOperatorRouter, registerOperatorRouteSet } from '@narada2/operator-router';
import { createConsoleServer } from '../../dist/commands/console-server.js';
import { createWorkbenchServer } from '../../dist/commands/workbench-server.js';

const SITE_ID = 'journey-site';
const SESSION_ID = 'journey_session';
const JOURNEY_EVENT = 'router journey live event';
const UPDATED_PURPOSE = 'operator journey acceptance';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      assert.equal(typeof address, 'object');
      assert.ok(address);
      resolve('http://127.0.0.1:' + address.port);
    });
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function reservePort() {
  const server = createServer();
  const url = await listen(server);
  await closeServer(server);
  return Number(new URL(url).port);
}

async function waitForRouterUnavailable(url) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url + '/health', { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('operator_router_stop_timeout');
}

async function stopEnsuredRouter(owner) {
  if (!owner || owner.ownership !== 'started') return;
  if (owner.child && !owner.child.killed && owner.child.exitCode === null) owner.child.kill();
  await waitForRouterUnavailable(owner.url);
}

function jsonResponse(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(encoded),
  });
  response.end(encoded);
}

function websocketTextFrame(value) {
  const payload = Buffer.from(value, 'utf8');
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  assert.ok(payload.length <= 0xffff);
  return Buffer.concat([
    Buffer.from([0x81, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]),
    payload,
  ]);
}

async function createRuntimeFixture() {
  const sockets = new Set();
  let websocketConnections = 0;
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      jsonResponse(response, 200, { status: 'healthy' });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.on('upgrade', (request, socket) => {
    if (request.url !== '/events' || typeof request.headers['sec-websocket-key'] !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept,
      '',
      '',
    ].join('\r\n'));
    sockets.add(socket);
    websocketConnections += 1;
    socket.on('data', (chunk) => {
      if ((chunk[0] & 0x0f) !== 0x08) return;
      socket.write(Buffer.from([0x88, 0x00]));
      socket.end();
    });
    const timer = setTimeout(() => {
      if (!socket.destroyed) {
        socket.write(websocketTextFrame(JSON.stringify({
          event: 'assistant_message',
          content: JOURNEY_EVENT,
          agent_id: SITE_ID + '.resident',
          session_id: SESSION_ID,
          event_sequence: 1,
          sequence: 1,
        })));
      }
    }, 100);
    socket.once('close', () => {
      clearTimeout(timer);
      sockets.delete(socket);
    });
  });
  const url = await listen(server);
  return {
    server,
    url,
    websocketUrl: url.replace(/^http:/, 'ws:'),
    sockets,
    getWebsocketConnections: () => websocketConnections,
  };
}

async function seedRegistry(root, siteRoot) {
  const userSiteRoot = join(root, 'Narada', '.registry');
  await mkdir(userSiteRoot, { recursive: true });
  process.env.NARADA_USER_SITE_ROOT = userSiteRoot;
  const database = await openRegistryDb(resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' }));
  const registry = new SiteRegistry(database);
  const timestamp = new Date().toISOString();
  registry.registerSite({
    siteId: SITE_ID,
    variant: 'native',
    siteRoot,
    substrate: 'windows',
    aimJson: JSON.stringify({ purpose: 'journey fixture' }),
    controlEndpoint: null,
    lastSeenAt: timestamp,
    createdAt: timestamp,
  });
  database.close();
}

async function seedSession(siteRoot) {
  const sessionPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', SESSION_ID, 'session.jsonl');
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, '', 'utf8');
  writeNarsSessionStartedIndex({
    sessionStartedEvent: {
      event: 'session_started',
      session_id: SESSION_ID,
      site_id: SITE_ID,
      agent_id: SITE_ID + '.resident',
      started_at: new Date().toISOString(),
      site_root: siteRoot,
      runtime: 'narada-agent-runtime-server',
      event_endpoint: 'ws://127.0.0.1:1/events',
      health_endpoint: 'http://127.0.0.1:1/health',
      session_path: sessionPath,
    },
    sessionPath,
    siteRoot,
  });
  const sourcePath = join(siteRoot, 'journey-artifact.txt');
  await writeFile(sourcePath, 'router journey artifact content\n', 'utf8');
  const artifact = registerNarsArtifact({
    sessionPath,
    sessionId: SESSION_ID,
    agentId: SITE_ID + '.resident',
    siteRoot,
    sourcePath,
    kind: 'text',
    title: 'Router journey artifact',
  });
  return { sessionPath, artifactId: artifact.record.artifact_id };
}

function routeProcessEvidence(name) {
  return {
    instance_nonce: name + '-nonce',
    pid: null,
    started_at: new Date().toISOString(),
  };
}

function routeSetInput({ consoleUrl, workbenchUrl, agentUrl, runtimeWebsocketUrl, siteRoot }) {
  const reconstruction = {
    kind: 'nars-session',
    site_root: siteRoot,
    site_id: SITE_ID,
    session_id: SESSION_ID,
  };
  return [
    {
      route_id: 'operator-console',
      route_class: 'operator-console',
      public_path: '/',
      route_mode: 'prefix',
      target_url: consoleUrl,
      health_url: consoleUrl + '/health',
      owner_id: 'operator-console:journey',
      process_evidence: routeProcessEvidence('operator-console'),
      protocols: ['http'],
      methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
      lease_ms: 60_000,
      reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
    },
    {
      route_id: 'site-operations-journey',
      route_class: 'site-operations',
      public_path: '/sites/' + SITE_ID + '/operations',
      route_mode: 'prefix',
      target_url: workbenchUrl,
      health_url: workbenchUrl + '/api/health',
      owner_id: 'site-operations:' + SITE_ID,
      site_id: SITE_ID,
      process_evidence: routeProcessEvidence('site-operations'),
      protocols: ['http'],
      methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
      lease_ms: 60_000,
      reconstruction: {
        kind: 'site-operation',
        site_root: siteRoot,
        site_id: SITE_ID,
        session_id: null,
      },
    },
    {
      route_id: 'agent-session-journey',
      route_class: 'agent-web-ui',
      public_path: '/sessions/' + SESSION_ID,
      route_mode: 'prefix',
      target_url: agentUrl,
      health_url: agentUrl + '/api/health',
      owner_id: 'agent-web-ui:' + SESSION_ID,
      site_id: SITE_ID,
      session_id: SESSION_ID,
      process_evidence: routeProcessEvidence('agent-session'),
      protocols: ['http'],
      methods: ['GET', 'HEAD'],
      lease_ms: 60_000,
      reconstruction,
    },
    {
      route_id: 'agent-events-journey',
      route_class: 'agent-web-ui',
      public_path: '/sessions/' + SESSION_ID + '/events',
      route_mode: 'exact',
      websocket_target_url: runtimeWebsocketUrl + '/events',
      health_url: agentUrl + '/api/health',
      owner_id: 'agent-web-ui:' + SESSION_ID + ':events',
      site_id: SITE_ID,
      session_id: SESSION_ID,
      process_evidence: routeProcessEvidence('agent-events'),
      protocols: ['websocket'],
      methods: ['GET'],
      lease_ms: 60_000,
      reconstruction,
    },
    {
      route_id: 'nars-artifact-journey',
      route_class: 'nars-artifact',
      backend_kind: 'nars-artifact',
      public_path: '/artifacts/' + encodeURIComponent(SESSION_ID),
      route_mode: 'prefix',
      owner_id: 'agent-web-ui:' + SESSION_ID + ':artifacts',
      site_id: SITE_ID,
      session_id: SESSION_ID,
      process_evidence: routeProcessEvidence('nars-artifact'),
      protocols: ['http'],
      methods: ['GET', 'HEAD'],
      lease_ms: 60_000,
      reconstruction,
    },
  ];
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { response, body };
}

function assertNoBackingUrl(value, backingUrls) {
  const text = String(value);
  for (const backingUrl of backingUrls) {
    const port = new URL(backingUrl).port;
    assert.equal(text.includes('127.0.0.1:' + port), false, 'backing URL leaked into operator-facing output');
  }
}

async function waitForEmptySockets(sockets) {
  const deadline = Date.now() + 2_000;
  while (sockets.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(sockets.size, 0, JSON.stringify(Array.from(sockets, (socket) => ({
    destroyed: socket.destroyed,
    readyState: socket.readyState,
    readableEnded: socket.readableEnded,
    writableEnded: socket.writableEnded,
    localPort: socket.localPort,
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
  }))));
}

function waitForChildExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.off('exit', onExit);
      reject(new Error('operator_console_process_exit_timeout'));
    }, timeoutMs);
    const onExit = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) onExit();
  });
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  try {
    await waitForChildExit(child);
    return;
  } catch (error) {
    if (child.exitCode === null) child.kill('SIGKILL');
    try {
      await waitForChildExit(child, 2_000);
      return;
    } catch {
      throw error;
    }
  }
}

async function waitForRouterRoutes(url, predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await fetchJson(url + '/routes');
      if (predicate(result.body)) return result.body;
    } catch {
      // The real CLI may still be starting its Router and projection.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('operator_console_route_projection_timeout');
}

async function waitForChildOutput(readOutput, needle, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readOutput().includes(needle)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('operator_console_startup_output_timeout:' + needle);
}

test('canonical operator journey remains usable through the stable Router', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-operator-journey-'));
  const siteRoot = join(root, 'journey-site');
  await mkdir(siteRoot, { recursive: true });
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  process.env.LOCALAPPDATA = root;
  let routerOwner = null;
  let routeSet = null;
  let consoleServer = null;
  let workbenchServer = null;
  let agentServer = null;
  let runtime = null;
  let browser = null;
  let launcherProcess = null;
  try {
    const session = await seedSession(siteRoot);
    await seedRegistry(root, siteRoot);
    runtime = await createRuntimeFixture();

    const routerPort = await reservePort();
    const routerStateRoot = join(root, 'operator-router');
    routerOwner = await ensureOperatorRouter({
      host: '127.0.0.1',
      port: routerPort,
      state_root: routerStateRoot,
      timeout_ms: 10_000,
    });
    assert.equal(routerOwner.ownership, 'started');
    assert.ok(routerOwner.child);
    const routerUrl = routerOwner.url;
    const routerWebsocketOrigin = new URL(routerUrl);
    routerWebsocketOrigin.protocol = routerWebsocketOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
    const publicEventEndpoint = new URL(`/sessions/${encodeURIComponent(SESSION_ID)}/events`, routerWebsocketOrigin).toString();

    consoleServer = await createConsoleServer({
      host: '127.0.0.1',
      port: 0,
      ingressMode: 'router',
      operatorRouterUrl: routerUrl,
    });
    const consoleUrl = await consoleServer.start();

    workbenchServer = await createWorkbenchServer({
      host: '127.0.0.1',
      port: 0,
      cwd: siteRoot,
      publicBasePath: '/sites/' + SITE_ID + '/operations',
    });
    const workbenchUrl = await workbenchServer.start();

    agentServer = createAgentWebUiServer({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: runtime.websocketUrl + '/events',
      healthEndpoint: runtime.url + '/health',
      publicBasePath: '/sessions/' + SESSION_ID,
      publicEventEndpoint,
      publicHealthEndpoint: routerUrl + '/sessions/' + SESSION_ID + '/api/health',
      publicArtifactBasePath: routerUrl + '/artifacts/' + encodeURIComponent(SESSION_ID),
      publicArtifactTransport: 'operator-router',
    });
    const agentUrl = await listen(agentServer);

    routeSet = await registerOperatorRouteSet({
      admin: {
        url: routerUrl,
        registration_token: routerOwner.registration_token,
      },
      routes: routeSetInput({
        consoleUrl,
        workbenchUrl,
        agentUrl,
        runtimeWebsocketUrl: runtime.websocketUrl,
        siteRoot,
      }),
      renew_interval_ms: 10_000,
    });

    const beforeRoutes = await fetchJson(routerUrl + '/routes');
    const expectedRouteIds = routeSet.route_ids.slice().sort();
    assert.deepEqual(beforeRoutes.body.routes.map((route) => route.route_id).sort(), expectedRouteIds);
    assert.equal(JSON.stringify(beforeRoutes.body).includes(consoleUrl), false);
    assert.equal(JSON.stringify(beforeRoutes.body).includes(workbenchUrl), false);
    assert.equal(JSON.stringify(beforeRoutes.body).includes(agentUrl), false);
    assert.equal(JSON.stringify(beforeRoutes.body).includes(runtime.url), false);
    assert.equal(JSON.stringify(beforeRoutes.body).includes(runtime.websocketUrl), false);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const backingUrls = [consoleUrl, workbenchUrl, agentUrl, runtime.url, runtime.websocketUrl];

    await page.goto(routerUrl + '/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('body[data-narada-surface="operator-workspace"]').count(), 1);
    assert.equal(await page.locator('a[data-surface-id="site-operations"]').count(), 1);
    assert.equal(await page.locator('a[data-surface-id="agent-sessions"]').count(), 1);
    assertNoBackingUrl(await page.content(), backingUrls);

    await page.locator('a[href="/console/registry"]').first().click();
    await page.waitForURL(routerUrl + '/console/registry');
    await page.getByText('Site Registry', { exact: true }).waitFor();
    assert.match(await page.locator('body').innerText(), new RegExp(SITE_ID));
    assertNoBackingUrl(await page.content(), backingUrls);

    await page.goto(routerUrl + '/console/registry/manage?site=' + SITE_ID + '&operation=edit', { waitUntil: 'domcontentloaded' });
    const siteSelect = page.getByLabel('Site record');
    await siteSelect.waitFor();
    await siteSelect.selectOption(SITE_ID);
    await page.getByText('More metadata', { exact: true }).click();
    await page.getByLabel('Purpose metadata (JSON)').fill(JSON.stringify({ purpose: UPDATED_PURPOSE }));
    await page.getByLabel('Reason').fill('verify canonical operator journey');
    const planResponsePromise = page.waitForResponse((response) =>
      response.url() === routerUrl + '/console/registry/api/operations/plan');
    await page.getByRole('button', { name: 'Preview change', exact: true }).click();
    const planResponse = await planResponsePromise;
    if (!planResponse.ok()) {
      throw new Error(`Registry plan failed with HTTP ${planResponse.status()}: ${await planResponse.text()}`);
    }
    try {
      await page.getByText('Preview ready.', { exact: true }).waitFor({ timeout: 10_000 });
    } catch (error) {
      throw new Error(String(error) + '\nMutation page state:\n' + await page.locator('body').innerText());
    }
    await page.getByLabel('I reviewed this preview and want to apply it.').check();
    const applyResponsePromise = page.waitForResponse((response) =>
      response.url() === routerUrl + '/console/registry/api/operations/apply');
    await page.getByRole('button', { name: 'Apply change', exact: true }).click();
    const applyResponse = await applyResponsePromise;
    assert.equal(applyResponse.status(), 200);
    await page.getByText('Change applied.', { exact: true }).waitFor();

    const changedRegistry = await fetchJson(routerUrl + '/console/registry/api/sites/' + SITE_ID);
    assert.equal(changedRegistry.response.status, 200);
    assert.match(JSON.stringify(changedRegistry.body), new RegExp(UPDATED_PURPOSE));

    const routerCsrfRefusal = await page.request.post(routerUrl + '/console/registry/api/operations/plan', {
      headers: {
        Origin: 'http://evil.example',
        'Content-Type': 'application/json',
      },
      data: { operation: 'edit', reference: SITE_ID, reason: 'foreign origin refusal' },
    });
    assert.equal(routerCsrfRefusal.status(), 421);

    const ownerCsrfRefusal = await page.request.post(consoleUrl + '/console/registry/api/operations/plan', {
      headers: {
        Origin: 'http://evil.example',
        'Content-Type': 'application/json',
      },
      data: { operation: 'edit', reference: SITE_ID, reason: 'foreign origin refusal' },
    });
    assert.equal(ownerCsrfRefusal.status(), 403);

    await page.goto(routerUrl + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('a[data-surface-id="site-operations"]').click();
    await page.waitForURL(routerUrl + '/sites/' + SITE_ID + '/operations');
    try {
      await page.getByRole('heading', { name: 'Task & Agent Operations', exact: true }).waitFor({ timeout: 10_000 });
    } catch (error) {
      throw new Error(String(error) + `\nSite Operations URL: ${page.url()}\nSite Operations body:\n${await page.locator('body').innerText()}`);
    }
    assert.match(await page.locator('body').innerText(), /Task & Agent Operations/);
    assertNoBackingUrl(await page.content(), backingUrls);

    await page.goto(routerUrl + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('a[data-surface-id="agent-sessions"]').click();
    await page.waitForURL(routerUrl + '/console/sessions');
    const agentPagePromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open', exact: true }).click();
    const agentPage = await agentPagePromise;
    const browserWebsocketUrls = [];
    agentPage.on('websocket', (socket) => browserWebsocketUrls.push(socket.url()));
    await agentPage.waitForURL(routerUrl + '/sessions/' + SESSION_ID);
    await agentPage.locator('#events').waitFor({ state: 'attached' });
    await agentPage.waitForFunction(() => document.querySelectorAll('#events > .event').length > 0);
    assert.match(await agentPage.locator('body').innerText(), new RegExp(JOURNEY_EVENT));
    assert.equal(JSON.parse(await agentPage.locator('#nars-config').textContent()).eventEndpoint, publicEventEndpoint);
    assert.equal(browserWebsocketUrls.includes(publicEventEndpoint), true);
    assert.equal(browserWebsocketUrls.includes(runtime.websocketUrl + '/events'), false);
    assert.equal(runtime.getWebsocketConnections() > 0, true);
    assertNoBackingUrl(await agentPage.content(), backingUrls);

    const artifactBase = routerUrl + '/artifacts/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(session.artifactId);
    await agentPage.goto(artifactBase, { waitUntil: 'domcontentloaded' });
    const artifactMetadata = await agentPage.locator('body').innerText();
    assert.match(artifactMetadata, new RegExp(session.artifactId));
    assert.equal(artifactMetadata.includes('source_path'), false);
    assertNoBackingUrl(await agentPage.content(), backingUrls);
    await agentPage.goto(artifactBase + '/content', { waitUntil: 'domcontentloaded' });
    assert.equal(await agentPage.locator('body').innerText(), 'router journey artifact content\n');
    assertNoBackingUrl(await agentPage.content(), backingUrls);

    const cliPackageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const cliEntrypoint = fileURLToPath(new URL('../../dist/main.js', import.meta.url));
    const launcherPort = await reservePort();
    const launcherRegistryPath = join(root, 'launcher-agents.json');
    const launcherTerminalLog = join(root, 'workspace-launch-terminal.jsonl');
    await writeFile(launcherRegistryPath, JSON.stringify({
      Agents: [{
        Agent: SITE_ID + '.resident',
        Role: 'resident',
        Site: SITE_ID,
        NaradaRoot: siteRoot,
        SiteRoot: siteRoot,
        WorkspaceRoot: siteRoot,
        LauncherPath: join(siteRoot, 'narada-router-journey.ps1'),
        OperatorSurface: 'agent-web-ui',
        Runtime: 'narada-agent-runtime-server',
      }],
    }), 'utf8');
    let launcherStdout = '';
    let launcherStderr = '';
    launcherProcess = spawn(process.execPath, [
      cliEntrypoint,
      'launcher',
      'workspace-launch',
      '--interactive-selection-ui',
      '--launcher-ui-port',
      String(launcherPort),
      '--launcher-ui-port-fallback',
      '--operator-router-port',
      String(routerPort),
      '--config-path',
      launcherRegistryPath,
      '--format',
      'json',
    ], {
      cwd: cliPackageRoot,
      env: {
        ...process.env,
        NARADA_OPERATOR_ROUTER_STATE_ROOT: routerStateRoot,
        NARADA_NO_BROWSER: '1',
        NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG: launcherTerminalLog,
        NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    launcherProcess.stdout?.on('data', (chunk) => { launcherStdout += String(chunk); });
    launcherProcess.stderr?.on('data', (chunk) => { launcherStderr += String(chunk); });
    await waitForChildOutput(() => launcherStdout, 'Narada launcher selection UI: ', 15_000);
    const launcherOutput = launcherStdout.match(/Narada launcher selection UI: (http:\/\/127\.0\.0\.1:\d+\/console\/launch\/sessions\/[^\r\n]+)/);
    assert.ok(launcherOutput, `launcher output did not contain a stable URL\nstdout:\n${launcherStdout}\nstderr:\n${launcherStderr}`);
    const launcherStableUrl = launcherOutput[1];
    const launcherStable = new URL(launcherStableUrl);
    assert.equal(launcherStable.origin, routerUrl);
    assert.match(launcherStable.pathname, /^\/console\/launch\/sessions\/[^/]+$/);
    assert.notEqual(launcherStable.port, String(launcherPort));
    const launcherDirectResponse = await fetch('http://127.0.0.1:' + launcherPort + '/');
    assert.equal(launcherDirectResponse.status, 200);
    const launcherRoutes = await fetchJson(routerUrl + '/routes');
    assert.equal(launcherRoutes.response.status, 200);
    const launcherRoutesText = JSON.stringify(launcherRoutes.body);
    assert.doesNotMatch(launcherRoutesText, /target_url|health_url/);
    assert.doesNotMatch(launcherRoutesText, new RegExp('127\\.0\\.0\\.1:' + launcherPort));
    await page.goto(launcherStableUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#sites').waitFor({ state: 'attached', timeout: 15_000 });
    assert.match(await page.locator('body').innerText(), /Agent Launcher/);
    assertNoBackingUrl(await page.content(), [...backingUrls, 'http://127.0.0.1:' + launcherPort]);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('heading', { name: 'Cancelled', exact: true }).waitFor({ timeout: 15_000 });
    await waitForChildExit(launcherProcess, 15_000);
    assert.equal(launcherProcess.exitCode, 0, `launcher exited unsuccessfully\nstdout:\n${launcherStdout}\nstderr:\n${launcherStderr}`);
    const closedLauncherResponse = await fetch(launcherStableUrl);
    assert.equal(closedLauncherResponse.status, 409);

    await agentPage.close();
    const stableRouterUrl = routerUrl;
    const stableRouterPort = Number(new URL(routerUrl).port);
    await stopEnsuredRouter(routerOwner);
    await waitForEmptySockets(runtime.sockets);
    routerOwner = await ensureOperatorRouter({
      host: '127.0.0.1',
      port: stableRouterPort,
      state_root: routerStateRoot,
      timeout_ms: 10_000,
    });
    assert.equal(routerOwner.ownership, 'started');
    assert.ok(routerOwner.child);
    const restartedRouterUrl = routerOwner.url;
    assert.equal(restartedRouterUrl, stableRouterUrl);

    const afterRoutes = await fetchJson(stableRouterUrl + '/routes');
    assert.deepEqual(afterRoutes.body.routes.map((route) => route.route_id).sort(), expectedRouteIds);
    assert.deepEqual(afterRoutes.body.routes.map((route) => route.public_path).sort(), beforeRoutes.body.routes.map((route) => route.public_path).sort());
    assert.equal(JSON.stringify(afterRoutes.body).includes(consoleUrl), false);
    assert.equal(JSON.stringify(afterRoutes.body).includes(workbenchUrl), false);
    assert.equal(JSON.stringify(afterRoutes.body).includes(agentUrl), false);
    assert.equal(JSON.stringify(afterRoutes.body).includes(runtime.url), false);
    assert.equal(JSON.stringify(afterRoutes.body).includes(runtime.websocketUrl), false);

    await page.goto(stableRouterUrl + '/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('body[data-narada-surface="operator-workspace"]').count(), 1);
    await page.locator('a[data-surface-id="agent-sessions"]').click();
    await page.waitForURL(stableRouterUrl + '/console/sessions');
    const restartedAgentPagePromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open', exact: true }).click();
    const restartedAgentPage = await restartedAgentPagePromise;
    await restartedAgentPage.waitForURL(stableRouterUrl + '/sessions/' + SESSION_ID);
    await restartedAgentPage.locator('#events').waitFor({ state: 'attached' });
    await restartedAgentPage.waitForFunction(() => document.querySelectorAll('#events > .event').length > 0);
    assert.match(await restartedAgentPage.locator('body').innerText(), new RegExp(JOURNEY_EVENT));
    assertNoBackingUrl(await restartedAgentPage.content(), backingUrls);
  } finally {
    await browser?.close();
    await stopChildProcess(launcherProcess).catch(() => undefined);
    await routeSet?.stop();
    await stopEnsuredRouter(routerOwner).catch(() => {
      if (routerOwner?.child && !routerOwner.child.killed) routerOwner.child.kill();
    });
    await consoleServer?.stop();
    await workbenchServer?.stop();
    await closeServer(agentServer);
    if (runtime) {
      for (const socket of runtime.sockets) socket.destroy();
      await closeServer(runtime.server);
    }
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    if (previousUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = previousUserSiteRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('real console startup projects the stable Router origin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-real-operator-startup-'));
  const stateRoot = join(root, 'operator-router');
  const userSiteRoot = join(root, 'Narada', '.registry');
  await mkdir(userSiteRoot, { recursive: true });
  const cliPackageRoot = fileURLToPath(new URL('../..', import.meta.url));
  const cliEntrypoint = fileURLToPath(new URL('../../dist/main.js', import.meta.url));
  const routerPort = await reservePort();
  const routerUrl = 'http://127.0.0.1:' + routerPort;
  const childEnvironment = {
    ...process.env,
    LOCALAPPDATA: root,
    NARADA_USER_SITE_ROOT: userSiteRoot,
    NARADA_OPERATOR_ROUTER_STATE_ROOT: stateRoot,
  };
  const child = spawn(process.execPath, [
    cliEntrypoint,
    'console',
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    String(routerPort),
  ], {
    cwd: cliPackageRoot,
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  let routerPid = null;
  let browser = null;
  try {
    await waitForRouterRoutes(routerUrl, (body) => body.routes?.some((route) =>
      route.route_id === 'operator-console' && route.state === 'healthy'));
    const lock = JSON.parse(await readFile(join(stateRoot, 'router.lock'), 'utf8'));
    assert.equal(typeof lock.pid, 'number');
    assert.notEqual(lock.pid, child.pid);
    routerPid = lock.pid;
    await waitForChildOutput(() => stdout, 'Operator Router: ' + routerUrl);
    await waitForChildOutput(() => stdout, 'Operator Console projection: started');
    assert.match(stdout, new RegExp('Operator Router: ' + routerUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(stdout, /Operator Console projection: started/);

    const health = await fetchJson(routerUrl + '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, 'healthy');

    const routes = await fetchJson(routerUrl + '/routes');
    assert.equal(routes.response.status, 200);
    assert.equal(routes.body.routes.some((route) => route.route_id === 'operator-console'), true);
    assert.equal(JSON.stringify(routes.body).includes('target_url'), false);
    assert.equal(JSON.stringify(routes.body).includes('health_url'), false);

    const workspace = await fetch(routerUrl + '/');
    const workspaceHtml = await workspace.text();
    assert.equal(workspace.status, 200);
    assert.match(workspaceHtml, /data-narada-surface="operator-workspace"/);
    assert.equal(workspaceHtml.includes('Operator Router:'), false);

    const registry = await fetch(routerUrl + '/console/registry');
    const registryHtml = await registry.text();
    assert.equal(registry.status, 200);
    assert.match(registryHtml, /<title>Operator Console - Sites<\/title>/);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(routerUrl + '/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('body[data-narada-surface="operator-workspace"]').count(), 1);
    await page.locator('a[href="/console/registry"]').first().click();
    await page.waitForURL(routerUrl + '/console/registry');
    await page.getByText('Site Registry', { exact: true }).waitFor();

    await browser.close();
    browser = null;
    await stopChildProcess(child);
    const routesAfterStop = await waitForRouterRoutes(routerUrl, (body) =>
      !body.routes?.some((route) => route.route_id === 'operator-console' && route.state === 'healthy'));
    const projectionAfterStop = routesAfterStop.routes.find((route) => route.route_id === 'operator-console');
    // ChildProcess.kill cannot emulate a Windows console Ctrl+C. The in-process
    // journey proves graceful unregister; the real-child path proves that a
    // terminated owner cannot remain healthy in the Router.
    assert.notEqual(projectionAfterStop?.state, 'healthy');
  } catch (error) {
    throw new Error(String(error) + `\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
      browser = null;
    }
    try {
      await stopChildProcess(child);
    } finally {
      try {
        if (routerPid !== null) {
          try {
            process.kill(routerPid, 'SIGTERM');
          } catch {
            // The Router may already have exited after a failed startup.
          }
          await waitForRouterUnavailable(routerUrl);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
});
