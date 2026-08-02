import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { projectOperatorWorkspaceRouteDirectory } from '@narada-core/operator-console-contract';
import { readOperatorConsoleUiAsset, readOperatorConsoleUiDocument } from '../../dist/commands/console-ui-assets.js';

/**
 * Evidence posture: fixture-boundary. The browser and Operator Console UI
 * are real, but this file supplies a deterministic hand-written API server
 * for state-matrix coverage. It does not prove launch, NARS health, session
 * indexing, or runtime attachment. Those claims belong to the real-launch
 * integration suite.
 */
const site = {
  site_id: 'site-a',
  site_root: 'D:/code/site-a',
  variant: 'native',
  substrate: 'windows',
  aim_json: '{"purpose":"browser fixture"}',
  control_endpoint: null,
  last_seen_at: '2026-07-12T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
  lifecycle_status: 'active',
  observation_status: 'present',
  sources: [{ kind: 'manual', ref: 'fixture', observed_at: '2026-07-12T00:00:00.000Z' }],
  aliases: [{ value: 'site-a-alias', source: 'fixture' }],
  revision: 4,
  retired_at: null,
  retire_reason: null,
};

const hostFleetSnapshot = {
  schema: 'narada.host_fleet.snapshot.v1',
  generated_at: '2026-08-01T12:00:00.000Z',
  hosts: [{
    schema: 'narada.host_fleet.host.v1',
    identity: { host_id: 'desktop', display_name: 'Desktop', platform: 'windows' },
    reachability: { status: 'reachable', observed_at: '2026-08-01T12:00:00.000Z' },
    health: { status: 'healthy', observed_at: '2026-08-01T12:00:00.000Z', detail: 'All host checks passed.' },
    operator_console: { status: 'available', url: 'https://desktop.example.test/console' },
  }],
};

const launchedAgentSessionId = 'session-agent-launched';

function siteAgent(agentId, role, runtimeState, workState, sessionId = null) {
  return {
    agent_id: agentId,
    local_agent_id: agentId.split('.').at(-1),
    title: role[0].toUpperCase() + role.slice(1),
    role,
    admission_status: 'admitted',
    runtime: {
      state: runtimeState,
      session_count: runtimeState === 'stopped' ? 0 : runtimeState === 'ambiguous' ? 2 : 1,
      healthy_session_ids: sessionId ? [sessionId] : runtimeState === 'ambiguous' ? ['session-a', 'session-b'] : [],
      selected_session_id: sessionId,
    },
    work: { state: workState, detail: null, source: 'principal-runtime' },
    operator_surfaces: {
      default_kind: 'agent-web-ui',
      choices: [
        { kind: 'agent-web-ui', label: 'Web UI', status: 'available', reason: null },
        { kind: 'agent-cli', label: 'CLI', status: 'available', reason: null },
        { kind: 'agent-tui', label: 'TUI', status: 'available', reason: null },
      ],
    },
    actions: {
      start: runtimeState === 'stopped',
      inspect: runtimeState === 'running' && Boolean(sessionId),
      inspect_reason: runtimeState === 'ambiguous'
        ? 'Multiple healthy sessions exist.'
        : 'No single healthy session is available.',
    },
  };
}

function siteAgentOverview(launched, { userSiteResidentAmbiguous = false } = {}) {
  return {
    schema: 'narada.operator_console.site_agent_overview.v1',
    status: 'success',
    generated_at: '2026-07-18T00:00:00.000Z',
    refusals: [],
    groups: [
      {
        id: 'personal-infrastructure',
        label: 'User and Host',
        sites: [
          {
            site_id: 'user-site',
            display_name: 'User Site',
            site_kind: 'user_site',
            group_id: 'personal-infrastructure',
            observation_status: 'present',
            agents: [siteAgent(
              'user-site.resident',
              'resident',
              userSiteResidentAmbiguous ? 'ambiguous' : 'running',
              'available',
              userSiteResidentAmbiguous ? null : 'session-user-resident',
            )],
          },
          {
            site_id: 'desktop-host',
            display_name: 'Desktop Host',
            site_kind: 'pc_site',
            group_id: 'personal-infrastructure',
            observation_status: 'present',
            agents: [],
          },
        ],
      },
      {
        id: 'sites',
        label: 'Sites',
        sites: [{
          site_id: 'site-a',
          display_name: 'Site A',
          site_kind: 'site',
          group_id: 'sites',
          observation_status: 'present',
          agents: [
            siteAgent(
              'site-a.resident',
              'resident',
              launched ? 'running' : 'stopped',
              launched ? 'executing' : 'available',
              launched ? launchedAgentSessionId : null,
            ),
            siteAgent('site-a.architect', 'architect', 'ambiguous', 'claiming'),
          ],
        }],
      },
    ],
  };
}

