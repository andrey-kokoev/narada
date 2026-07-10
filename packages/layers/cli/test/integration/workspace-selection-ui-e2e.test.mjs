import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { writeNarsSessionStartedIndex } from '@narada2/carrier-runtime/nars-session-index';
import { SiteRegistry, openRegistryDb, resolveRegistryDbPathByLocus } from '@narada2/windows-site';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPackageRoot = resolve(__dirname, '..', '..');
const naradaProperRoot = resolve(cliPackageRoot, '..', '..', '..');
const cliPath = join(cliPackageRoot, 'dist', 'main.js');

async function makeFixture() {
  const root = join(cliPackageRoot, '.ai', 'tmp-tests', 'selection-ui-e2e');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const wtLog = join(root, 'wt-log.jsonl');
  const userSiteRoot = join(root, 'user-site');
  const sonarRoot = join(root, 'narada.sonar');
  const smartSchedulingRoot = join(root, 'smart-scheduling');
  await mkdir(userSiteRoot, { recursive: true });
  await mkdir(sonarRoot, { recursive: true });
  await mkdir(smartSchedulingRoot, { recursive: true });
  const previousUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  process.env.NARADA_USER_SITE_ROOT = userSiteRoot;
  const registryDb = await openRegistryDb(resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' }));
  const siteRegistry = new SiteRegistry(registryDb);
  const registryTimestamp = new Date().toISOString();
  siteRegistry.registerSite({
    siteId: 'sonar',
    variant: 'native',
    siteRoot: sonarRoot,
    substrate: 'windows',
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: registryTimestamp,
    createdAt: registryTimestamp,
  });
  siteRegistry.registerSite({
    siteId: 'smart-scheduling',
    variant: 'native',
    siteRoot: join(smartSchedulingRoot, '.narada'),
    substrate: 'windows',
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: registryTimestamp,
    createdAt: registryTimestamp,
  });
  registryDb.close();
  if (previousUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
  else process.env.NARADA_USER_SITE_ROOT = previousUserSiteRoot;
  const sonarSessionDir = join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'carrier_dashboard_test_sonar');
  const sonarSessionPath = join(sonarSessionDir, 'session.jsonl');
  const sonarControlPath = join(sonarSessionDir, 'control.jsonl');
  await mkdir(sonarSessionDir, { recursive: true });
  await writeFile(sonarSessionPath, '', 'utf8');
  await writeFile(sonarControlPath, '', 'utf8');
  const healthServer = createServer((_req, res) => {
    const body = JSON.stringify({ status: 'healthy' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  const healthEndpoint = await new Promise((resolveHealthEndpoint, rejectHealthEndpoint) => {
    healthServer.once('error', rejectHealthEndpoint);
    healthServer.listen(0, '127.0.0.1', () => {
      const address = healthServer.address();
      if (!address || typeof address === 'string') rejectHealthEndpoint(new Error('health_server_address_unavailable'));
      else resolveHealthEndpoint(`http://127.0.0.1:${address.port}/health`);
    });
  });
  writeNarsSessionStartedIndex({
    siteRoot: sonarRoot,
    sessionStartedEvent: {
      event: 'session_started',
      session_id: 'carrier_dashboard_test_sonar',
      agent_id: 'sonar.resident',
      timestamp: '2026-07-05T00:00:00.000Z',
      site_root: sonarRoot,
      runtime: 'narada-agent-runtime-server',
      event_endpoint: 'ws://127.0.0.1:12345/events',
      health_endpoint: healthEndpoint,
      attach_commands: {
        agent_cli: 'narada-agent-cli --attach ws://127.0.0.1:12345/events',
        agent_web_ui: `narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint ${healthEndpoint}`,
      },
      session_path: sonarSessionPath,
      events_path: join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'carrier_dashboard_test_sonar', 'events.jsonl'),
    },
  });

  const registry = join(root, 'agents.json');
  await writeFile(registry, JSON.stringify({
    NaradaRoot: 'C:/Users/Andrey/Narada',
    Runtime: 'codex',
    Agents: [
      {
        Agent: 'sonar.resident',
        Role: 'resident',
        Site: 'sonar',
        NaradaRoot: sonarRoot,
        SiteRoot: sonarRoot,
        WorkspaceRoot: sonarRoot,
        LauncherPath: join(sonarRoot, 'narada-sonar.ps1'),
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
      },
      {
        Agent: 'smart-scheduling.resident',
        Role: 'resident',
        Site: 'smart-scheduling',
        NaradaRoot: smartSchedulingRoot,
        SiteRoot: join(smartSchedulingRoot, '.narada'),
        WorkspaceRoot: smartSchedulingRoot,
        LauncherPath: join(smartSchedulingRoot, 'narada-smart-scheduling.ps1'),
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
      },
    ],
  }), 'utf8');

  return { root, registry, wtLog, userSiteRoot, sonarRoot, smartSchedulingRoot, healthServer, healthEndpoint, sonarSessionPath, sonarControlPath };
}

function waitForUrl(child, stderrRef = { value: '' }, stdoutRef = { value: '' }) {
  return new Promise((resolveUrl, rejectUrl) => {
    let buffer = stdoutRef.value;
    const resolveIfMatched = () => {
      const match = buffer.match(/Narada launcher selection UI: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[1]);
        return true;
      }
      return false;
    };
    const timer = setTimeout(() => rejectUrl(new Error(`selection_ui_url_timeout:\n${buffer}`)), 30_000);
    if (resolveIfMatched()) return;
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      stdoutRef.value = buffer;
      resolveIfMatched();
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      rejectUrl(new Error(`launcher_exited_before_url: code=${code} signal=${signal}\nstdout:\n${buffer}\nstderr:\n${stderrRef.value}`));
    });
  });
}

async function readWtLaunches(wtLog) {
  if (!existsSync(wtLog)) return [];
  const text = await readFile(wtLog, 'utf8');
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForLaunchCount(wtLog, count) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const launches = await readWtLaunches(wtLog);
    if (launches.length >= count) return launches;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`timed out waiting for ${count} wt launches; saw ${(await readWtLaunches(wtLog)).length}`);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return Promise.race([
    new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
    new Promise((_, reject) => setTimeout(() => reject(new Error('launcher_process_exit_timeout_after_cancel')), 10_000)),
  ]);
}

