import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLaunchRegistryPath } from '../../src/lib/site-root-resolver.ts';
import {
  rawLaunchRegistryAgents,
  readLaunchRegistryRaw,
} from '../../src/commands/workspace-launch-registry.ts';

const EXPECTED_OPERATOR_SURFACE = 'agent-web-ui';

test('operator-console launch audit reads every User Site registry record without compatibility fallback', {
  skip: process.platform !== 'win32',
}, async () => {
  const registryPath = defaultLaunchRegistryPath();
  const rawRegistry = await readLaunchRegistryRaw(registryPath);
  const records = rawLaunchRegistryAgents(rawRegistry);
  assert.ok(records.length > 0, `launch registry contains no agent records: ${registryPath}`);

  const failures = records.flatMap((record, index) => {
    const operatorSurface = typeof record.OperatorSurface === 'string'
      ? record.OperatorSurface.trim()
      : null;
    const legacyCarrier = typeof record.Carrier === 'string'
      ? record.Carrier.trim()
      : null;
    const reasons = [];
    if (operatorSurface !== EXPECTED_OPERATOR_SURFACE) {
      reasons.push(`operator_surface=${operatorSurface ?? '<missing>'}; expected=${EXPECTED_OPERATOR_SURFACE}`);
    }
    if (legacyCarrier !== null) {
      reasons.push(`legacy_carrier_present=${legacyCarrier}`);
    }
    return reasons.length > 0
      ? [{
          index,
          agent: record.Agent ?? null,
          site: record.Site ?? null,
          operator_surface: operatorSurface,
          carrier: legacyCarrier,
          reasons,
        }]
      : [];
  });

  assert.deepEqual(
    failures,
    [],
    `User Site launch registry has ${failures.length} operator-surface violation(s) `
      + `(records=${records.length}, path=${registryPath}):\n${JSON.stringify(failures, null, 2)}`,
  );
});