const activeAgentSession = {
  session_id: 'session-agent-active',
  site_id: 'site-a',
  agent_id: 'site-a.resident',
  runtime_kind: 'narada-agent-runtime-server',
  launch_operator_surface_kind: 'agent-web-ui',
  started_at: '2026-07-12T00:00:00.000Z',
  last_seen_at: '2026-07-12T00:01:00.000Z',
  terminal_state: null,
  display_state: 'active',
  display_state_reason: 'health_probe_succeeded',
  heartbeat_fresh: true,
  heartbeat_age_ms: 1000,
  health_status: 'healthy',
};

const retiredSite = {
  ...site,
  site_id: 'retired-site',
  site_root: 'D:/code/retired-site',
  lifecycle_status: 'retired',
  observation_status: 'stale',
  retired_at: '2026-07-10T00:00:00.000Z',
  retire_reason: 'fixture retirement',
};


function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function wireSite(overrides = {}) {
  return { ...site, ...overrides };
}


function mutationResponse(input, applied) {
  const operation = input.operation;
  const siteId = input.site_id || input.reference || 'site-a';
  if (!applied && operation === 'add' && input.site_id === 'retired-site' && input.re_admit !== true) {
    return {
      schema: 'narada.site_registry.management.v0',
      status: 'refused',
      operation,
      mutation_performed: false,
      site_id: siteId,
      registry_path: 'D:/registry.sqlite',
      catalog_source: 'user_site_site_registry',
      before: retiredSite,
      after: null,
      changes: [],
      conflicts: [],
      refusals: ['retired_record_requires_restore_or_re_admit'],
      audit_ref: null,
      confirmation_required: null,
    };
  }
  const current = input.reference === 'retired-site' ? retiredSite : site;
  const before = operation === 'add' ? null : wireSite(current);
  const after = operation === 'purge'
    ? null
    : wireSite({ ...current,
        site_id: siteId,
        site_root: input.root || current.site_root,
        variant: input.variant || current.variant,
        substrate: input.substrate || current.substrate,
        lifecycle_status: operation === 'retire' ? 'retired' : 'active',
        revision: operation === 'add' ? 1 : current.revision + (applied ? 1 : 0),
      });
  return {
    schema: 'narada.site_registry.management.v0',
    status: applied ? 'applied' : 'planned',
    operation,
    mutation_performed: applied,
    site_id: siteId,
    registry_path: 'D:/registry.sqlite',
    catalog_source: 'user_site_site_registry',
    before,
    after,
    changes: [operation + (applied ? ' applied' : ' planned')],
    conflicts: [],
    refusals: [],
    audit_ref: applied ? 'audit-fixture-1' : null,
    confirmation_required: operation === 'purge' && !applied ? siteId : null,
  };
}

