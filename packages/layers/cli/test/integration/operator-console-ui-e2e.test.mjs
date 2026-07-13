import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { readOperatorConsoleUiAsset, readOperatorConsoleUiDocument } from '../../dist/commands/console-ui-assets.js';

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

const retiredSite = {
  ...site,
  site_id: 'retired-site',
  site_root: 'D:/code/retired-site',
  lifecycle_status: 'retired',
  observation_status: 'stale',
  retired_at: '2026-07-10T00:00:00.000Z',
  retire_reason: 'fixture retirement',
};

const activeLauncherSession = {
  schema: 'narada.workspace_launch.ui_session.v1',
  ui_session_id: 'ui-session-active',
  started_at: '2026-07-12T00:00:00.000Z',
  status: 'open',
  url: 'http://127.0.0.1:47320/',
  registry_paths: ['D:/code/registry.sqlite'],
  owner: {
    package: '@narada2/cli',
    command: 'launcher workspace-launch',
    surface: 'interactive-selection-ui',
  },
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

function projectLauncherSessions(sessions) {
  return sessions.map((session) => ({
    ...session,
    url: `/console/launch/sessions/${encodeURIComponent(session.ui_session_id)}`,
  }));
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

async function startFixtureServer({ launcherSessions = [] } = {}) {
  const requests = [];
  const launcherRequests = [];
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && ['/console/registry', '/console/registry/add', '/console/registry/manage', '/console/launch'].includes(pathname)) {
        const body = readOperatorConsoleUiDocument();
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && pathname === '/console/launch/api/sessions') {
        launcherRequests.push(pathname);
        sendJson(res, 200, {
          schema: 'narada.workspace_launch.ui_session_list.v1',
          sessions: projectLauncherSessions(launcherSessions),
        });
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/console/registry/assets/')) {
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
    launcherRequests,
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

test('Operator Console Vue registry projection works at desktop and mobile widths', async () => {
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

test('Operator Console opens active CLI sessions through a stable route and fails closed on malformed inventory', async () => {
  const activeFixture = await startFixtureServer({ launcherSessions: [activeLauncherSession] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(activeFixture.url + '/console/launch');
    await page.getByRole('link', { name: 'Open launcher' }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: 'Open launcher' }).getAttribute('href'),
      '/console/launch/sessions/ui-session-active',
    );
    assert.deepEqual(activeFixture.launcherRequests, ['/console/launch/api/sessions']);
  } finally {
    await browser.close();
    await activeFixture.close();
  }

  const malformedFixture = await startFixtureServer({
    launcherSessions: [{ ...activeLauncherSession, status: 'running' }],
  });
  const malformedBrowser = await chromium.launch();
  try {
    const page = await malformedBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(malformedFixture.url + '/console/launch');
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /did not match its contract/);
    assert.equal(await page.getByRole('link', { name: 'Open launcher' }).count(), 0);
  } finally {
    await malformedBrowser.close();
    await malformedFixture.close();
  }
});

test('Operator Console routes launcher sessions through its base-path API and rejects unknown routes', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const response = await page.goto(fixture.url + '/console/launch');
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { name: 'Start the launcher from the CLI' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Launcher' }).getAttribute('href'), '/console/launch');
    assert.deepEqual(fixture.launcherRequests, ['/console/launch/api/sessions']);

    const unknown = await fetch(fixture.url + '/console/not-found');
    assert.equal(unknown.status, 404);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('Operator Console Vue exposes retired-record recovery and exact purge confirmation', async () => {
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

test('Operator Console Vue mutation pages preserve plan/apply and revision safeguards', async () => {
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
