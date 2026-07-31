import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA,
  buildTunnelInvocation,
  operatorConsoleMirrorStatus,
  readOperatorConsoleMirrorState,
  runOperatorConsoleMirror,
  stopOperatorConsoleMirror,
  type OperatorConsoleMirrorState,
} from '../src/index.ts';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('cloudflared invocation', () => {
  it('keeps a tunnel token in the child environment, not argv or durable metadata', () => {
    const invocation = buildTunnelInvocation({}, { TUNNEL_TOKEN: 'secret-tunnel-token' });

    assert.equal(invocation.mode, 'token');
    assert.equal(invocation.env.TUNNEL_TOKEN, 'secret-tunnel-token');
    assert.ok(!invocation.args.includes('secret-tunnel-token'));
    assert.ok(!JSON.stringify({ args: invocation.args, mode: invocation.mode, name: invocation.name, token_file: invocation.token_file }).includes('secret-tunnel-token'));
  });

  it('supports token files and named tunnels as mutually exclusive modes', () => {
    const tokenFile = buildTunnelInvocation({ tunnel_token_file: 'C:\\secrets\\tunnel.token' });
    assert.equal(tokenFile.mode, 'token-file');
    assert.deepEqual(tokenFile.args.slice(-2), ['--token-file', 'C:\\secrets\\tunnel.token']);

    const named = buildTunnelInvocation({ tunnel_name: 'operator-console', cloudflared_config: 'C:\\cloudflared\\config.yml' });
    assert.equal(named.mode, 'named');
    assert.equal(named.runner, 'cloudflared');
    assert.equal(named.args.at(-1), 'operator-console');
    const wrangler = buildTunnelInvocation({ tunnel_name: 'narada-operator-console' }, { NARADA_WRANGLER_BINARY: 'wrangler.cmd' });
    assert.equal(wrangler.runner, 'wrangler');
    assert.equal(wrangler.health_source, 'process');
    assert.equal(wrangler.binary, 'wrangler.cmd');
    assert.deepEqual(wrangler.args, ['tunnel', 'run', 'narada-operator-console', '--log-level', 'info']);
    assert.equal(wrangler.metrics_url, null);
    assert.throws(
      () => buildTunnelInvocation({ tunnel_name: 'operator-console', tunnel_token_file: 'C:\\secrets\\tunnel.token' }),
      (error: unknown) => error instanceof Error && error.message === 'operator_console_mirror_tunnel_configuration_required',
    );
  });
});