async function startFixtureServer({
  agentSessions = [],
  userSiteResidentAmbiguous = false,
  intelligenceSetupRequired = false,
  routeDirectoryUnavailable = false,
  launchDelayMs = 0,
} = {}) {
  const requests = [];
  let onboardingStarted = false;
  let siteAgentLaunched = false;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && pathname === '/console/routes') {
        if (routeDirectoryUnavailable) {
          sendJson(res, 503, { error: 'route_directory_unavailable' });
          return;
        }
        const sessionRoutes = agentSessions.map((session) => ({
          id: `router-${session.session_id}`,
          path: `/sessions/${session.session_id}`,
          kind: 'page',
          label: `Session ${session.session_id}`,
          target: { kind: 'session', id: session.session_id },
        }));
        if (siteAgentLaunched) sessionRoutes.push({
          id: `router-${launchedAgentSessionId}`,
          path: `/sessions/${launchedAgentSessionId}`,
          kind: 'page',
          label: `Session ${launchedAgentSessionId}`,
          target: { kind: 'session', id: launchedAgentSessionId },
        });
        sendJson(res, 200, projectOperatorWorkspaceRouteDirectory({
          workspaceHost: { kind: 'local', id: 'fixture', origin: null },
          additionalRoutes: sessionRoutes.length ? { 'agent-sessions': sessionRoutes } : undefined,
        }));
        return;
      }
      if (req.method === 'GET' && pathname === '/console/agents/api/session-route') {
        const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const siteId = requestUrl.searchParams.get('site_id');
        const agentId = requestUrl.searchParams.get('agent_id');
        const sessionId = requestUrl.searchParams.get('session_id');
        const scopedPath = `/console/sessions?site=${encodeURIComponent(siteId ?? '')}&agent=${encodeURIComponent(agentId ?? '')}`;
        if (siteId !== 'site-a' || agentId !== 'site-a.resident' || (sessionId && sessionId !== launchedAgentSessionId)) {
          sendJson(res, 409, {
            schema: 'narada.operator_console.agent_session_route.v1',
            status: 'refused', site_id: siteId, agent_id: agentId, session_id: sessionId,
            url: null, sessions_path: scopedPath, reason: 'launch_session_mismatch', phase: 'refused',
          });
          return;
        }
        sendJson(res, 200, {
          schema: 'narada.operator_console.agent_session_route.v1',
          status: siteAgentLaunched ? 'ready' : 'pending',
          site_id: siteId,
          agent_id: agentId,
          session_id: siteAgentLaunched ? launchedAgentSessionId : sessionId,
          url: siteAgentLaunched ? `/sessions/${launchedAgentSessionId}` : null,
          sessions_path: scopedPath,
          reason: null,
          phase: siteAgentLaunched ? 'ready' : 'waiting_for_session',
        });
        return;
      }
      if (req.method === 'GET' && ['/console/agents', '/console/fleet', '/console/registry', '/console/registry/add', '/console/registry/manage', '/console/launch', '/console/onboarding', '/console/sessions'].includes(pathname)) {
        const body = readOperatorConsoleUiDocument();
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && pathname === `/sessions/${launchedAgentSessionId}`) {
        const body = `<!doctype html><html><body><main><h1>Agent Web UI</h1><p>${launchedAgentSessionId}</p></main></body></html>`;
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && pathname === '/console/agents/api/overview') {
        sendJson(res, 200, siteAgentOverview(siteAgentLaunched, { userSiteResidentAmbiguous }));
        return;
      }
      if (req.method === 'GET' && pathname === '/console/fleet/api/hosts') {
        sendJson(res, 200, hostFleetSnapshot);
        return;
      }
      if (req.method === 'GET' && pathname === '/console/agents/api/pending') {
        sendJson(res, 200, {
          schema: 'narada.operator_console.agent_pending.v1',
          status: 'success',
          pending: [],
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/console/agents/api/launch') {
        const input = await readJson(req);
        requests.push({ pathname, input });
        if (input.site_id !== 'site-a' || input.agent_id !== 'site-a.resident') {
          sendJson(res, 409, {
            schema: 'narada.operator_console.agent_launch.v1',
            status: 'refused',
            site_id: input.site_id,
            agent_id: input.agent_id,
            session_id: null,
            reason: 'agent_not_admitted',
          });
          return;
        }
        if (launchDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, launchDelayMs));
        siteAgentLaunched = true;
        sendJson(res, 200, {
          schema: 'narada.operator_console.agent_launch.v1',
          status: 'launched',
          site_id: input.site_id,
          agent_id: input.agent_id,
          session_id: launchedAgentSessionId,
          reason: null,
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/console/onboarding/api/status') {
        sendJson(res, 200, {
          schema: 'narada.operator_console.onboarding.v1',
          status: 'success',
          ui_state: onboardingStarted
            ? 'healthy'
            : intelligenceSetupRequired
              ? 'needs-intelligence-setup'
              : 'ready',
          posture: onboardingStarted
            ? 'healthy'
            : intelligenceSetupRequired
              ? 'needs-intelligence-setup'
              : 'ready',
          doctor: {
            schema: 'narada.doctor.bootstrap.v1',
            status: intelligenceSetupRequired ? 'healthy' : 'ready',
            intelligence_catalog_readiness: intelligenceSetupRequired
              ? {
                  status: 'needs_setup',
                  next_action: 'Initialize the Site catalog before launching NARS.',
                }
              : undefined,
            provider_readiness: [{ provider: 'codex-subscription', status: intelligenceSetupRequired ? 'check_required' : 'ready' }],
          },
          onboarding: onboardingStarted
            ? {
                schema: 'narada.onboarding.status.v1',
                status: 'first_use_verified',
                user_site: { root: 'D:/Narada', resident_agent: 'resident' },
                verification: { status: 'verified' },
                next_action: 'Continue to Agent Sessions.',
              }
            : {
                schema: 'narada.onboarding.status.v1',
                status: 'not_started',
                user_site: { root: 'D:/Narada', resident_agent: 'resident' },
                session: null,
                verification: null,
                next_action: 'Start your assistant.',
              },
          handoff: onboardingStarted
            ? {
                kind: 'browser',
                status: 'ready',
                url: '/agent-web-ui/session-user-resident',
                session_id: 'session-user-resident',
                message: 'Agent Web UI is ready.',
              }
            : null,
          setup_actions: intelligenceSetupRequired
            ? [
                {
                  id: 'initialize-intelligence-catalog',
                  kind: 'command',
                  label: 'Initialize catalog and retry onboarding',
                  command: 'narada onboarding start --scope user-site',
                  description: 'Populate the User Site catalog and retry the resident launch.',
                },
              ]
            : [],
          next_action: onboardingStarted ? 'Continue to Agent Sessions.' : 'Start your assistant.',
          actions: { start: !onboardingStarted && !intelligenceSetupRequired, demo: !onboardingStarted },
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/console/onboarding/api/start') {
        const input = await readJson(req);
        requests.push({ pathname, input });
        onboardingStarted = true;
        sendJson(res, 200, {
          schema: 'narada.operator_console.onboarding.v1',
          status: 'success',
          ui_state: 'starting',
          posture: 'starting',
          doctor: {
            schema: 'narada.doctor.bootstrap.v1',
            status: 'ready',
            provider_readiness: [{ provider: 'codex-subscription', status: 'ready' }],
          },
          onboarding: {
            schema: 'narada.onboarding.start.v1',
            status: 'launched',
            next_action: 'Wait for the resident session.',
            launch: null,
          },
          next_action: 'Wait for the resident session.',
          actions: { start: false, demo: false },
          handoff: {
            kind: 'browser',
            status: 'pending',
            url: null,
            session_id: null,
            message: 'Waiting for the Agent Web UI readiness artifact.',
          },
          setup_actions: [],
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/console/sessions/api/sessions') {
        sendJson(res, 200, {
          schema: 'narada.operator_console.agent_sessions.v1',
          status: 'success',
          generated_at: '2026-07-12T00:01:00.000Z',
          count: agentSessions.length,
          sessions: agentSessions,
          refusals: [],
        });
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/console/assets/')) {
        const asset = readOperatorConsoleUiAsset(pathname);
        if (!asset) {
          sendJson(res, 404, { error: 'asset_not_found' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': asset.contentType,
          'Content-Length': asset.body.byteLength,
        });
        res.end(asset.body);
        return;
      }
      if (req.method === 'GET' && pathname === '/console/registry/api/sites') {
        sendJson(res, 200, {
          schema: 'narada.site_registry.management.v0',
          status: 'success',
          operation: 'list',
          mutation_performed: false,
          registry_path: 'D:/registry.sqlite',
          catalog_source: 'user_site_site_registry',
          count: 1,
          sites: [site],
        });
        return;
      }
      if (req.method === 'GET' && (pathname === '/console/registry/api/sites/site-a' || pathname === '/console/registry/api/sites/retired-site')) {
        const record = pathname.endsWith('/retired-site') ? retiredSite : site;
        sendJson(res, 200, {
          schema: 'narada.site_registry.management.v0',
          status: 'success',
          operation: 'show',
          mutation_performed: false,
          registry_path: 'D:/registry.sqlite',
          catalog_source: 'user_site_site_registry',
          site_id: 'site-a',
          site: record,
          management_audit: [],
          next_actions: ['edit', 'retire'],
        });
        return;
      }
      if (req.method === 'POST' && (pathname === '/console/registry/api/operations/plan' || pathname === '/console/registry/api/operations/apply')) {
        const input = await readJson(req);
        requests.push({ pathname, input });
        sendJson(res, 200, mutationResponse(input, pathname.endsWith('/apply')));
        return;
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const url = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('fixture_server_address_unavailable'));
        return;
      }
      resolve('http://127.0.0.1:' + address.port);
    });
  });

  return {
    url,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function assertNoHorizontalOverflow(page, viewport) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(widths.document <= widths.viewport, viewport + ' document overflow: ' + JSON.stringify(widths));
  assert.ok(widths.body <= widths.viewport, viewport + ' body overflow: ' + JSON.stringify(widths));
}

test('[fixture-boundary] Operator Console Vue registry projection works at desktop and mobile widths', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry');
    await page.locator('.site-tile').waitFor();
    assert.equal(await page.locator('.site-tile').count(), 1);
    assert.equal(await page.locator('.site-tile__name').textContent(), 'site-a');
    await page.locator('.site-tile').click();
    await page.waitForFunction(() => document.querySelector('.site-detail h2')?.textContent === 'site-a');
    assert.ok((await page.locator('.site-detail').textContent()).includes('D:/code/site-a'));
    await assertNoHorizontalOverflow(page, 'operator console desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator('.site-tile').waitFor();
    await assertNoHorizontalOverflow(page, 'operator console mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console Host Fleet renders the bounded host-only projection', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const response = await page.goto(fixture.url + '/console/fleet');
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { level: 1, name: 'Hosts' }).waitFor();
    await page.getByRole('rowheader', { name: /Desktop/ }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    assert.match(await page.locator('tbody').textContent() ?? '', /reachable/);
    assert.match(await page.locator('tbody').textContent() ?? '', /healthy/);
    assert.equal(await page.getByRole('link', { name: 'Open' }).getAttribute('href'), 'https://desktop.example.test/console');
    assert.doesNotMatch(await page.locator('tbody').textContent() ?? '', /site|agent|session|runtime/i);
    await assertNoHorizontalOverflow(page, 'host fleet desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('rowheader', { name: /Desktop/ }).waitFor();
    await assertNoHorizontalOverflow(page, 'host fleet mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('LIVE Operator Console reproduces ambiguous resident action on the running surface', { skip: !process.env.NARADA_LIVE_OPERATOR_CONSOLE_E2E }, async () => {
  const baseUrl = process.env.NARADA_OPERATOR_CONSOLE_BASE_URL ?? 'http://127.0.0.1:61729';
  const siteId = process.env.NARADA_LIVE_OPERATOR_CONSOLE_SITE_ID ?? 'andrey-user';
  const agentId = process.env.NARADA_LIVE_OPERATOR_CONSOLE_AGENT_ID ?? `${siteId}.resident`;
  const overviewResponse = await fetch(`${baseUrl}/console/agents/api/overview`);
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  const agent = overview.groups
    .flatMap((group) => group.sites)
    .find((siteRecord) => siteRecord.site_id === siteId)?.agents
    .find((siteAgentRecord) => siteAgentRecord.agent_id === agentId);
  assert.ok(agent, `live Agent overview did not contain ${agentId}`);
  assert.equal(agent.runtime.state, 'ambiguous');
  assert.ok(agent.runtime.healthy_session_ids.length >= 2);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const launchRequests = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/console/agents/api/launch')) launchRequests.push(request.url());
    });
    await page.goto(`${baseUrl}/console/agents`, { waitUntil: 'domcontentloaded' });
    const resident = page.locator(`button[aria-label^="${agentId}:"]`).first();
    await resident.waitFor({ state: 'attached', timeout: 60_000 });
    await resident.evaluate((button) => button.click());
    await page.getByText('Multiple healthy sessions exist. Choose one from Agent Sessions.', { exact: true }).waitFor();
    assert.equal(launchRequests.length, 0);
  } finally {
    await browser.close();
  }
});

test('[fixture-boundary] Operator Console Sites and Agents groups authority, launches admitted agents, and routes inspection', async () => {
  const fixture = await startFixtureServer({ agentSessions: [
    { ...activeAgentSession, session_id: 'session-a', agent_id: 'site-a.architect' },
    { ...activeAgentSession, session_id: 'session-b', agent_id: 'site-a.architect' },
    { ...activeAgentSession, session_id: 'session-unrelated-site', site_id: 'site-b', agent_id: 'site-b.architect' },
    { ...activeAgentSession, session_id: 'session-unrelated-agent', agent_id: 'site-a.resident' },
  ] });
  const browser = await chromium.launch();
  try {
    await mkdir('test-results', { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const response = await page.goto(fixture.url + '/console/agents');
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { level: 2, name: 'Sites and Agents' }).waitFor();
    await page.getByRole('heading', { level: 3, name: 'User and Host' }).waitFor();
    await page.getByRole('heading', { level: 3, name: 'Sites' }).waitFor();
    assert.equal(await page.locator('.site-box').count(), 3);
    assert.equal(await page.locator('.agent-cell').count(), 3);
    await page.getByRole('button', { name: 'site-a.resident: stopped, work available' }).waitFor();
    await page.getByRole('button', { name: 'site-a.architect: ambiguous, work claiming' }).waitFor();
    await assertNoHorizontalOverflow(page, 'sites and agents desktop');
    await page.screenshot({ path: 'test-results/operator-console-sites-agents-desktop.png', fullPage: true });

    const resident = page.getByRole('button', { name: 'site-a.resident: stopped, work available' });
    await resident.focus();
    await resident.press('Shift+F10');
    await page.getByText('No single healthy session is available.').waitFor();
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await resident.evaluate((element) => element === document.activeElement), true);

    const architect = page.getByRole('button', { name: 'site-a.architect: ambiguous, work claiming' });
    await architect.focus();
    await architect.press('Shift+F10');
    await page.waitForURL('**/console/sessions?site=site-a&agent=site-a.architect');
    assert.equal(new URL(page.url()).search, '?site=site-a&agent=site-a.architect');

    await page.goto(fixture.url + '/console/agents');
    const pointerArchitect = page.getByRole('button', { name: 'site-a.architect: ambiguous, work claiming' });
    await pointerArchitect.click({ button: 'right' });
    await page.waitForURL('**/console/sessions?site=site-a&agent=site-a.architect');
    await page.getByText('session-a').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 2);
    assert.equal(await page.getByText('session-unrelated-site').count(), 0);
    assert.equal(await page.getByText('session-unrelated-agent').count(), 0);
    const scopedLinks = await page.getByRole('link', { name: 'Open' }).evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    assert.deepEqual(scopedLinks.sort(), ['/sessions/session-a', '/sessions/session-b']);

    await page.goto(fixture.url + '/console/agents');
    await page.getByRole('button', { name: 'site-a.resident: stopped, work available' }).waitFor();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'site-a.resident: stopped, work available' }).evaluate((button) => {
      button.click();
      button.click();
    });
    const popup = await popupPromise;
    await popup.waitForURL(`**/sessions/${launchedAgentSessionId}`);
    await popup.getByRole('heading', { name: 'Agent Web UI' }).waitFor();
    assert.equal(await popup.getByText(launchedAgentSessionId).isVisible(), true);
    assert.deepEqual(fixture.requests.at(-1), {
      pathname: '/console/agents/api/launch',
      input: { site_id: 'site-a', agent_id: 'site-a.resident', operator_surface: 'agent-web-ui' },
    });
    assert.equal(fixture.requests.filter((request) => request.pathname === '/console/agents/api/launch').length, 1);
    await page.getByText('site-a.resident started. Its Web UI opens when the route is ready.').waitFor();
    await page.getByRole('button', { name: 'site-a.resident: running, work executing' }).waitFor();
    await popup.close();

    const inspectPopupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'site-a.resident: running, work executing' }).click({ button: 'right' });
    const inspectPopup = await inspectPopupPromise;
    await inspectPopup.waitForURL(`**/sessions/${launchedAgentSessionId}`);
    await inspectPopup.close();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'site-a.resident: running, work executing' }).waitFor();
    await assertNoHorizontalOverflow(page, 'sites and agents mobile');
    await page.screenshot({ path: 'test-results/operator-console-sites-agents-mobile.png', fullPage: true });
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console scopes transient starting state by Site-qualified agent identity', async () => {
  const fixture = await startFixtureServer({ launchDelayMs: 750 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/agents');
    const siteResident = page.getByRole('button', { name: 'site-a.resident: stopped, work available' });
    const userResident = page.getByRole('button', { name: 'user-site.resident: running, work available' });
    await siteResident.waitFor();
    await userResident.waitFor();

    const popupPromise = page.waitForEvent('popup');
    await siteResident.click();
    const popup = await popupPromise;
    await page.getByText('Web UI: starting site-a.resident...', { exact: true }).waitFor();
    assert.match(await siteResident.textContent() ?? '', /starting/);
    assert.doesNotMatch(await userResident.textContent() ?? '', /starting/);
    await popup.close();

    await page.getByText('site-a.resident started. Its Web UI opens when the route is ready.', { exact: true }).waitFor();
    assert.equal(fixture.requests.filter((request) => request.pathname === '/console/agents/api/launch').length, 1);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console reproduces user-site ambiguous resident with empty Agent Sessions inventory', async () => {
  const fixture = await startFixtureServer({ userSiteResidentAmbiguous: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/agents');
    const resident = page.getByRole('button', { name: 'user-site.resident: ambiguous, work available' });
    await resident.waitFor();

    await resident.click();
    await page.getByText('Multiple healthy sessions exist. Choose one from Agent Sessions.').waitFor();

    await resident.click({ button: 'right' });
    await page.waitForURL('**/console/sessions?site=user-site&agent=user-site.resident');
    await page.getByText('No NARS sessions are currently discoverable.').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 0);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console session inventory renders canonical lifecycle posture without overflow', async () => {
  const fixture = await startFixtureServer({ agentSessions: [activeAgentSession] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/sessions');
    await page.getByRole('heading', { level: 2, name: 'Agent Sessions' }).waitFor();
    await page.getByText('session-agent-active').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    assert.ok((await page.locator('tbody').textContent()).includes('active'));
    await assertNoHorizontalOverflow(page, 'agent sessions desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByText('session-agent-active').waitFor();
    await assertNoHorizontalOverflow(page, 'agent sessions mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console launch page renders the site runtime view and rejects unknown routes', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const response = await page.goto(fixture.url + '/console/launch');
    assert.equal(response?.status(), 200);
    await page.getByRole('main').getByRole('heading', { name: 'Site Runtime' }).waitFor();
    await page.locator('.site-tile').waitFor();
    assert.equal(await page.locator('.site-tile__name').textContent(), 'site-a');

    const unknown = await fetch(fixture.url + '/console/not-found');
    assert.equal(unknown.status, 404);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console first-use onboarding projects ready, starting, and healthy states', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const response = await page.goto(fixture.url + '/console/onboarding');
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { level: 2, name: 'Start with one assistant' }).waitFor();
    await page.getByText('Ready to start', { exact: true }).waitFor();
    const startButton = page.getByRole('button', { name: 'Start my assistant' });
    await startButton.click();
    await page.getByText('Starting your assistant').waitFor();
    assert.equal(await startButton.isDisabled(), true, 'a live start must remain disabled while it is settling');
    assert.equal(fixture.requests.filter((request) => request.pathname === '/console/onboarding/api/start').length, 1);
    await page.getByText('Assistant is ready').waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('link', { name: 'Open Operator Workspace' }).getAttribute('href'), '/');
    assert.equal(await page.getByRole('link', { name: 'Add a Site' }).getAttribute('href'), '/console/registry/add');
    assert.equal(await page.getByRole('link', { name: 'Open Agent Web UI' }).getAttribute('href'), '/agent-web-ui/session-user-resident');
    await page.getByRole('link', { name: 'Open Operator Workspace' }).waitFor();
    await page.getByRole('link', { name: 'Add a Site' }).waitFor();
    assert.deepEqual(fixture.requests[0], {
      pathname: '/console/onboarding/api/start',
      input: { mode: 'live', confirm: true },
    });
    await assertNoHorizontalOverflow(page, 'first-use onboarding desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page, 'first-use onboarding mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console onboarding exposes intelligence setup and pauses Site mutation navigation', async () => {
  const fixture = await startFixtureServer({ intelligenceSetupRequired: true, routeDirectoryUnavailable: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/onboarding');
    await page.getByText('Intelligence setup needed', { exact: true }).waitFor();
    await page.getByText('narada onboarding start --scope user-site', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start my assistant' }).isDisabled(), true);
    assert.equal(await page.getByRole('link', { name: 'Add a Site' }).count(), 0);
    await assertNoHorizontalOverflow(page, 'intelligence setup onboarding');
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console Vue exposes retired-record recovery and exact purge confirmation', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry/add');
    await page.getByLabel('Canonical Site ID').fill('retired-site');
    await page.getByLabel('Site root folder').fill('D:/code/retired-site');
    await page.getByRole('button', { name: 'Preview change' }).click();
    await page.getByText('The registry refused this operation.').waitFor();
    assert.equal(fixture.requests[0].input.re_admit, undefined);
    assert.equal(await page.getByText('Use the retired record').isVisible(), true);

    await page.getByLabel('Use the retired record').check();
    await page.getByRole('button', { name: 'Preview change' }).click();
    assert.equal(fixture.requests[1].input.re_admit, true);
    await page.getByText('Preview ready.').waitFor();

    await page.goto(fixture.url + '/console/registry/manage?site=retired-site&operation=purge');
    await page.getByLabel('Site record').waitFor();
    await page.getByLabel('Reason').fill('fixture purge');
    await page.getByRole('button', { name: 'Preview change' }).click();
    await page.getByText('Preview ready.').waitFor();
    assert.equal(await page.locator('.purge-confirm input').isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Apply change' }).isDisabled(), true);
    await page.locator('.purge-confirm input').fill('retired-site');
    await page.getByLabel('I reviewed this preview and want to apply it.').check();
    await page.getByRole('button', { name: 'Apply change' }).click();
    await page.getByText('Change applied.').waitFor();
    assert.equal(fixture.requests[3].input.confirm_site_id, 'retired-site');
    assert.equal(fixture.requests[3].input.confirm_apply, true);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('[fixture-boundary] Operator Console Vue mutation pages preserve plan/apply and revision safeguards', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry/add');
    await page.getByLabel('Canonical Site ID').fill('new-site');
    await page.getByLabel('Site root folder').fill('D:/code/new-site');
    await page.getByRole('button', { name: 'Preview change' }).click();
    await page.getByText('Preview ready.').waitFor();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].pathname, '/console/registry/api/operations/plan');
    assert.equal(fixture.requests[0].input.operation, 'add');
    assert.equal(fixture.requests[0].input.site_id, 'new-site');
    assert.equal(fixture.requests[0].input.root, 'D:/code/new-site');
    assert.equal(await page.getByRole('button', { name: 'Apply change' }).isDisabled(), true);

    await page.getByLabel('I reviewed this preview and want to apply it.').check();
    await page.getByRole('button', { name: 'Apply change' }).click();
    await page.getByText('Change applied.').waitFor();
    assert.equal(fixture.requests.length, 2);
    assert.equal(fixture.requests[1].pathname, '/console/registry/api/operations/apply');
    assert.equal(fixture.requests[1].input.confirm_apply, true);

    await page.goto(fixture.url + '/console/registry/manage?site=site-a&operation=edit');
    await page.getByLabel('Site record').waitFor();
    await page.getByLabel('Site root folder').fill('D:/code/site-a-renamed');
    await page.getByRole('button', { name: 'Preview change' }).click();
    await page.getByText('Preview ready.').waitFor();
    assert.equal(fixture.requests[2].input.operation, 'edit');
    assert.equal(fixture.requests[2].input.reference, 'site-a');
    assert.equal(fixture.requests[2].input.expected_revision, 4);

    await page.getByLabel('I reviewed this preview and want to apply it.').check();
    await page.getByRole('button', { name: 'Apply change' }).click();
    await page.getByText('Change applied.').waitFor();
    assert.equal(fixture.requests[3].input.confirm_apply, true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await assertNoHorizontalOverflow(page, 'mutation mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});
