import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';

const packageRoot = new URL('..', import.meta.url);
const cliPath = fileURLToPath(new URL('../bin/narada-site-loop.mjs', import.meta.url));
const storeModulePath = fileURLToPath(new URL('./fixtures/site-loop-store.mjs', import.meta.url));
const loopModulePath = fileURLToPath(new URL('./fixtures/site-loop-body.mjs', import.meta.url));

test('Site-owned loop fixture runs end-to-end through generic supervise surface', () => {
  const dir = mkdtempSync(join(tmpdir(), 'narada-site-loop-site-fixture-'));
  const env = {
    ...process.env,
    NARADA_SITE_LOOP_FIXTURE_DB: join(dir, 'site-loop.sqlite'),
  };
  try {
    const trigger = runCli([
      'trigger',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'fixture.site-loop',
      '--kind',
      'operator_request',
      '--source',
      'integration_test',
      '--source-ref',
      'req-42',
      '--payload-json',
      '{"subject":"prove integration"}',
    ], env);
    assert.equal(trigger.status, 'pending');

    const supervised = runCli([
      'supervise',
      '--store-module',
      storeModulePath,
      '--loop-module',
      loopModulePath,
      '--loop-id',
      'fixture.site-loop',
      '--once',
      '--port',
      '0',
    ], env);
    assert.equal(supervised.schema, 'narada.site_operating_loop.supervisor.v1');
    assert.equal(supervised.status, 'ok');
    assert.equal(supervised.runtime.cycle_count, 1);
    assert.equal(supervised.runtime.cycles[0].trigger.trigger_id, trigger.trigger_id);

    const runId = supervised.runtime.cycles[0].run.run_id;
    const shown = runCli([
      'show',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'fixture.site-loop',
      '--run-id',
      runId,
    ], env);
    assert.deepEqual(shown.run.steps.map((step) => step.step_id), ['observe-trigger', 'decide-dispatch']);
    assert.equal(shown.run.summary.trigger_id, trigger.trigger_id);
    assert.equal(shown.run.summary.decision, 'dispatch_admitted');

    const triggers = runCli([
      'triggers',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'fixture.site-loop',
    ], env);
    assert.equal(triggers.count, 1);
    assert.equal(triggers.triggers[0].status, 'completed');
    assert.equal(triggers.triggers[0].run_id, runId);

    const events = runCli([
      'events',
      '--store-module',
      storeModulePath,
      '--loop-id',
      'fixture.site-loop',
    ], env);
    assert.deepEqual(events.events.map((event) => event.event), [
      'runtime_started',
      'cycle_started',
      'cycle_completed',
      'runtime_stopped',
    ]);
    assert.equal(events.events.find((event) => event.event === 'cycle_completed').trigger_id, trigger.trigger_id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runCli(args, env) {
  const child = runHiddenPostureCommandSync(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    posture: 'test_child',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}
