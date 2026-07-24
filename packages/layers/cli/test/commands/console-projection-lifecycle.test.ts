import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createOperatorRouterServer,
  registerOperatorRoute,
} from '@narada2/operator-router';
import { stopOperatorConsoleProjection } from '../../src/commands/console-projection-lifecycle.ts';

test('console stop terminates the registered projection owner and removes its route', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-stop-'));
  const owner = spawn(process.execPath, [
    '-e',
    'setInterval(() => {}, 1000)',
    'narada',
    'console',
    'serve',
  ], { stdio: 'ignore' });
  const router = await createOperatorRouterServer({
    host: '127.0.0.1',
    port: 0,
    state_root: stateRoot,
    health_interval_ms: 60_000,
  });

  try {
    assert.ok(owner.pid);
    const routerUrl = await router.start();
    await registerOperatorRoute({
      url: routerUrl,
      registration_token: router.getRegistrationToken(),
    }, {
      route_id: 'operator-console',
      route_class: 'operator-console',
      public_path: '/',
      route_mode: 'prefix',
      target_url: 'http://127.0.0.1:1',
      health_url: null,
      owner_id: `operator-console:${owner.pid}`,
      process_evidence: {
        instance_nonce: 'console-stop-test-owner',
        pid: owner.pid,
        started_at: new Date().toISOString(),
      },
      protocols: ['http'],
      methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
      lease_ms: 60 * 60 * 1000,
      reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
    });

    const result = await stopOperatorConsoleProjection({
      host: '127.0.0.1',
      port: Number.parseInt(new URL(routerUrl).port, 10),
      state_root: stateRoot,
    });

    assert.equal(result.status, 'stopped');
    await new Promise<void>((resolve) => owner.once('exit', () => resolve()));
    const routes = await fetch(`${routerUrl}/routes`).then((response) => response.json() as Promise<{ routes: unknown[] }>);
    assert.deepEqual(routes.routes, []);
  } finally {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    await router.stop();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('console stop removes a PID-reused stale route without killing the unrelated process', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-stop-stale-'));
  const owner = spawn(process.execPath, [
    '-e',
    'setInterval(() => {}, 1000)',
    'unrelated-process',
  ], { stdio: 'ignore' });
  const router = await createOperatorRouterServer({
    host: '127.0.0.1',
    port: 0,
    state_root: stateRoot,
    health_interval_ms: 60_000,
  });

  try {
    assert.ok(owner.pid);
    const routerUrl = await router.start();
    await registerOperatorRoute({
      url: routerUrl,
      registration_token: router.getRegistrationToken(),
    }, {
      route_id: 'operator-console',
      route_class: 'operator-console',
      public_path: '/',
      route_mode: 'prefix',
      target_url: 'http://127.0.0.1:1',
      health_url: null,
      owner_id: `operator-console:${owner.pid}`,
      process_evidence: {
        instance_nonce: 'console-stop-test-stale-owner',
        pid: owner.pid,
        started_at: new Date().toISOString(),
      },
      protocols: ['http'],
      methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
      lease_ms: 60 * 60 * 1000,
      reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
    });

    const result = await stopOperatorConsoleProjection({
      host: '127.0.0.1',
      port: Number.parseInt(new URL(routerUrl).port, 10),
      state_root: stateRoot,
    });

    assert.equal(result.status, 'stale_route_removed');
    assert.equal(owner.exitCode, null);
    const routes = await fetch(`${routerUrl}/routes`).then((response) => response.json() as Promise<{ routes: unknown[] }>);
    assert.deepEqual(routes.routes, []);
  } finally {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    await router.stop();
    await rm(stateRoot, { recursive: true, force: true });
  }
});
