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
import { SqliteMaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

import {
  createLocalIntelligenceRuntime,
  openLocalIntelligenceRegistry,
  probeCodexSubscriptionService,
} from './local-intelligence-runtime.mjs';

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
      topologyObservationAdmission: {
        schema: 'narada.invokable-intelligence.topology-observation-admission.v1',
        runtime_session_id: 'canonical-local-test',
        authority_ref: 'runtime:canonical-local-test',
        binding: {
          target_site_id: IDS.targetSite,
          user_site_id: IDS.userSite,
          host_site_id: IDS.hostSite,
        },
        validity: {
          valid_from: '2026-07-19T00:00:00.000Z',
          valid_until: '2026-07-20T00:00:00.000Z',
          fresh_as_of: AT,
        },
        evidence: [{ kind: 'test', ref: 'canonical-local-fixture', evidence_class: 'durable' }],
      },
    },
    invocationSettings: { invocationScope: { kind: 'test' } },
  };
}

test('runtime-service availability uses an executable probe rather than adapter shape', async () => {
  const available = await probeCodexSubscriptionService({
    env: {
      ...process.env,
      NARADA_CODEX_EXEC_COMMAND: process.execPath,
      NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify(['-e', 'process.exit(0)']),
    },
    session: 'runtime-probe-available',
  });
  assert.equal(available.status, 'executable-present');
  assert.equal(available.service, 'codex-executable');
  assert.equal(available.protocol_family, 'codex-cli');
  assert.equal(available.probe.kind, 'executable-presence');
  assert.match(available.evidence_ref, /runtime-probe-available/);

  const unavailable = await probeCodexSubscriptionService({
    env: {
      ...process.env,
      NARADA_CODEX_EXEC_COMMAND: `${process.execPath}.missing`,
      NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify([]),
    },
    session: 'runtime-probe-unavailable',
  });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.probe.reason_code, 'ENOENT');
});

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

