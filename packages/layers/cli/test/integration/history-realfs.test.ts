import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  historyCaptureCommand,
  historyDiffCommand,
  historyEnableCommand,
  historyListCommand,
  historyRestoreCommand,
  historyStartCommand,
  historyStatusCommand,
  historyStopCommand,
} from '../../src/commands/history.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPackageRoot = resolve(__dirname, '..', '..');
const naradaRoot = resolve(cliPackageRoot, '..', '..', '..');
const cliPath = join(cliPackageRoot, 'dist', 'main.js');

function context() {
  return {
    configPath: './config.json',
    verbose: false,
    logger: {
      debug() {}, info() {}, warn() {}, warning() {}, success() {}, error() {}, result() {}, trace() {},
    },
  };
}

async function listTemporaryFiles(root) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.tmp')) result.push(path);
    }
  }
  await visit(root);
  return result;
}

async function initGitRoot(root, ignore = '') {
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), ignore ? `${ignore}\n` : '');
}

function runBuiltCli(args, expectedStatus = 0, envOverrides = {}) {
  const result = spawnSync(process.execPath, [cliPath, '--format', 'json', ...args], {
    cwd: naradaRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...envOverrides },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, expectedStatus, `CLI failed: ${result.stderr || result.stdout}`);
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    assert.fail(`CLI did not emit JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout}\n${result.stderr}`);
  }
}

async function waitForBuiltCli({ siteRoot, args = ['history', 'list'], check }, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = runBuiltCli([...args, '--site-root', siteRoot]);
      if (await check(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`history_cli_wait_timeout: ${lastError instanceof Error ? lastError.message : 'predicate not satisfied'}`);
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('history_test_wait_timeout');
}

test('history CLI projects Site metadata through a real SQLite store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-user-history-'));
  try {
    await writeFile(join(root, 'cli.txt'), 'cli\n');
    const enabled = await historyEnableCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(enabled.exitCode, 0);
    const captured = await historyCaptureCommand({ siteRoot: root, path: 'cli.txt', format: 'json' }, context());
    assert.equal(captured.exitCode, 0);
    assert.equal(captured.result.status, 'captured');
    const started = await historyStartCommand({ siteRoot: root, once: true, format: 'json' }, context());
    assert.equal(started.exitCode, 0);
    const listed = await historyListCommand({ siteRoot: root, userProjectionRoot: userSite, format: 'json' }, context());
    assert.equal(listed.exitCode, 0);
    const projectionPath = listed.result.user_site_projection_path;
    assert.ok(projectionPath);
    assert.match(await readFile(projectionPath, 'utf8'), /"content_included": false/);
    const status = await historyStatusCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(status.exitCode, 0);
    assert.equal(status.result.command_status, 'success');
    assert.equal(status.result.status, 'enabled');
  } finally {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(userSite, { recursive: true, force: true })]);
  }
});

