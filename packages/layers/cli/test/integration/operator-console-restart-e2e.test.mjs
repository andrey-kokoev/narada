import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntrypoint = resolve(__dirname, '..', '..', 'dist', 'main.js');
const routerEntrypoint = resolve(__dirname, '..', '..', '..', '..', 'operator-router', 'dist', 'main.js');
const naradaRoot = resolve(__dirname, '..', '..', '..', '..', '..');

async function getFreePort() {
  const server = createServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.listen(0, '127.0.0.1', () => resolvePromise());
      server.once('error', reject);
    });
    return server.address().port;
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

function launchNode(entrypoint, args, env) {
  let stdout = '';
  let stderr = '';
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd: naradaRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return {
    child,
    output: () => `${stdout}\n${stderr}`,
  };
}

async function waitForChildExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`child_exit_timeout:${child.pid}`)), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function waitForHealth(url, processInfo, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`process_exited_before_health:${processInfo.child.exitCode}:${processInfo.output()}`);
    }
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const body = await response.json();
        if (body.status === 'healthy') return body;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`health_timeout:${url}:${lastError?.message ?? processInfo.output()}`);
}

async function readRoutes(url) {
  const response = await fetch(`${url}/routes`, { signal: AbortSignal.timeout(1_000) });
  assert.equal(response.ok, true, `routes_http_${response.status}`);
  return response.json();
}

async function waitForOperatorConsoleRoute(url, predicate, processInfo, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastRoutes = null;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`process_exited_before_route:${processInfo.child.exitCode}:${processInfo.output()}`);
    }
    try {
      lastRoutes = await readRoutes(url);
      const route = lastRoutes.routes?.find((candidate) => candidate.route_id === 'operator-console');
      if (route && predicate(route)) return route;
    } catch {
      // The router or projection may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`operator_console_route_timeout:${JSON.stringify(lastRoutes)}:${processInfo.output()}`);
}

function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // The process may already have exited.
  }
}

test('console restart authenticates across real process boundaries and replaces the projection', {
  skip: process.platform !== 'win32',
}, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), 'narada-console-restart-'));
  const userProfile = await mkdtemp(join(tmpdir(), 'narada-console-restart-user-'));
  const port = await getFreePort();
  const routerUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    LOCALAPPDATA: localAppData,
    USERPROFILE: userProfile,
    HOME: userProfile,
  };
  delete env.NARADA_OPERATOR_ROUTER_STATE_ROOT;
  delete env.NARADA_OPERATOR_ROUTER_ENTRYPOINT;

  // Reproduce the live migration boundary: the already-running router uses
  // the former per-user state root while a fresh CLI process resolves the
  // current Windows LOCALAPPDATA root.
  const routerStateRoot = join(userProfile, '.narada', 'operator-router');
  let routerProcess = null;
  let initialProjection = null;
  let restartedProjection = null;
  try {
    routerProcess = launchNode(routerEntrypoint, [
      '--host', '127.0.0.1',
      '--port', String(port),
      '--state-root', routerStateRoot,
    ], env);
    await waitForHealth(routerUrl, routerProcess);

    initialProjection = launchNode(cliEntrypoint, [
      'console', 'serve',
      '--host', '127.0.0.1',
      '--port', String(port),
      '--no-open',
    ], env);
    const initialRoute = await waitForOperatorConsoleRoute(
      routerUrl,
      (route) => route.state === 'healthy',
      initialProjection,
    );

    restartedProjection = launchNode(cliEntrypoint, [
      'console', 'restart',
      '--host', '127.0.0.1',
      '--port', String(port),
      '--no-open',
    ], env);
    const replacementRoute = await waitForOperatorConsoleRoute(
      routerUrl,
      (route) => route.state === 'healthy' && route.owner_id !== initialRoute.owner_id,
      restartedProjection,
    );

    assert.notEqual(replacementRoute.owner_id, initialRoute.owner_id);
    assert.equal(restartedProjection.child.exitCode, null);
    await waitForChildExit(initialProjection.child);
    assert.doesNotMatch(restartedProjection.output(), /operator_router_registration_authorization_required/u);
  } finally {
    for (const processInfo of [restartedProjection, initialProjection, routerProcess]) {
      if (processInfo?.child.exitCode === null && processInfo.child.signalCode === null) {
        terminateProcessTree(processInfo.child.pid);
      }
    }
    await rm(localAppData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(userProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
