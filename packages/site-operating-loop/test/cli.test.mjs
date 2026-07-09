import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { test } from 'node:test';
import { runHiddenPostureCommandSync, spawnTestChild } from '@narada2/process-launch-posture';

const packageRoot = new URL('..', import.meta.url);
const cliPath = fileURLToPath(new URL('../bin/narada-site-loop.mjs', import.meta.url));
const storePath = new URL('../src/site-loop-store.mjs', import.meta.url);

test('CLI help does not require a store module', () => {
  const child = runHiddenPostureCommandSync(process.execPath, [cliPath, 'help'], {
    cwd: packageRoot,
    encoding: 'utf8',
    posture: 'test_child',
  });

  assert.equal(child.status, 0, child.stderr);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.schema, 'narada.site_operating_loop.cli_help.v1');
  assert.ok(parsed.commands.includes('run'));
});

test('CLI supervise emits startup evidence before a forever runtime exits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-site-loop-supervise-'));
  let child = null;
  try {
    const dbFile = join(dir, 'site-loop.sqlite').replace(/\\/g, '/');
    const storeModulePath = join(dir, 'store.mjs');
    const loopModulePath = join(dir, 'loop.mjs');

    writeFileSync(storeModulePath, `
      import { DatabaseSync } from 'node:sqlite';
      import { ensureSiteLoopTables } from ${JSON.stringify(storePath.href)};
      export function openSiteLoopStore() {
        const db = new DatabaseSync(${JSON.stringify(dbFile)});
        ensureSiteLoopTables(db);
        return { db, close() { db.close(); } };
      }
    `, 'utf8');

    writeFileSync(loopModulePath, `
      export function createSiteOperatingLoopSteps() {
        return [{ stepId: 'service-cycle', execute: () => ({ ok: true }) }];
      }
    `, 'utf8');

    child = spawnTestChild(process.execPath, [
      cliPath,
      'supervise',
      '--store-module',
      storeModulePath,
      '--loop-module',
      loopModulePath,
      '--loop-id',
      'test.loop.service',
      '--port',
      '0',
      '--forever',
      '--jsonl-events',
      '--interval-ms',
      '10000',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const firstLine = await readFirstStdoutLine(child, 5000);
    const started = JSON.parse(firstLine);
    assert.equal(started.schema, 'narada.site_operating_loop.supervisor_started.v1');
    assert.equal(started.status, 'started');
    assert.equal(started.loop_id, 'test.loop.service');
    assert.equal(started.server.status, 'listening');
    assert.match(started.server.base_url, /^http:\/\/127\.0\.0\.1:\d+$/);

    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');
    assert.ok(code === 0 || signal === 'SIGTERM', `unexpected supervise exit: code=${code} signal=${signal}`);
  } finally {
    if (child && child.exitCode == null) child.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});

function readFirstStdoutLine(child, timeoutMs) {
  child.stdout.setEncoding('utf8');
  let buffer = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for supervise startup stdout'));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        cleanup();
        resolve(buffer.slice(0, newline));
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = () => {
      cleanup();
      reject(new Error('supervise exited before startup stdout'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

test('CLI run hosts one Site-provided runtime cycle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-site-loop-'));
  try {
    const dbFile = join(dir, 'site-loop.sqlite').replace(/\\/g, '/');
    const storeModulePath = join(dir, 'store.mjs');
    const loopModulePath = join(dir, 'loop.mjs');

    writeFileSync(storeModulePath, `
      import { DatabaseSync } from 'node:sqlite';
      import { ensureSiteLoopTables } from ${JSON.stringify(storePath.href)};
      export function openSiteLoopStore() {
        const db = new DatabaseSync(${JSON.stringify(dbFile)});
        ensureSiteLoopTables(db);
        return { db, close() { db.close(); } };
      }
    `, 'utf8');

    writeFileSync(loopModulePath, `
      export function createSiteOperatingLoopSteps({ cycleIndex, trigger }) {
        return [{
          stepId: 'cli-cycle',
          execute: () => ({ cycleIndex, trigger_id: trigger?.trigger_id ?? null }),
        }];
      }
    `, 'utf8');

    const trigger = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'trigger',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'test.loop',
      '--kind',
      'operator_request',
      '--source-ref',
      'cli-test',
      '--payload-json',
      '{"intent":"run"}',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(trigger.status, 0, trigger.stderr);
    const triggerResult = JSON.parse(trigger.stdout);
    assert.equal(triggerResult.status, 'pending');

    const child = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'run',
      '--store-module',
      storeModulePath,
      '--loop-module',
      loopModulePath,
      '--loop-id',
      'test.loop',
      '--once',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(child.status, 0, child.stderr);
    const parsed = JSON.parse(child.stdout);
    assert.equal(parsed.schema, 'narada.site_operating_loop.runtime.v1');
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.cycle_count, 1);
    assert.equal(parsed.cycles[0].run.steps[0].step_id, 'cli-cycle');
    assert.equal(parsed.cycles[0].run.steps[0].evidence.trigger_id, triggerResult.trigger_id);

    const triggers = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'triggers',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'test.loop',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(triggers.status, 0, triggers.stderr);
    const triggersResult = JSON.parse(triggers.stdout);
    assert.equal(triggersResult.triggers[0].status, 'completed');

    const events = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'events',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'test.loop',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(events.status, 0, events.stderr);
    const eventResult = JSON.parse(events.stdout);
    assert.deepEqual(eventResult.events.map((event) => event.event), [
      'runtime_started',
      'cycle_started',
      'cycle_completed',
      'runtime_stopped',
    ]);

    const health = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'health',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'test.loop',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(health.status, 0, health.stderr);
    const healthResult = JSON.parse(health.stdout);
    assert.equal(healthResult.status, 'healthy');

    const serve = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'serve',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'test.loop',
      '--port',
      '0',
      '--once',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(serve.status, 0, serve.stderr);
    const serveResult = JSON.parse(serve.stdout);
    assert.equal(serveResult.status, 'listening');
    assert.match(serveResult.base_url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const supervise = runHiddenPostureCommandSync(process.execPath, [
      cliPath,
      'supervise',
      '--store-module',
      storeModulePath,
      '--loop-module',
      loopModulePath,
      '--loop-id',
      'test.loop',
      '--port',
      '0',
      '--once',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      posture: 'test_child',
    });

    assert.equal(supervise.status, 0, supervise.stderr);
    const superviseResult = JSON.parse(supervise.stdout);
    assert.equal(superviseResult.schema, 'narada.site_operating_loop.supervisor.v1');
    assert.equal(superviseResult.server.status, 'listening');
    assert.equal(superviseResult.runtime.cycle_count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
