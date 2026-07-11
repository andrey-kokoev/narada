import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  historyCaptureCommand,
  historyEnableCommand,
  historyListCommand,
  historyStartCommand,
  historyStatusCommand,
  historyStopCommand,
} from '../../src/commands/history.ts';

function context() {
  return {
    configPath: './config.json',
    verbose: false,
    logger: {
      debug() {}, info() {}, warn() {}, warning() {}, success() {}, error() {}, result() {}, trace() {},
    },
  };
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

test('history CLI supervises a background daemon through its lifecycle record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cli-history-daemon-'));
  const daemonPath = join(root, '.narada', 'runtime', 'local-history', 'daemon.json');
  try {
    const enabled = await historyEnableCommand({ siteRoot: root, format: 'json' }, context());
    assert.equal(enabled.exitCode, 0);
    const started = await historyStartCommand({ siteRoot: root, background: true, format: 'json' }, context());
    assert.equal(started.exitCode, 0);
    assert.equal(started.result.status, 'started');
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
