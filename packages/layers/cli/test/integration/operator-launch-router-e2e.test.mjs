import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SiteRegistry, openRegistryDb, resolveRegistryDbPathByLocus } from '@narada2/windows-site';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPackageRoot = resolve(__dirname, '..', '..');
const naradaProperRoot = resolve(cliPackageRoot, '..', '..', '..');
const cliPath = join(cliPackageRoot, 'dist', 'main.js');

async function reservePort(excludedPorts = new Set()) {
  if (excludedPorts.size > 0) {
    const candidate = await reservePort();
    if (!excludedPorts.has(candidate)) return candidate;
    return reservePort(excludedPorts);
  }
  const server = createServer();
  const port = await new Promise((resolvePort, rejectPort) => {
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPort(new Error('reserved_port_unavailable'));
        return;
      }
      resolvePort(address.port);
    });
  });
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function seedSiteRegistry(userSiteRoot, siteRoot) {
  const previous = process.env.NARADA_USER_SITE_ROOT;
  process.env.NARADA_USER_SITE_ROOT = userSiteRoot;
  const database = await openRegistryDb(resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' }));
  const registry = new SiteRegistry(database);
  const timestamp = new Date().toISOString();
  registry.registerSite({
    siteId: 'router-launch-e2e',
    variant: 'native',
    siteRoot,
    substrate: 'windows',
    aimJson: JSON.stringify({ purpose: 'launcher Router acceptance' }),
    controlEndpoint: null,
    lastSeenAt: timestamp,
    createdAt: timestamp,
  });
  database.close();
  if (previous === undefined) delete process.env.NARADA_USER_SITE_ROOT;
  else process.env.NARADA_USER_SITE_ROOT = previous;
}

function spawnNode(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: naradaProperRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = { value: '' };
  const stderr = { value: '' };
  child.stdout.on('data', (chunk) => { stdout.value += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr.value += chunk.toString(); });
  return { child, stdout, stderr };
}

function waitForOutput(child, stdout, stderr, pattern, timeoutMs = 30_000) {
  return new Promise((resolveOutput, rejectOutput) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      cleanup();
      rejectOutput(new Error(`launcher_output_timeout:${pattern}\nstdout:\n${stdout.value}\nstderr:\n${stderr.value}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onOutput);
      child.stderr.off('data', onOutput);
      child.off('exit', onExit);
    };
    const check = () => {
      const match = stdout.value.match(pattern);
      if (!match || settled) return;
      settled = true;
      cleanup();
      resolveOutput(match);
    };
    const onOutput = () => check();
    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectOutput(new Error(`launcher_exited_before_output: code=${code} signal=${signal}\nstdout:\n${stdout.value}\nstderr:\n${stderr.value}`));
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('exit', onExit);
    check();
  });
}

async function waitForConsoleProjection(url, output, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/routes`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const body = await response.json();
        if (body.routes?.some((route) => route.route_id === 'operator-console' && route.state === 'healthy')) return body;
      }
    } catch {
      // The child may need several polling rounds to bind the Router and Console.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `operator_console_health_timeout:${url}\nstdout:\n${output.stdout.value}\nstderr:\n${output.stderr.value}`,
  );
}

async function waitForChildExit(child, output, timeoutMs = 15_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      rejectExit(new Error(
        `child_exit_timeout: exit_code=${child.exitCode} signal=${child.signalCode}`
        + `\nstdout:\n${output?.stdout?.value ?? ''}`
        + `\nstderr:\n${output?.stderr?.value ?? ''}`
      ));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit();
    };
    child.once('exit', onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  try {
    await waitForChildExit(child);
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    try {
      await waitForChildExit(child, undefined, 5_000);
    } catch {
      throw error;
    }
  }
}

async function stopProcessTree(child) {
  if (process.platform !== 'win32' || !child?.pid) return;
  const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  await new Promise((resolve) => {
    killer.once('error', resolve);
    killer.once('exit', resolve);
  });
}

async function waitForUnavailable(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${url}/health`, { signal: AbortSignal.timeout(300) });
    } catch {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`operator_router_stop_timeout:${url}`);
}

test('real launcher browser journey stays on the stable Operator Router origin', {
  skip: process.platform !== 'win32',
  timeout: 90_000,
}, async () => {
  assert.equal(existsSync(cliPath), true, `CLI dist missing: ${cliPath}`);

  const fixtureRoot = await mkdtemp(join(tmpdir(), 'narada-launcher-router-e2e-'));
  const userSiteRoot = join(fixtureRoot, 'user-site');
  const siteRoot = join(fixtureRoot, 'site');
  const routerStateRoot = join(fixtureRoot, 'operator-router');
  const registryPath = join(fixtureRoot, 'agents.json');
  const terminalLog = join(fixtureRoot, 'workspace-launch-terminal.jsonl');
  const routerPort = await reservePort();
  const launcherPort = await reservePort(new Set([routerPort]));
  await mkdir(userSiteRoot, { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await seedSiteRegistry(userSiteRoot, siteRoot);
  await writeFile(registryPath, JSON.stringify({
    Agents: [{
      Agent: 'router-launch-e2e.resident',
      Role: 'resident',
      Site: 'router-launch-e2e',
      NaradaRoot: siteRoot,
      SiteRoot: siteRoot,
      WorkspaceRoot: siteRoot,
      LauncherPath: join(siteRoot, 'narada-router-launch-e2e.ps1'),
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }],
  }), 'utf8');

  const routerUrl = `http://127.0.0.1:${routerPort}`;
  const childEnvironment = {
    LOCALAPPDATA: fixtureRoot,
    NARADA_OPERATOR_ROUTER_STATE_ROOT: routerStateRoot,
    NARADA_USER_SITE_ROOT: userSiteRoot,
    NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG: terminalLog,
  };
  const consoleProcess = spawnNode([
    cliPath,
    'console',
    'serve',
    '--host', '127.0.0.1',
    '--port', String(routerPort),
  ], childEnvironment);
  let launcherProcess;
  let browser;
  try {
    await waitForConsoleProjection(routerUrl, { stdout: consoleProcess.stdout, stderr: consoleProcess.stderr });

    launcherProcess = spawnNode([
      cliPath,
      'launcher',
      'workspace-launch',
      '--interactive-selection-ui',
      '--launcher-ui-port', String(launcherPort),
      '--launcher-ui-port-fallback',
      '--operator-router-port', String(routerPort),
      '--config-path', registryPath,
      '--format', 'json',
    ], {
      ...childEnvironment,
      NARADA_NO_BROWSER: '1',
      NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION: '1',
    });

    const launcherOutput = await waitForOutput(
      launcherProcess.child,
      launcherProcess.stdout,
      launcherProcess.stderr,
      /Narada launcher selection UI: (http:\/\/127\.0\.0\.1:\d+\/console\/launch\/sessions\/[^\r\n]+)/,
    );
    const stableUrl = launcherOutput[1];
    const stable = new URL(stableUrl);
    assert.equal(stable.origin, routerUrl);
    assert.match(stable.pathname, /^\/console\/launch\/sessions\/[^/]+$/);
    assert.notEqual(stable.port, String(launcherPort), 'the launcher must not expose its direct UI port as the operator URL');

    const directResponse = await fetch(`http://127.0.0.1:${launcherPort}/`);
    assert.equal(directResponse.status, 200);
    const stableResponse = await fetch(stableUrl);
    assert.equal(stableResponse.status, 200);
    assert.match(await stableResponse.text(), /narada-workspace-launch-bootstrap/);

    const publicRoutesResponse = await fetch(`${routerUrl}/routes`);
    const publicRoutesText = await publicRoutesResponse.text();
    assert.equal(publicRoutesResponse.status, 200);
    assert.doesNotMatch(publicRoutesText, /target_url|health_url/);
    assert.doesNotMatch(publicRoutesText, new RegExp(`127\\.0\\.0\\.1:${launcherPort}`));

    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(stableUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#sites').waitFor({ state: 'attached', timeout: 15_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('heading', { name: 'Cancelled' }).waitFor({ timeout: 15_000 });
    await waitForChildExit(launcherProcess.child, launcherProcess, 15_000);
    assert.equal(launcherProcess.child.exitCode, 0);

    const closedResponse = await fetch(stableUrl);
    assert.equal(closedResponse.status, 409);
    await stopProcessTree(consoleProcess.child);
    await stopChild(consoleProcess.child);
    await waitForUnavailable(routerUrl);
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(launcherProcess?.child).catch(() => {});
    await stopChild(consoleProcess.child).catch(() => {});
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