test('runtime rejects injected topology observations without a matching admission envelope', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = {
    ...context.intelligence,
    topologyObservationAdmission: {
      ...context.intelligence.topologyObservationAdmission,
      evidence: [{ kind: 'test', ref: 'missing-class' }],
    },
  };
  try {
    await assert.rejects(
      createLocalIntelligenceRuntime({
        runtimeContext: context,
        store,
        materialization,
        clock: () => canonicalTestClock(AT),
      }),
      /local_intelligence_topology_observation_admission_invalid/,
    );
    assert.ok((await store.listResources()).length > 0);
    assert.deepEqual(await materialization.listProjections(), []);
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('runtime rejects injected topology observations whose admission window is stale', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  const staleValidity = {
    valid_from: '2026-07-19T11:00:00.000Z',
    valid_until: '2026-07-19T11:30:00.000Z',
    fresh_as_of: '2026-07-19T11:15:00.000Z',
  };
  context.intelligence = {
    ...context.intelligence,
    topologyObservations: context.intelligence.topologyObservations.map((observation) => ({
      ...observation,
      validity: staleValidity,
      observed_at: staleValidity.fresh_as_of,
    })),
    topologyObservationAdmission: {
      ...context.intelligence.topologyObservationAdmission,
      validity: staleValidity,
    },
  };
  try {
    await assert.rejects(
      createLocalIntelligenceRuntime({
        runtimeContext: context,
        store,
        materialization,
        clock: () => canonicalTestClock(AT),
      }),
      /local_intelligence_topology_observation_admission_invalid/,
    );
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('runtime rejects non-string injected evidence timestamps', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = {
    ...context.intelligence,
    topologyObservationAdmission: {
      ...context.intelligence.topologyObservationAdmission,
      validity: {
        ...context.intelligence.topologyObservationAdmission.validity,
        valid_from: 0,
      },
    },
  };
  try {
    await assert.rejects(
      createLocalIntelligenceRuntime({
        runtimeContext: context,
        store,
        materialization,
        clock: () => canonicalTestClock(AT),
      }),
      /local_intelligence_topology_observation_admission_invalid/,
    );
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('runtime rejects a shape-valid context whose Sites are not admitted by the canonical registry', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = {
    ...context.intelligence,
    sites: {
      ...context.intelligence.sites,
      targetSite: { kind: 'site', id: 'site:not-admitted' },
    },
  };
  try {
    await assert.rejects(
      createLocalIntelligenceRuntime({
        runtimeContext: context,
        store,
        materialization,
        clock: () => canonicalTestClock(AT),
      }),
      /local_intelligence_site_not_admitted:site:not-admitted/,
    );
    assert.ok((await store.listResources()).length > 0);
    assert.deepEqual(await materialization.listProjections(), []);
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('runtime does not close injected stores when its own setup fails or its session closes', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = {
    ...context.intelligence,
    topologyObservationAdmission: {
      ...context.intelligence.topologyObservationAdmission,
      binding: {
        ...context.intelligence.topologyObservationAdmission.binding,
        host_site_id: 'site:foreign-host',
      },
    },
  };
  try {
    await assert.rejects(
      createLocalIntelligenceRuntime({
        runtimeContext: context,
        store,
        materialization,
        clock: () => canonicalTestClock(AT),
      }),
      /local_intelligence_topology_observation_admission_invalid/,
    );
    assert.ok((await store.listResources()).length > 0);
    assert.deepEqual(await materialization.listProjections(), []);

    const runtime = await createLocalIntelligenceRuntime({
      runtimeContext: runtimeContext(),
      store,
      materialization,
      clock: () => canonicalTestClock(AT),
      adapter: { async invoke() { return { admission: 'acknowledged' }; } },
    });
    await runtime.close();
    assert.ok((await store.listResources()).length > 0);
    assert.deepEqual(await materialization.listProjections(), []);
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('invalid injected runtime-service evidence is rejected and replaced by a fresh probe', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = { ...context.intelligence, topologyObservations: [] };
  let probeCalls = 0;
  try {
    const runtime = await createLocalIntelligenceRuntime({
      runtimeContext: context,
      store,
      materialization,
      clock: () => canonicalTestClock(AT),
      topologyObserver: { observe: async () => feasibleTopologyObservations() },
      runtimeServices: [{
        schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
        service: 'codex-subscription',
        runtime_family: 'node',
        protocol_family: 'codex-subscription',
        status: 'ready',
        observed_for_session: context.session,
        authority_ref: 'runtime:canonical-local-test',
        observed_at: AT,
        evidence_ref: 'synthetic-service-evidence',
      }],
      runtimeServiceProbe: async () => {
        probeCalls += 1;
        return {
          schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
          service: 'codex-executable',
          runtime_family: 'node',
          protocol_family: 'codex-cli',
          status: 'executable-present',
          observed_for_session: context.session,
          authority_ref: 'runtime:canonical-local-test',
          observed_at: AT,
          evidence_class: 'observed',
          evidence_ref: 'observed-service-probe',
          probe: { kind: 'executable-presence' },
        };
      },
    });
    assert.equal(probeCalls, 1);
    await runtime.close();
  } finally {
    await materialization.close();
    await store.close();
  }
});

test('stale injected runtime-service evidence is replaced by a fresh probe', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.intelligence = { ...context.intelligence, topologyObservations: [] };
  let probeCalls = 0;
  try {
    const runtime = await createLocalIntelligenceRuntime({
      runtimeContext: context,
      store,
      materialization,
      clock: () => canonicalTestClock(AT),
      topologyObserver: { observe: async () => feasibleTopologyObservations() },
      runtimeServices: [{
        schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
        service: 'codex-subscription',
        runtime_family: 'node',
        protocol_family: 'codex-subscription',
        status: 'ready',
        observed_for_session: context.session,
        authority_ref: 'runtime:canonical-local-test',
        observed_at: '2026-07-19T11:59:00.000Z',
        evidence_class: 'observed',
        evidence_ref: 'stale-service-evidence',
      }],
      runtimeServiceProbe: async () => {
        probeCalls += 1;
        return {
          schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
          service: 'codex-executable',
          runtime_family: 'node',
          protocol_family: 'codex-cli',
          status: 'executable-present',
          observed_for_session: context.session,
          authority_ref: 'runtime:canonical-local-test',
          observed_at: AT,
          evidence_class: 'observed',
          evidence_ref: 'fresh-service-probe',
          probe: { kind: 'executable-presence' },
        };
      },
    });
    assert.equal(probeCalls, 1);
    await runtime.close();
  } finally {
    await materialization.close();
    await store.close();
  }
});