test('built narada CLI fails closed and cleans temporary blobs on storage faults', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-storage-faults-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    await writeFile(join(root, 'fault.txt'), 'fault fixture\n');
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    for (const fault of ['blob_write', 'blob_rename']) {
      const failed = runBuiltCli(
        ['history', 'capture', 'fault.txt', '--site-root', root],
        1,
        { NODE_ENV: 'test', NARADA_LOCAL_HISTORY_TEST_IO_FAULT: fault },
      );
      assert.match(failed.error, /^local_history_storage_write_failed:/);
      const listed = runBuiltCli(['history', 'list', '--site-root', root]);
      assert.equal(listed.files.some((file) => file.relative_path === 'fault.txt'), false);
      assert.deepEqual(await listTemporaryFiles(join(root, '.narada')), []);
    }
    const interrupted = runBuiltCli(
      ['history', 'capture', 'fault.txt', '--site-root', root],
      1,
      { NODE_ENV: 'test', NARADA_LOCAL_HISTORY_TEST_IO_FAULT: 'blob_rename_eintr' },
    );
    assert.match(interrupted.error, /^local_history_storage_write_failed:/);
    assert.deepEqual(await listTemporaryFiles(join(root, '.narada')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('built narada CLI rejects malformed User Site defaults at the command boundary', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-malformed-defaults-site-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-malformed-defaults-user-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    await mkdir(join(userSite, 'config'), { recursive: true });
    await writeFile(join(userSite, 'config', 'local-history.defaults.json'), '{broken');
    const malformed = runBuiltCli([
      'history', 'enable', '--site-root', root, '--user-site-root', userSite,
    ], 1);
    assert.match(malformed.error, /local_history_defaults_corrupt/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(userSite, { recursive: true, force: true });
  }
});

test('built narada CLI treats Site workspace and authority roots as the same target', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-authority-root-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    const workspaceInput = runBuiltCli(['history', 'enable', '--site-root', root]);
    const authorityInput = runBuiltCli(['history', 'status', '--site-root', join(root, '.narada')]);
    assert.equal(workspaceInput.status, 'success');
    assert.equal(authorityInput.status, 'enabled');
    assert.equal(authorityInput.policy_path, workspaceInput.policy_path);
    assert.equal(authorityInput.store_root, workspaceInput.store_root);
    assert.equal(authorityInput.workspace_root, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('built narada CLI resolves User Site defaults from NARADA_USER_SITE_ROOT', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-env-defaults-site-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-env-defaults-user-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    await mkdir(join(userSite, 'config'), { recursive: true });
    await writeFile(join(userSite, 'config', 'local-history.defaults.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.defaults.v1',
      roots: ['src'],
    })}\n`);
    const enabled = runBuiltCli(
      ['history', 'enable', '--site-root', root],
      0,
      { NARADA_USER_SITE_ROOT: userSite },
    );
    assert.equal(enabled.status, 'success');
    assert.equal(enabled.policy_defaults_source, 'user_site_defaults');
    assert.equal(enabled.policy_defaults_path, join(userSite, 'config', 'local-history.defaults.json'));
    assert.deepEqual(enabled.policy.roots, ['src']);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(userSite, { recursive: true, force: true });
  }
});

test('built narada CLI resolves User Site defaults once and exposes full policy configuration', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-defaults-site-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-defaults-user-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'allowed.txt'), 'allowed\n');
    await writeFile(join(root, 'root.txt'), 'outside configured roots\n');
    await writeFile(join(root, '.env'), 'TOKEN=must-not-capture\n');
    await mkdir(join(userSite, 'config'), { recursive: true });
    await writeFile(join(userSite, 'config', 'local-history.defaults.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.defaults.v1',
      roots: ['src'],
      privacy_posture: 'custom_exclusions',
      exclusions: ['scratch/**'],
      max_file_size_bytes: 1024,
      stable_read_attempts: 4,
      stable_read_delay_ms: 25,
    })}\n`);
    const enabled = runBuiltCli([
      'history', 'enable', '--site-root', root, '--user-site-root', userSite,
    ]);
    assert.equal(enabled.status, 'success');
    assert.equal(enabled.policy.enabled, true);
    assert.equal(enabled.policy_defaults_source, 'user_site_defaults');
    assert.equal(enabled.policy.roots[0], 'src');
    assert.equal(enabled.policy.max_file_size_bytes, 1024);
    assert.equal(enabled.policy.stable_read_attempts, 4);
    assert.equal(enabled.policy.privacy_posture, 'custom_exclusions');
    assert.ok(enabled.policy.exclusions.includes('.env'));
    assert.ok(!enabled.policy.exclusions.includes('**/dist/**'));

    const admitted = runBuiltCli(['history', 'capture', 'src/allowed.txt', '--site-root', root]);
    assert.equal(admitted.status, 'captured');
    const outsideConfiguredRoot = runBuiltCli(['history', 'capture', 'root.txt', '--site-root', root], 1);
    assert.equal(outsideConfiguredRoot.command_status, 'refused');
    assert.equal(outsideConfiguredRoot.status, 'not_admitted');
    assert.equal(outsideConfiguredRoot.reason, 'path_outside_admitted_roots');

    const configured = runBuiltCli([
      'history', 'configure', '--site-root', root,
      '--privacy-posture', 'custom_exclusions', '--replace-exclusions',
      '--exclude', 'docs/generated/**', '--stable-read-attempts', '5',
      '--stable-read-delay-ms', '75', '--debounce-ms', '900',
    ]);
    assert.equal(configured.status, 'success');
    assert.equal(configured.policy.stable_read_attempts, 5);
    assert.equal(configured.policy.stable_read_delay_ms, 75);
    assert.equal(configured.policy.debounce_ms, 900);
    assert.deepEqual(configured.policy.roots, ['src']);
    assert.ok(configured.policy.exclusions.includes('.env'));
    assert.ok(configured.policy.exclusions.includes('docs/generated/**'));
    assert.ok(!configured.policy.exclusions.includes('**/dist/**'));

    await writeFile(join(userSite, 'config', 'local-history.defaults.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.defaults.v1',
      roots: ['changed-default-root'],
      max_file_size_bytes: 2048,
    })}\n`);
    const afterDefaultsChange = runBuiltCli([
      'history', 'configure', '--site-root', root, '--user-site-root', userSite,
    ]);
    assert.equal(afterDefaultsChange.policy_defaults_source, 'persisted_policy');
    assert.deepEqual(afterDefaultsChange.policy.roots, ['src']);
    assert.equal(afterDefaultsChange.policy.max_file_size_bytes, 1024);

    const tamperedPolicyPath = join(root, '.narada', 'local-history.json');
    const tamperedPolicy = JSON.parse(await readFile(tamperedPolicyPath, 'utf8'));
    tamperedPolicy.roots = ['.'];
    tamperedPolicy.exclusions = [];
    await writeFile(tamperedPolicyPath, `${JSON.stringify(tamperedPolicy)}\n`);
    const tamperedSecretCapture = runBuiltCli(['history', 'capture', '.env', '--site-root', root], 1);
    assert.equal(tamperedSecretCapture.command_status, 'refused');
    assert.equal(tamperedSecretCapture.status, 'not_admitted');
    assert.equal(tamperedSecretCapture.reason, 'path_excluded_by_policy');
  } finally {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(userSite, { recursive: true, force: true })]);
  }
});

test('built narada CLI refuses reparse-point paths when Windows permits junction creation', { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-reparse-'));
  const outsideRoot = await mkdtemp(join(tmpdir(), 'narada-cli-history-reparse-outside-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    const linkedRoot = join(root, 'linked');
    try {
      await symlink(outsideRoot, linkedRoot, 'junction');
    } catch (error) {
      if (error?.code === 'EPERM') {
        t.skip('junction creation is not permitted by this Windows test environment');
        return;
      }
      throw error;
    }
    const reparse = runBuiltCli(['history', 'capture', 'linked/missing.txt', '--site-root', root], 1);
    assert.equal(reparse.command_status, 'refused');
    assert.equal(reparse.status, 'not_admitted');
    assert.equal(reparse.reason, 'symlink_or_reparse_point_refused');
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test('built narada CLI reports corrupt policy and lifecycle metadata', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-corrupt-'));
  const policyPath = join(root, '.narada', 'local-history.json');
  const storeRoot = join(root, '.narada', 'runtime', 'local-history');
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    const missing = runBuiltCli(['history', 'start', '--site-root', root, '--once'], 1);
    assert.equal(missing.error, 'local_history_policy_missing');

    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    await mkdir(storeRoot, { recursive: true });
    const disabledPolicy = JSON.parse(await readFile(policyPath, 'utf8'));
    disabledPolicy.enabled = false;
    await writeFile(policyPath, `${JSON.stringify(disabledPolicy)}\n`);
    const disabled = runBuiltCli(['history', 'start', '--site-root', root, '--once'], 1);
    assert.equal(disabled.error, 'local_history_disabled');

    await writeFile(policyPath, '{broken');
    const corruptPolicy = runBuiltCli(['history', 'status', '--site-root', root], 1);
    assert.match(corruptPolicy.error, /local_history_policy_corrupt/);

    await rm(policyPath);
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    await writeFile(join(storeRoot, 'health.json'), '{broken');
    const corruptHealth = runBuiltCli(['history', 'status', '--site-root', root], 1);
    assert.match(corruptHealth.error, /local_history_metadata_corrupt/);

    await rm(join(storeRoot, 'health.json'));
    await writeFile(join(root, 'lock.txt'), 'lock\n');
    await writeFile(join(storeRoot, 'owner.lock'), '{broken');
    const corruptLock = runBuiltCli(['history', 'capture', 'lock.txt', '--site-root', root], 1);
    assert.match(corruptLock.error, /local_history_metadata_corrupt/);

    await rm(join(storeRoot, 'owner.lock'));
    await writeFile(join(storeRoot, 'daemon.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.daemon.v1',
      owner_id: 'dead-daemon',
      pid: 999999999,
      started_at: new Date(0).toISOString(),
      health_path: join(storeRoot, 'health.json'),
    })}\n`);
    await writeFile(join(storeRoot, 'health.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.health.v1',
      state: 'running',
      pid: 999999999,
      started_at: new Date(0).toISOString(),
    })}\n`);
    const stale = runBuiltCli(['history', 'status', '--site-root', root]);
    assert.equal(stale.watcher.state, 'failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('built narada CLI enforces admission and User Site projection boundaries', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-admission-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-projection-user-'));
  const unregisteredRoot = await mkdtemp(join(tmpdir(), 'narada-cli-history-unregistered-'));
  const unregisteredUserSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-unregistered-user-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    await initGitRoot(userSite);
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    await writeFile(join(root, '.env'), 'TOKEN=do-not-capture\n');
    const excluded = runBuiltCli(['history', 'capture', '.env', '--site-root', root], 1);
    assert.equal(excluded.command_status, 'refused');
    assert.equal(excluded.status, 'not_admitted');
    assert.equal(excluded.reason, 'path_excluded_by_policy');

    const outside = runBuiltCli(['history', 'capture', '../outside.txt', '--site-root', root], 1);
    assert.equal(outside.error, 'local_history_relative_path_invalid');

    await writeFile(join(root, 'large.txt'), '12');
    assert.equal(runBuiltCli(['history', 'configure', '--site-root', root, '--max-file-size', '1']).status, 'success');
    const oversized = runBuiltCli(['history', 'capture', 'large.txt', '--site-root', root]);
    assert.equal(oversized.status, 'skipped');
    assert.equal(oversized.reason, 'file_too_large');

    const unignoredProjection = runBuiltCli(['history', 'status', '--site-root', root, '--user-projection-root', userSite], 1);
    assert.match(unignoredProjection.error, /local_history_projection_not_ignored/);
    await writeFile(join(userSite, '.gitignore'), '.narada/runtime/local-history/projections/\n');
    assert.equal(runBuiltCli(['history', 'status', '--site-root', root, '--user-projection-root', userSite]).status, 'enabled');

    await initGitRoot(unregisteredRoot);
    const unignoredUserRoot = runBuiltCli([
      'history', 'enable', '--user-site-root', unregisteredUserSite, '--root', unregisteredRoot,
    ], 1);
    assert.match(unignoredUserRoot.error, /local_history_store_not_ignored/);
    await writeFile(join(unregisteredRoot, '.gitignore'), '.narada/local-history-workspace.json\n');
    assert.equal(runBuiltCli([
      'history', 'enable', '--user-site-root', unregisteredUserSite, '--root', unregisteredRoot,
    ]).status, 'success');

  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(userSite, { recursive: true, force: true }),
      rm(unregisteredRoot, { recursive: true, force: true }),
      rm(unregisteredUserSite, { recursive: true, force: true }),
    ]);
  }
});

test('built narada CLI handles missing, binary, and pinned snapshot failures', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-snapshot-failures-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    const missingShow = runBuiltCli(['history', 'show', 'snap_missing', '--site-root', root], 1);
    assert.equal(missingShow.error, 'history_snapshot_not_found');
    const missingDiff = runBuiltCli(['history', 'diff', '--from', 'snap_missing', '--to', 'snap_missing', '--site-root', root], 1);
    assert.equal(missingDiff.error, 'history_snapshot_not_found');
    const missingRestore = runBuiltCli(['history', 'restore', 'snap_missing', '--site-root', root, '--confirm'], 1);
    assert.equal(missingRestore.error, 'history_snapshot_not_found');

    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2]));
    assert.equal(runBuiltCli(['history', 'capture', 'binary.bin', '--site-root', root]).status, 'captured');
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 3]));
    assert.equal(runBuiltCli(['history', 'capture', 'binary.bin', '--site-root', root]).status, 'captured');
    const listed = runBuiltCli(['history', 'list', '--site-root', root]);
    const snapshots = listed.files.find((file) => file.relative_path === 'binary.bin').snapshots;
    const originalSnapshot = snapshots.at(-1).snapshot_id;
    assert.equal(runBuiltCli([
      'history', 'diff', '--from', snapshots[0].snapshot_id, '--to', snapshots[1].snapshot_id, '--site-root', root,
    ]).status, 'binary');
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 9, 9]));
    assert.equal(runBuiltCli(['history', 'restore', originalSnapshot, '--site-root', root, '--confirm', '--force']).status, 'restored');
    assert.deepEqual([...await readFile(join(root, 'binary.bin'))], [0, 1, 2]);
    assert.equal(runBuiltCli(['history', 'pin', originalSnapshot, '--site-root', root]).status, 'success');
    const pinned = runBuiltCli(['history', 'forget', originalSnapshot, '--site-root', root], 1);
    assert.equal(pinned.error, 'history_snapshot_pinned');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('built narada CLI detects abrupt daemon death and stop timeout', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-daemon-crash-'));
  const timeoutRoot = await mkdtemp(join(tmpdir(), 'narada-cli-history-stop-timeout-'));
  try {
    await initGitRoot(root, '.narada/runtime/local-history/');
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    const started = runBuiltCli(['history', 'start', '--site-root', root, '--background', '--poll-interval-ms', '100']);
    assert.equal(started.status, 'started');
    assert.ok(Number(started.pid) > 0);
    process.kill(Number(started.pid), 'SIGKILL');
    const failed = await waitForBuiltCli({
      siteRoot: root,
      args: ['history', 'status'],
      check: (value) => value.watcher?.state === 'failed',
    });
    assert.equal(failed.watcher.state, 'failed');
    assert.equal(runBuiltCli(['history', 'stop', '--site-root', root]).status, 'not_running');
    const restarted = runBuiltCli(['history', 'start', '--site-root', root, '--background', '--poll-interval-ms', '100']);
    assert.equal(restarted.status, 'started');
    assert.equal(runBuiltCli(['history', 'stop', '--site-root', root]).status, 'stop_requested');
    const restartedStopped = await waitForBuiltCli({
      siteRoot: root,
      args: ['history', 'status'],
      check: (value) => value.watcher?.state === 'stopped',
    });
    assert.equal(restartedStopped.watcher.state, 'stopped');

    await initGitRoot(timeoutRoot, '.narada/runtime/local-history/');
    assert.equal(runBuiltCli(['history', 'enable', '--site-root', timeoutRoot]).status, 'success');
    const timeoutStoreRoot = join(timeoutRoot, '.narada', 'runtime', 'local-history');
    await mkdir(timeoutStoreRoot, { recursive: true });
    await writeFile(join(timeoutStoreRoot, 'daemon.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.daemon.v1',
      owner_id: 'stubborn-daemon',
      pid: process.pid,
      started_at: new Date().toISOString(),
      health_path: join(timeoutStoreRoot, 'health.json'),
    })}\n`);
    const pending = runBuiltCli(['history', 'stop', '--site-root', timeoutRoot]);
    assert.equal(pending.status, 'stop_requested');
    assert.equal(pending.reason, 'termination_pending');
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(timeoutRoot, { recursive: true, force: true }),
    ]);
  }
});

