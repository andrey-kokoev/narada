import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  defaultOperatorConsoleRuntimeStateRoot,
  probeOperatorConsoleRuntime,
} from '../src/index.js';

const routerUrl = 'http://127.0.0.1:61729';
const route = {
  route_id: 'operator-console',
  route_class: 'operator-console',
  backend_kind: 'http',
  public_path: '/',
  route_mode: 'prefix',
  owner_id: 'operator-console:1234',
  site_id: null,
  session_id: null,
  protocols: ['http'],
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  state: 'healthy',
  lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  last_health_at: new Date().toISOString(),
  last_health_error: null,
};

const registration = {
  schema: 'narada.operator_router.route_registration.v1',
  ...route,
  target_url: 'http://127.0.0.1:43210',
  websocket_target_url: null,
  health_url: 'http://127.0.0.1:43210/health',
  process_evidence: { instance_nonce: 'testnonce1234', pid: null, started_at: null },
  max_body_bytes: 1024 * 1024,
  timeout_ms: 60_000,
  websocket_liveness: { mode: 'ping_pong', ping_interval_ms: 5_000, pong_timeout_ms: 10_000 },
  lease_ms: 60 * 60 * 1000,
  reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
};

function fakeFetchFactory({ backendStatus = 200, pid = null }: { backendStatus?: number; pid?: number | null } = {}): typeof fetch {
  const adminRegistration = {
    ...registration,
    process_evidence: { ...registration.process_evidence, pid },
  };
  return async (input) => {
    const url = String(input);
    if (url === routerUrl + '/health') {
      return Response.json({
        schema: 'narada.operator_router.health.v1',
        identity: 'narada.operator-router',
        version: '0.1.0',
        status: 'healthy',
      });
    }
    if (url === routerUrl + '/routes') {
      return Response.json({
        schema: 'narada.operator_router.routes.v1',
        identity: 'narada.operator-router',
        routes: [route],
      });
    }
    if (url === routerUrl + '/admin/routes') {
      return Response.json({
        schema: 'narada.operator_router.admin_routes.v1',
        identity: 'narada.operator-router',
        routes: [adminRegistration],
      });
    }
    if (url === 'http://127.0.0.1:43210/health') {
      return Response.json({ status: 'healthy' }, { status: backendStatus });
    }
    if (url === routerUrl + '/') return new Response('<!doctype html>', { status: 200 });
    return new Response('not found', { status: 404 });
  };
}

test('uses the user-local runtime state root and permits an explicit override', () => {
  assert.equal(
    defaultOperatorConsoleRuntimeStateRoot({ NARADA_OPERATOR_CONSOLE_RUNTIME_STATE_ROOT: 'D:\\tmp\\console-runtime' }),
    'D:\\tmp\\console-runtime',
  );
  assert.match(
    defaultOperatorConsoleRuntimeStateRoot({ USERPROFILE: 'C:\\Users\\Carrier' }),
    /Carrier[\\/]AppData[\\/]Local[\\/]Narada[\\/]operator-console-runtime$/,
  );
});

test('uses the matched runtime state log path for process diagnostics', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-runtime-'));
  try {
    const logPath = join(stateRoot, 'console-20260724-actual.log');
    await writeFile(join(stateRoot, 'registration-token'), 'test-token\\n', 'utf8');
    await writeFile(join(stateRoot, 'state.json'), JSON.stringify({
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'ready',
      pid: 4321,
      instance_nonce: 'testnonce1234',
      url: routerUrl,
      log_path: logPath,
      state_path: join(stateRoot, 'state.json'),
    }), 'utf8');
    const result = await probeOperatorConsoleRuntime({
      router_state_root: stateRoot,
      runtime_state_root: stateRoot,
      fetch_fn: fakeFetchFactory({ pid: 4321 }),
    });
    assert.deepEqual(result.process, {
      pid: 4321,
      log_path: logPath,
      state_path: join(stateRoot, 'state.json'),
      instance_nonce: 'testnonce1234',
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('reports a ready projection only after router, backend, and workspace checks pass', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-runtime-'));
  try {
    await writeFile(join(stateRoot, 'registration-token'), 'test-token\\n', 'utf8');
    const result = await probeOperatorConsoleRuntime({
      router_state_root: stateRoot,
      fetch_fn: fakeFetchFactory(),
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.route_state, 'healthy');
    assert.equal(result.router_url, routerUrl);
    assert.equal(result.route_id, 'operator-console');
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('does not call a degraded backend ready', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-runtime-'));
  try {
    await writeFile(join(stateRoot, 'registration-token'), 'test-token\\n', 'utf8');
    const result = await probeOperatorConsoleRuntime({
      router_state_root: stateRoot,
      fetch_fn: fakeFetchFactory({ backendStatus: 503 }),
    });
    assert.equal(result.status, 'degraded');
    assert.equal(result.reason, 'operator_console_backend_unhealthy');
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('reports an absent router without creating a projection', async () => {
  const result = await probeOperatorConsoleRuntime({
    fetch_fn: async () => {
      throw new Error('connection_refused');
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'operator_router_not_running');
});

test('keeps runtime state intact because probing is read-only', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-console-runtime-'));
  try {
    const statePath = join(stateRoot, 'state.json');
    await writeFile(join(stateRoot, 'registration-token'), 'test-token\\n', 'utf8');
    await writeFile(statePath, JSON.stringify({
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'starting',
      pid: 4321,
    }), 'utf8');
    const baseFetch = fakeFetchFactory();
    const result = await probeOperatorConsoleRuntime({
      router_state_root: stateRoot,
      runtime_state_root: stateRoot,
      fetch_fn: async (input, init) => {
        if (String(input) === routerUrl + '/routes') {
          return Response.json({
            schema: 'narada.operator_router.routes.v1',
            identity: 'narada.operator-router',
            routes: [],
          });
        }
        return baseFetch(input, init);
      },
    });
    assert.equal(result.reason, 'operator_console_route_missing');
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), {
      schema: 'narada.operator_console_runtime.state.v1',
      status: 'starting',
      pid: 4321,
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
