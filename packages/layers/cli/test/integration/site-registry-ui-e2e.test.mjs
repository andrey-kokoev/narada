import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { renderSiteRegistryPage } from '../../dist/commands/console-site-registry-page.js';
import { readOperatorConsoleUiAsset, readOperatorConsoleUiDocument } from '../../dist/commands/console-ui-assets.js';

const site = {
  site_id: 'site-a',
  lifecycle_status: 'active',
  observation_status: 'present',
  site_root: 'D:/code/site-a',
  variant: 'native',
  substrate: 'windows',
  control_endpoint: 'https://example.invalid/control',
  aliases: [{ value: 'site-a-alias', source: 'fixture' }],
  aim_json: { purpose: 'browser fixture' },
  sources: [{ kind: 'manual', ref: 'fixture' }],
  revision: 4,
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const modernSite = {
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

async function startModernFixtureServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && pathname === '/console/registry') {
        const body = readOperatorConsoleUiDocument();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/console/registry/assets/')) {
        const asset = readOperatorConsoleUiAsset(pathname);
        if (!asset) {
          sendJson(res, 404, { error: 'asset_not_found' });
          return;
        }
        res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.body.byteLength });
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
          sites: [modernSite],
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/console/registry/api/sites/site-a') {
        sendJson(res, 200, {
          schema: 'narada.site_registry.management.v0',
          status: 'success',
          operation: 'show',
          mutation_performed: false,
          site_id: 'site-a',
          registry_path: 'D:/registry.sqlite',
          catalog_source: 'user_site_site_registry',
          site: modernSite,
          management_audit: [],
          next_actions: ['edit', 'retire'],
        });
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const url = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') reject(new Error('modern_fixture_server_address_unavailable'));
      else resolve('http://127.0.0.1:' + address.port);
    });
  });
  return {
    url,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function startFixtureServer() {
  const appliedInputs = [];
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && (pathname === '/console/registry' || pathname === '/console/registry/add' || pathname === '/console/registry/manage')) {
        const mode = pathname.endsWith('/add') ? 'add' : pathname.endsWith('/manage') ? 'manage' : 'list';
        const body = renderSiteRegistryPage(mode);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && pathname === '/console/registry/api/sites') {
        sendJson(res, 200, { sites: [site] });
        return;
      }
      if (req.method === 'GET' && pathname === '/console/registry/api/sites/site-a') {
        sendJson(res, 200, { site, conflicts: [], next_actions: ['edit', 'retire'] });
        return;
      }
      if (req.method === 'POST' && pathname === '/console/registry/api/operations/plan') {
        const input = await readJson(req);
        const nextRoot = input.root || site.site_root;
        sendJson(res, 200, {
          status: 'planned',
          operation: input.operation,
          mutation_performed: false,
          site_id: site.site_id,
          before: { revision: site.revision, site_root: site.site_root },
          after: { revision: site.revision, site_root: nextRoot },
          changes: ['fixture preview'],
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/console/registry/api/operations/apply') {
        const input = await readJson(req);
        appliedInputs.push(input);
        sendJson(res, 200, {
          status: 'applied',
          operation: input.operation,
          mutation_performed: true,
          site_id: site.site_id,
          before: { revision: site.revision, site_root: site.site_root },
          after: { revision: site.revision + 1, site_root: input.root || site.site_root },
          changes: ['fixture applied'],
        });
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const url = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') reject(new Error('fixture_server_address_unavailable'));
      else resolve('http://127.0.0.1:' + address.port);
    });
  });
  return {
    url,
    appliedInputs,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function waitForList(page) {
  await page.waitForFunction(() => document.querySelector('#count')?.textContent === '1 Site');
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

test('Site Registry keeps shared styling and guarded draft workflow at desktop and mobile widths', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry/manage');
    await waitForList(page);
    await assertNoHorizontalOverflow(page, 'desktop');

    assert.equal(await page.locator('#purge-confirm-field').isHidden(), true);
    assert.equal(await page.locator('.edit-only-clear').first().isHidden(), true);

    await page.locator('#site-id').fill('new-site');
    await page.locator('#root').fill('D:/code/new-site');
    assert.equal(await page.locator('#draft-state').textContent(), 'Unsaved changes');

    await page.locator('#discard').click();
    assert.equal(await page.locator('#draft-state').textContent(), 'No unsaved changes');
    assert.equal(await page.locator('#site-id').inputValue(), '');
    assert.equal(await page.locator('#root').inputValue(), '');

    await page.locator('#operation').selectOption('edit');
    await page.waitForFunction(() => document.querySelector('#existing-site-field')?.hidden === false);
    await page.locator('#existing-site').selectOption('site-a');
    await page.waitForFunction(() => document.querySelector('#reference')?.value === 'site-a');
    assert.equal(await page.locator('#root').inputValue(), site.site_root);

    await page.waitForFunction(() => document.querySelector('#operation option[value="purge"]')?.disabled === true);
    await page.evaluate(() => {
      const operation = document.querySelector('#operation');
      operation.value = 'purge';
      operation.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#plan')?.disabled === true);
    assert.match(await page.locator('#operation-help').textContent(), /active Site supports Edit or Retire/);

    await page.locator('#operation').selectOption('edit');
    await page.locator('#root').fill('D:/code/changed-site');
    await page.locator('#discard').click();
    await page.waitForFunction(() => document.querySelector('#root')?.value === 'D:/code/site-a');
    assert.equal(await page.locator('#draft-state').textContent(), 'No unsaved changes');

    await page.locator('#reason').fill('verify shared UI workflow');
    await page.locator('#plan').click();
    await page.waitForFunction(() => document.querySelector('#mutation-output')?.textContent.includes('edit planned'));
    assert.equal(await page.locator('#confirm-apply').isDisabled(), false);
    assert.equal(await page.locator('#apply').isDisabled(), true);

    await page.locator('#confirm-apply').check();
    assert.equal(await page.locator('#apply').isDisabled(), false);
    await page.locator('#apply').click();
    await page.waitForFunction(() => document.querySelector('#mutation-output')?.textContent.includes('edit applied'));
    assert.equal(fixture.appliedInputs.length, 1);
    assert.equal(fixture.appliedInputs[0].confirm_apply, true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await waitForList(page);
    await assertNoHorizontalOverflow(page, 'mobile');
    assert.equal(await page.locator('#purge-confirm-field').isHidden(), true);
    assert.equal(await page.locator('.edit-only-clear').first().isHidden(), true);
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test('Operator Console Vue registry projection works at desktop and mobile widths', async () => {
  const fixture = await startModernFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry');
    await page.locator('.site-tile').waitFor();
    assert.equal(await page.locator('.site-tile').count(), 1);
    assert.equal(await page.locator('.site-tile__name').textContent(), 'site-a');
    await page.locator('.site-tile').click();
    await page.waitForFunction(() => document.querySelector('.site-detail h2')?.textContent === 'site-a');
    assert.equal(await page.locator('.site-detail h2').textContent(), 'site-a');
    assert.match(await page.locator('.site-detail').textContent(), /D:\/code\/site-a/);
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

test('Site Registry Add is guided, staged, accessible, and responsive', async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(fixture.url + '/console/registry/add');
    await assertNoHorizontalOverflow(page, 'add desktop');

    assert.equal(await page.locator('#operation-field').isHidden(), true);
    assert.equal(await page.locator('#existing-site-field').isHidden(), true);
    assert.equal(await page.locator('#apply-actions').isHidden(), true);
    assert.equal(await page.locator('#variant').inputValue(), 'native');
    assert.equal(await page.locator('#root').getAttribute('placeholder'), 'D:/code/my-site');
    assert.equal(await page.locator('#variant option').first().isHidden(), true);

    await page.locator('#plan').click();
    assert.notEqual(await page.locator('#site-id').evaluate((element) => element.validationMessage), '');

    await page.locator('#site-id').fill('new-site');
    await page.locator('#variant').selectOption('wsl');
    assert.equal(await page.locator('#root').getAttribute('placeholder'), '/mnt/d/code/my-site');
    assert.match(await page.locator('#root-help').textContent(), /WSL/);
    await page.locator('#root').fill('/mnt/d/code/new-site');
    await page.locator('#plan').click();
    await page.waitForFunction(() => document.querySelector('#mutation-output')?.textContent.includes('add planned'));

    assert.equal(await page.locator('#apply-actions').isHidden(), false);
    assert.equal(await page.locator('#confirm-apply').isDisabled(), false);
    assert.equal(await page.locator('#apply').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'mutation-output');

    await page.locator('#confirm-apply').check();
    await page.locator('#apply').click();
    await page.waitForFunction(() => document.querySelector('#mutation-output')?.textContent.includes('add applied'));
    assert.equal(fixture.appliedInputs.length, 1);
    assert.equal(fixture.appliedInputs[0].operation, 'add');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await assertNoHorizontalOverflow(page, 'add mobile');
  } finally {
    await browser.close();
    await fixture.close();
  }
});