test('built narada CLI completes the local-history operator happy path', { timeout: 90_000 }, async () => {
  assert.equal(existsSync(cliPath), true, `CLI dist missing: ${cliPath}. Run pnpm --filter @narada2/cli build first.`);
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-built-'));
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-built-user-'));
  let started = false;
  try {
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    await writeFile(join(root, '.gitignore'), '.narada/runtime/local-history/\n');
    await writeFile(join(root, 'notes.txt'), 'one\n');

    assert.equal(runBuiltCli(['history', 'enable', '--site-root', root]).status, 'success');
    assert.equal(runBuiltCli(['history', 'start', '--site-root', root, '--background', '--poll-interval-ms', '100']).status, 'started');
    started = true;

    const firstList = await waitForBuiltCli({
      siteRoot: root,
      check: (value) => value.files?.some((file) => file.relative_path === 'notes.txt' && file.snapshots?.length >= 1),
    });
    const firstFile = firstList.files.find((file) => file.relative_path === 'notes.txt');
    const firstSnapshot = firstFile.snapshots.at(-1).snapshot_id;
    assert.equal(runBuiltCli(['history', 'show', firstSnapshot, '--site-root', root]).status, 'success');

    await writeFile(join(root, 'notes.txt'), 'two\n');
    const secondList = await waitForBuiltCli({
      siteRoot: root,
      check: (value) => value.files?.some((file) => file.relative_path === 'notes.txt' && file.snapshots?.length >= 2),
    });
    const secondFile = secondList.files.find((file) => file.relative_path === 'notes.txt');
    const secondSnapshot = secondFile.snapshots.find((snapshot) => snapshot.snapshot_id !== firstSnapshot).snapshot_id;
    const blockedMutation = runBuiltCli(['history', 'pin', firstSnapshot, '--site-root', root], 1);
    assert.equal(blockedMutation.status, 'error');
    assert.match(blockedMutation.error, /stop the background history process/);

    const stop = runBuiltCli(['history', 'stop', '--site-root', root]);
    assert.equal(['stop_requested', 'not_running'].includes(stop.status), true);
    const stopped = await waitForBuiltCli({
      siteRoot: root,
      args: ['history', 'status'],
      check: (value) => value.watcher?.state === 'stopped',
    });
    assert.equal(stopped.watcher.state, 'stopped');

    assert.equal(runBuiltCli(['history', 'diff', '--from', firstSnapshot, '--to', secondSnapshot, '--site-root', root]).status, 'different');
    assert.equal(runBuiltCli(['history', 'pin', firstSnapshot, '--site-root', root]).status, 'success');

    const stale = runBuiltCli(['history', 'restore', firstSnapshot, '--site-root', root, '--confirm'], 1);
    assert.equal(stale.status, 'refused');
    assert.equal(runBuiltCli(['history', 'restore', firstSnapshot, '--site-root', root, '--confirm', '--force']).status, 'restored');
    assert.equal(await readFile(join(root, 'notes.txt'), 'utf8'), 'one\n');
    assert.equal(runBuiltCli(['history', 'forget', secondSnapshot, '--site-root', root]).status, 'forgotten');
    assert.equal(runBuiltCli(['history', 'status', '--site-root', root, '--user-projection-root', userSite]).status, 'enabled');
  } finally {
    if (started) runBuiltCli(['history', 'stop', '--site-root', root]);
    await Promise.all([rm(root, { recursive: true, force: true }), rm(userSite, { recursive: true, force: true })]);
  }
});

