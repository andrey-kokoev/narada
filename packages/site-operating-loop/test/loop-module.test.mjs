import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createValidatedSiteOperatingLoopSteps,
  resolveSiteOperatingLoopModule,
  validateSiteOperatingLoopSteps,
} from '../src/loop-module.mjs';

test('resolves valid Site Operating Loop module contract', async () => {
  const contract = resolveSiteOperatingLoopModule({
    prepareSiteOperatingLoopRun: () => ({ prepared: true }),
    createSiteOperatingLoopSteps: () => [{ stepId: 'ok', execute: () => ({ ok: true }) }],
    summarizeSiteOperatingLoopRun: () => ({ ok: true }),
  }, { moduleRef: 'fixture' });

  assert.equal(contract.status, 'ok');
  assert.equal(contract.module_ref, 'fixture');
  assert.equal(typeof contract.prepareRun, 'function');
  const steps = await createValidatedSiteOperatingLoopSteps(contract, {});
  assert.equal(steps[0].stepId, 'ok');
});

test('rejects missing loop step factory and invalid step records', async () => {
  const contract = resolveSiteOperatingLoopModule({}, { moduleRef: 'bad' });
  assert.equal(contract.status, 'invalid');
  assert.deepEqual(contract.errors, ['missing_createSiteOperatingLoopSteps']);

  const validation = validateSiteOperatingLoopSteps([{ execute: 'nope' }]);
  assert.equal(validation.status, 'invalid');
  assert.deepEqual(validation.errors, ['step_0_missing_stepId', 'step_0_invalid_execute']);

  const invalidPrepare = resolveSiteOperatingLoopModule({
    prepareSiteOperatingLoopRun: 'nope',
    createSiteOperatingLoopSteps: () => [],
  }, { moduleRef: 'bad-prepare' });
  assert.equal(invalidPrepare.status, 'invalid');
  assert.deepEqual(invalidPrepare.errors, ['invalid_prepareSiteOperatingLoopRun']);
});