async function chooseSingleSite(page, site) {
  for (const input of await page.locator('#sites input[type="checkbox"]').all()) {
    if (await input.isChecked()) await input.uncheck();
  }
  await page.locator(`#sites input[value="${site}"]`).check();
}

async function submitLaunch(page) {
  await page.getByRole('button', { name: 'Start New Session' }).click();
  await assert.doesNotReject(() => page.getByText('New launch accepted. Open or attach only from the specific result card below.').waitFor({ timeout: 20_000 }));
}

function normalizedJsonPathText(value) {
  return JSON.stringify(value).replace(/\\\\/g, '/').replace(/\\/g, '/');
}

async function fetchLaunchState(page) {
  return page.evaluate(async () => {
    const response = await fetch('/launches');
    return response.json();
  });
}

test('browser interactive selection UI can launch multiple sites before cancel', { timeout: 90_000, skip: process.env.NARADA_ENABLE_BROWSER_SELECTION_UI_E2E !== '1' ? 'browser selection UI E2E requires explicit opt-in because child launcher process handling is host-sensitive' : false }, async () => {
  assert.equal(existsSync(cliPath), true, `CLI dist missing: ${cliPath}. Run pnpm --filter @narada2/cli build first.`);
  const fixture = await makeFixture();
  const launcherUiPort = 54900;
  const child = spawn(process.execPath, [
    cliPath,
    'launcher',
    'workspace-launch',
    '--interactive-selection-ui',
    '--launcher-ui-port', String(launcherUiPort),
    '--launcher-ui-port-fallback',
    '--config-path', fixture.registry,
    '--format', 'json',
  ], {
    cwd: naradaProperRoot,
    env: {
      ...process.env,
      NARADA_NO_BROWSER: '1',
      NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG: fixture.wtLog,
      NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION: '1',
      NARADA_USER_SITE_ROOT: fixture.userSiteRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdoutRef = { value: '' };
  child.stdout.on('data', (chunk) => { stdoutRef.value += chunk.toString(); });
  let stderr = '';
  const stderrRef = { value: '' };
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); stderrRef.value = stderr; });
  let browser;
  let recoveryChild;
  try {
    const url = await waitForUrl(child, stderrRef, stdoutRef);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    await page.goto(url);
    await page.locator('#sites').waitFor({ state: 'attached', timeout: 10_000 });
    if (await page.locator('#sites input[type="checkbox"]').count() === 0) {
      assert.fail(`selection UI rendered no Sites; pageErrors=${pageErrors.join(' | ')}; body=${await page.locator('body').innerText()}`);
    }

    await chooseSingleSite(page, 'sonar');
    await submitLaunch(page);
    let launches = await readWtLaunches(fixture.wtLog);
    assert.equal(launches.length, 0, 'NARS runtime starts use the hidden runtime-host posture; terminal capture begins with explicit projections.');
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('Hidden runtime handoff: handed off').waitFor({ timeout: 10_000 });
    await page.locator('.attempt-title', { hasText: 'sonar / resident' }).waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('Runtime: unowned').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('historical result; recheck before attaching').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('No attach/open action is currently available.').waitFor({ timeout: 10_000 });
    let state = await fetchLaunchState(page);
    const expectedLaunchSessionId = state.attempts[0].expected_launch_session_ids[0];
    writeNarsSessionStartedIndex({
      siteRoot: fixture.sonarRoot,
      sessionStartedEvent: {
        event: 'session_started',
        session_id: 'carrier_dashboard_test_sonar',
        agent_id: 'sonar.resident',
        timestamp: '2026-07-05T00:00:00.000Z',
        site_root: fixture.sonarRoot,
        runtime: 'narada-agent-runtime-server',
        launch_session_id: expectedLaunchSessionId,
        event_endpoint: 'ws://127.0.0.1:12345/events',
        health_endpoint: fixture.healthEndpoint,
        attach_commands: {
          agent_cli: 'narada-agent-cli --attach ws://127.0.0.1:12345/events',
          agent_web_ui: `narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint ${fixture.healthEndpoint}`,
        },
        session_path: fixture.sonarSessionPath,
        events_path: join(fixture.sonarRoot, '.narada', 'crew', 'nars-sessions', 'carrier_dashboard_test_sonar', 'events.jsonl'),
      },
    });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Recheck This Launch/ }).click();
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('Runtime: healthy · session carrier_dashboard_test_sonar').waitFor({ timeout: 20_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Attach CLI To This Session/ }).waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Open This UI/ }).waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Stop This Runtime Tree/ }).waitFor({ timeout: 10_000 });
    const sonarAttemptText = await page.locator('.attempt', { hasText: 'sonar / resident' }).innerText();
    assert.doesNotMatch(sonarAttemptText, /\[object Object\]/);
    assert.doesNotMatch(sonarAttemptText, /\{"event":/);
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Open This UI/ }).click();
    await page.locator('#status').getByText('agent-web-ui projection host started hidden; browser projection owns visible operator surface.').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('Projection: agent-web-ui · handed off').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Attach CLI To This Session/ }).click();
    await page.locator('#status').getByText('agent-cli projection handoff accepted by operator terminal authority.').waitFor({ timeout: 10_000 });
    const projectionLaunches = await readWtLaunches(fixture.wtLog);
    assert.equal(projectionLaunches.some((args) => args.includes('sonar.resident runtime')), true);
    assert.equal(projectionLaunches.some((args) => args.includes('sonar.resident runtime') && args.some((arg) => arg.includes('narada-agent-cli --attach'))), true);
    assert.equal(projectionLaunches.some((args) => args.includes('agent-cli carrier_dashboard_test_sonar')), false);
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByText('Projection: agent-cli · handed off').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Stop This Runtime Tree/ }).click();
    await page.locator('#status').getByText('Confirm stop only if you intend to close this session control path and its owned descendant process tree.').waitFor({ timeout: 10_000 });
    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Confirm Stop This Runtime Tree/ }).click();
    await page.locator('#status').getByText('Stop Runtime requested through NARS session control path.').waitFor({ timeout: 10_000 });
    const controlLines = (await readFile(fixture.sonarControlPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(controlLines.at(-1).method, 'session.close');

    await chooseSingleSite(page, 'smart-scheduling');
    await submitLaunch(page);
    launches = await waitForLaunchCount(fixture.wtLog, 1);
    assert.equal(launches.length, 1, 'only the explicit agent-cli projection uses a visible terminal handoff; web UI and NARS starts are hidden.');
    await page.locator('.attempt', { hasText: 'smart-scheduling / resident' }).getByText('Hidden runtime handoff: handed off').waitFor({ timeout: 10_000 });
    await page.locator('.attempt-title', { hasText: 'smart-scheduling / resident' }).waitFor({ timeout: 10_000 });

    state = await fetchLaunchState(page);
    assert.equal(state.schema, 'narada.workspace_launch.ui_session_state.v1');
    assert.equal(state.attempts.length, 2);
    assert.equal(state.attempts.every((attempt) => attempt.status === 'launched'), true);
    assert.equal(state.attempts.every((attempt) => attempt.handoffs.length === 1), true);
    assert.equal(state.attempts.some((attempt) => attempt.actions.includes('stop-runtime')), true);

    await page.locator('.attempt', { hasText: 'sonar / resident' }).getByRole('button', { name: /Forget This Result/ }).click();
    await page.getByText('Forget This Result completed.').waitFor({ timeout: 10_000 });
    await assert.rejects(() => page.locator('.attempt-title', { hasText: 'sonar / resident' }).waitFor({ timeout: 500 }));
    state = await fetchLaunchState(page);
    assert.equal(state.attempts.length, 1);
    assert.equal(state.attempts[0].selection.site[0], 'smart-scheduling');
    const persistedSessions = await readdir(join(fixture.userSiteRoot, '.narada', 'runtime', 'workspace-launch-ui-sessions'));
    assert.equal(persistedSessions.length, 1);
    const persistedDir = join(fixture.userSiteRoot, '.narada', 'runtime', 'workspace-launch-ui-sessions', persistedSessions[0]);
    assert.equal(existsSync(join(persistedDir, 'session.json')), true);
    assert.equal(existsSync(join(persistedDir, 'attempts.jsonl')), true);
    assert.equal(existsSync(join(persistedDir, 'handoffs.jsonl')), true);
    assert.equal(existsSync(join(persistedDir, 'observations.jsonl')), true);
    assert.equal(existsSync(join(persistedDir, 'projections.jsonl')), true);
    launches = await readWtLaunches(fixture.wtLog);
    assert.equal(launches.length, 1, 'forget must not mutate the explicit terminal projection handoff.');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('heading', { name: 'Cancelled' }).waitFor({ timeout: 10_000 });

    const exit = await waitForExit(child);
    assert.deepEqual(exit, { code: 0, signal: null }, stderr);

    recoveryChild = spawn(process.execPath, [
      cliPath,
      'launcher',
      'workspace-launch',
      '--interactive-selection-ui',
      '--launcher-ui-port', String(launcherUiPort + 1),
      '--launcher-ui-port-fallback',
      '--config-path', fixture.registry,
      '--format', 'json',
    ], {
      cwd: naradaProperRoot,
      env: {
        ...process.env,
        NARADA_NO_BROWSER: '1',
        NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG: fixture.wtLog,
        NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION: '1',
        NARADA_USER_SITE_ROOT: fixture.userSiteRoot,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let recoveryStderr = '';
    recoveryChild.stderr.on('data', (chunk) => { recoveryStderr += chunk.toString(); });
    const recoveryUrl = await waitForUrl(recoveryChild);
    const recoveryPage = await browser.newPage();
    await recoveryPage.goto(recoveryUrl);
    await recoveryPage.locator('.attempt-title', { hasText: 'smart-scheduling / resident' }).waitFor({ timeout: 10_000 });
    const recoveredState = await fetchLaunchState(recoveryPage);
    assert.equal(recoveredState.attempts.length, 1);
    assert.equal(recoveredState.attempts[0].selection.site[0], 'smart-scheduling');
    assert.equal(recoveredState.attempts[0].status, 'launched');
    await recoveryPage.getByRole('button', { name: 'Cancel' }).click();
    await recoveryPage.getByRole('heading', { name: 'Cancelled' }).waitFor({ timeout: 10_000 });
    const recoveryExit = await waitForExit(recoveryChild);
    assert.deepEqual(recoveryExit, { code: 0, signal: null }, recoveryStderr);
    const sessionsAfterRecovery = await readdir(join(fixture.userSiteRoot, '.narada', 'runtime', 'workspace-launch-ui-sessions'));
    assert.equal(sessionsAfterRecovery.length, 1, 'dashboard retention should prune old dashboard sessions without removing recovered rows');
  } finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
    if (recoveryChild && recoveryChild.exitCode === null) recoveryChild.kill();
    await new Promise((resolveClose) => fixture.healthServer.close(() => resolveClose()));
    await rm(fixture.root, { recursive: true, force: true });
  }
});