describe('durable mirror state', () => {
  it('returns an explicit not-running result when state is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-mirror-runtime-'));
    temporaryRoots.push(root);
    const result = await operatorConsoleMirrorStatus({ state_root: root });
    assert.equal(result.status, 'not_running');
    assert.equal(result.state, null);
    assert.equal(result.owner_alive, false);
  });

  it('reads a stopped state without probing a dead gateway', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-mirror-runtime-'));
    temporaryRoots.push(root);
    const statePath = join(root, 'state.json');
    const state: OperatorConsoleMirrorState = {
      schema: OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA,
      status: 'stopped',
      operation: 'rotate',
      instance_nonce: 'test-nonce',
      owner_pid: -1,
      gateway: { url: 'http://127.0.0.1:61730', router_url: 'http://127.0.0.1:61729', host: '127.0.0.1', port: 61730 },
      tunnel: { pid: null, binary: 'cloudflared', mode: 'token-file', name: null, token_file: 'C:\\secrets\\tunnel.token', metrics_url: 'http://127.0.0.1:61731' },
      public_origin: 'https://console.example.test',
      log_path: join(root, 'mirror.log'),
      tunnel_log_path: join(root, 'tunnel.log'),
      state_path: statePath,
      started_at: new Date(0).toISOString(),
      stopped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await writeFile(statePath, `${JSON.stringify(state)}\n`, 'utf8');

    assert.deepEqual(await readOperatorConsoleMirrorState(root), state);
    const result = await operatorConsoleMirrorStatus({ state_root: root, fetch_fn: () => { throw new Error('must not probe'); } });
    assert.equal(result.status, 'stopped');
    assert.equal(result.health, null);
  });

  it('uses the mirror host health snapshot when status has no bridge credential', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-mirror-runtime-'));
    temporaryRoots.push(root);
    const statePath = join(root, 'state.json');
    const checkedAt = new Date().toISOString();
    const state: OperatorConsoleMirrorState = {
      schema: OPERATOR_CONSOLE_MIRROR_STATE_SCHEMA,
      status: 'ready',
      operation: 'start',
      instance_nonce: 'active-nonce',
      owner_pid: process.pid,
      gateway: { url: 'http://127.0.0.1:61730', router_url: 'http://127.0.0.1:61729', host: '127.0.0.1', port: 61730 },
      tunnel: { pid: process.pid, binary: 'wrangler.cmd', mode: 'named', name: 'narada-operator-console', token_file: null, metrics_url: null, runner: 'wrangler', health_source: 'process' },
      public_origin: 'https://console.example.test',
      log_path: join(root, 'mirror.log'),
      tunnel_log_path: join(root, 'tunnel.log'),
      state_path: statePath,
      started_at: new Date(0).toISOString(),
      ready_at: checkedAt,
      updated_at: checkedAt,
      health: { gateway: 'healthy', tunnel: 'connected', checked_at: checkedAt },
    };
    await writeFile(statePath, `${JSON.stringify(state)}\n`, 'utf8');

    const result = await operatorConsoleMirrorStatus({
      state_root: root,
      fetch_fn: () => { throw new Error('status without a credential must not probe the protected gateway'); },
    });

    assert.equal(result.status, 'ready');
    assert.deepEqual(result.health, state.health);
  });

  it('persists a typed failure when tunnel configuration is invalid before gateway start', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-mirror-runtime-'));
    temporaryRoots.push(root);
    const previousRun = process.env.NARADA_OPERATOR_CONSOLE_MIRROR_RUN;
    const previousNonce = process.env.NARADA_OPERATOR_CONSOLE_MIRROR_NONCE;
    process.env.NARADA_OPERATOR_CONSOLE_MIRROR_RUN = '1';
    process.env.NARADA_OPERATOR_CONSOLE_MIRROR_NONCE = 'failure-test-nonce';
    try {
      await assert.rejects(
        runOperatorConsoleMirror({
          state_root: root,
          router_token: 'router-token-0123456789',
          bridge_token: 'bridge-token-0123456789',
          timeout_ms: 500,
        }),
        (error: unknown) => error instanceof Error && error.message === 'operator_console_mirror_tunnel_configuration_required',
      );
    } finally {
      if (previousRun === undefined) delete process.env.NARADA_OPERATOR_CONSOLE_MIRROR_RUN;
      else process.env.NARADA_OPERATOR_CONSOLE_MIRROR_RUN = previousRun;
      if (previousNonce === undefined) delete process.env.NARADA_OPERATOR_CONSOLE_MIRROR_NONCE;
      else process.env.NARADA_OPERATOR_CONSOLE_MIRROR_NONCE = previousNonce;
    }
    const state = await readOperatorConsoleMirrorState(root);
    assert.equal(state?.status, 'failed');
    assert.equal(state?.failure?.code, 'operator_console_mirror_tunnel_configuration_required');
    assert.equal(state?.tunnel.mode, 'unconfigured');
  });

  it('refuses a competing lifecycle owner while the mirror lock is fresh', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-mirror-runtime-'));
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'mirror.lock'), JSON.stringify({
      schema: 'narada.operator_console_mirror.lock.v1',
      token: 'fresh-owner',
      pid: process.pid,
      created_at: new Date().toISOString(),
    }), 'utf8');

    await assert.rejects(
      stopOperatorConsoleMirror({ state_root: root, lock_timeout_ms: 500 }),
      (error: unknown) => error instanceof Error && error.message === 'operator_console_mirror_lock_timeout',
    );
  });
});
