import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  CANONICAL_LOCAL_TEST_IDS,
  buildCanonicalLocalTestSeed,
  canonicalTestClock,
  feasibleTopologyObservations,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

import { createLocalIntelligenceRuntime, openLocalIntelligenceRegistry } from './local-intelligence-runtime.mjs';

const IDS = CANONICAL_LOCAL_TEST_IDS;
const AT = '2026-07-19T12:00:00.000Z';
const ACCESS = {
  action: 'invoke',
  requested_region: 'global',
  data_classification: 'internal',
  requested_retention_days: 0,
  provider_training: 'prohibited',
  expected_usage: { amount: 1, unit: 'requests' },
  expected_cost: { amount: 1, currency: 'USD' },
};

function runtimeContext() {
  return {
    identity: 'narada.test',
    session: 'canonical-local-test',
    siteRoot: 'D:/code/narada',
    intelligence: {
      principal: IDS.principal,
      sites: {
        targetSite: { kind: 'site', id: IDS.targetSite },
        userSite: { kind: 'site', id: IDS.userSite },
        hostSite: { kind: 'site', id: IDS.hostSite },
      },
      access: ACCESS,
      topologyObservations: feasibleTopologyObservations(),
    },
    invocationSettings: { invocationScope: { kind: 'test' } },
  };
}

test('runtime refuses an absent registry without creating an empty authority store', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-canonical-registry-missing-'));
  const path = join(root, '.ai', 'intelligence-registry.db');
  try {
    await assert.rejects(
      openLocalIntelligenceRegistry({ siteRoot: root }),
      /intelligence_registry_not_initialized/,
    );
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runtime resolves and executes one exact canonical plan through the durable gateway', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const calls = [];
  const runtime = await createLocalIntelligenceRuntime({
    runtimeContext: runtimeContext(),
    store,
    clock: () => canonicalTestClock(AT),
    adapter: {
      async invoke(input) {
        calls.push(input);
        return {
          admission: 'acknowledged',
          transportSubmitted: true,
          response: { choices: [{ message: { role: 'assistant', content: 'canonical-ok' } }] },
        };
      },
    },
  });
  try {
    const result = await runtime.gateway.invoke({
      operationId: 'operation:local-runtime-test',
      purpose: 'operator-chat',
      principal: IDS.principal,
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(result.kind, 'plan');
    assert.equal(result.outcome.kind, 'success');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model.id, IDS.model);
    assert.equal(calls[0].modelProvider.id, 'model-provider:kimi');
    assert.equal(calls[0].inferenceProvider.id, 'inference-provider:remote-api');
    assert.equal(calls[0].offering.id, IDS.offering);
    assert.equal(calls[0].endpoint.id, IDS.endpoint);
    assert.equal(calls[0].adapter.id, IDS.adapter);
    assert.equal(result.result.payload.disposition, 'never-retained');
    assert.equal(result.result.payload.retention.policy_ref, 'governance:narada-local-api');
  } finally {
    await runtime.close();
  }
});

test('canonical reconfiguration preflight rejects an unadmitted model without execution', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  let calls = 0;
  const runtime = await createLocalIntelligenceRuntime({
    runtimeContext: runtimeContext(),
    store,
    clock: () => canonicalTestClock(AT),
    adapter: { async invoke() { calls += 1; return {}; } },
  });
  try {
    await assert.rejects(
      runtime.preflightSelection({ requestedModel: { kind: 'model', id: 'model:not-admitted' } }),
      /intelligence_selection_refused/,
    );
    assert.equal(calls, 0);
  } finally {
    await runtime.close();
  }
});