test('built narada CLI preserves User Site-root history identity across relocation', { timeout: 60_000 }, async () => {
  assert.equal(existsSync(cliPath), true, `CLI dist missing: ${cliPath}. Run pnpm --filter @narada2/cli build first.`);
  const userSite = await mkdtemp(join(tmpdir(), 'narada-cli-history-relocation-user-'));
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-relocation-root-'));
  const parent = await mkdtemp(join(tmpdir(), 'narada-cli-history-relocation-parent-'));
  const movedRoot = join(parent, 'moved-root');
  try {
    await writeFile(join(root, 'scratch.txt'), 'scratch\n');
    assert.equal(runBuiltCli(['history', 'enable', '--user-site-root', userSite, '--root', root]).status, 'success');
    assert.equal(runBuiltCli(['history', 'capture', 'scratch.txt', '--user-site-root', userSite, '--root', root]).status, 'captured');
    assert.equal(runBuiltCli(['history', 'start', '--user-site-root', userSite, '--root', root, '--once']).status, 'stopped');
    const before = runBuiltCli(['history', 'list', '--user-site-root', userSite, '--root', root]);
    const beforeWorkspaceId = before.files.find((file) => file.relative_path === 'scratch.txt').workspace_id;
    await rename(root, movedRoot);
    const after = runBuiltCli(['history', 'list', '--user-site-root', userSite, '--root', movedRoot]);
    const afterWorkspaceId = after.files.find((file) => file.relative_path === 'scratch.txt').workspace_id;
    assert.equal(afterWorkspaceId, beforeWorkspaceId);
    assert.equal(after.files[0].relative_path, 'scratch.txt');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(movedRoot, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
    await rm(userSite, { recursive: true, force: true });
  }
});

test('history CLI checks ignore rules at each owning Git boundary', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'narada-cli-history-user-git-'));
  const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-cli-history-user-site-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: workspaceRoot, stdio: 'ignore' });
    await writeFile(join(workspaceRoot, '.gitignore'), '.narada/local-history-workspace.json\n');
    const enabled = await historyEnableCommand({ userSiteRoot, root: workspaceRoot, format: 'json' }, context());
    assert.equal(enabled.exitCode, 0);
  } finally {
    await Promise.all([rm(workspaceRoot, { recursive: true, force: true }), rm(userSiteRoot, { recursive: true, force: true })]);
  }
});

