import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_SITE_OPERATING_LOOP_POLICY,
  validateSiteOperatingLoopPolicy,
} from '../src/policy.mjs';

test('default policy disables unavailable fallback carrier', () => {
  assert.equal(DEFAULT_SITE_OPERATING_LOOP_POLICY.carrier.preferred, 'narada-agent-runtime-server');
  assert.equal(DEFAULT_SITE_OPERATING_LOOP_POLICY.carrier.fallback, null);
  assert.equal(DEFAULT_SITE_OPERATING_LOOP_POLICY.carrier.fallback_enabled, false);

  const validation = validateSiteOperatingLoopPolicy(DEFAULT_SITE_OPERATING_LOOP_POLICY, {
    allowedPreferredCarriers: ['narada-agent-runtime-server'],
    allowedFallbackCarriers: ['supported-carrier'],
  });
  assert.equal(validation.status, 'ok');
});

test('configured fallback carrier remains explicitly validated', () => {
  const policy = {
    ...DEFAULT_SITE_OPERATING_LOOP_POLICY,
    carrier: {
      ...DEFAULT_SITE_OPERATING_LOOP_POLICY.carrier,
      fallback: 'supported-carrier',
      fallback_enabled: true,
    },
  };

  const validation = validateSiteOperatingLoopPolicy(policy, {
    allowedPreferredCarriers: ['narada-agent-runtime-server'],
    allowedFallbackCarriers: ['supported-carrier'],
  });
  assert.equal(validation.status, 'ok');

  const rejected = validateSiteOperatingLoopPolicy({
    ...policy,
    carrier: { ...policy.carrier, fallback: 'unsupported-carrier' },
  }, {
    allowedPreferredCarriers: ['narada-agent-runtime-server'],
    allowedFallbackCarriers: ['supported-carrier'],
  });
  assert.deepEqual(rejected.errors, ['invalid_fallback_carrier']);
});

test('enabled fallback requires a declared carrier', () => {
  const validation = validateSiteOperatingLoopPolicy({
    ...DEFAULT_SITE_OPERATING_LOOP_POLICY,
    carrier: {
      ...DEFAULT_SITE_OPERATING_LOOP_POLICY.carrier,
      fallback_enabled: true,
    },
  });
  assert.deepEqual(validation.errors, ['fallback_carrier_required']);
});