test('history CLI exposes diff and stale-safe restore through the owning Site', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-restore-'));
  try {
    const enabled = await historyEnableCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(enabled.exitCode, 0);
    await writeFile(join(root, 'restore.txt'), 'original\n');
    const first = await historyCaptureCommand({ siteRoot: root, path: 'restore.txt', format: 'json' }, context());
    await writeFile(join(root, 'restore.txt'), 'changed\n');
    const second = await historyCaptureCommand({ siteRoot: root, path: 'restore.txt', format: 'json' }, context());
    const diff = await historyDiffCommand({ siteRoot: root, from: first.result.snapshot_id, to: second.result.snapshot_id, format: 'json' }, context());
    assert.equal(diff.result.status, 'different');
    const refused = await historyRestoreCommand({ siteRoot: root, snapshot: first.result.snapshot_id, confirm: true, format: 'json' }, context());
    assert.equal(refused.result.status, 'refused');
    const restored = await historyRestoreCommand({ siteRoot: root, snapshot: first.result.snapshot_id, confirm: true, force: true, format: 'json' }, context());
    assert.equal(restored.result.status, 'restored');
    assert.equal(await readFile(join(root, 'restore.txt'), 'utf8'), 'original\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('history CLI supervises a background daemon through its lifecycle record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-daemon-'));
  const daemonPath = join(root, '.narada', 'runtime', 'local-history', 'daemon.json');
  try {
    const enabled = await historyEnableCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(enabled.exitCode, 0);
    const started = await historyStartCommand({ siteRoot: root, background: true, format: 'json' }, context());
    assert.equal(started.exitCode, 0);
    assert.equal(started.result.status, 'started');
    await assert.rejects(
      historyStartCommand({ siteRoot: root, background: true, format: 'json' }, context()),
      /local_history_daemon_start_failed/,
    );
    await waitFor(async () => {
      try {
        const record = JSON.parse(await readFile(daemonPath, 'utf8'));
        return record.schema === 'narada.local_work_history.daemon.v1';
      } catch {
        return false;
      }
    });
    const running = await historyStatusCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(running.result.watcher.state, 'running');
    const stopped = await historyStopCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(stopped.exitCode, 0);
    assert.equal(stopped.result.status, 'stop_requested');
    await waitFor(async () => {
      try {
        await readFile(daemonPath, 'utf8');
        return false;
      } catch {
        return true;
      }
    });
  } finally {
    await historyStopCommand({ siteRoot: root, format: 'json' }, context()).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
