import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
      principalBinding: {
        schema: 'narada.intelligence.principal_binding.v1',
        actor: { principal_id: IDS.principal, auth_type: 'user-site-session' },
        memberships: [{
          registry: 'site-roster',
          site_id: IDS.targetSite,
          role: 'resident',
          evidence_ref: 'evidence:canonical-local-principal-membership',
        }],
        evidence_refs: ['evidence:canonical-local-principal-membership'],
      },
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
  const authHome = mkdtempSync(join(tmpdir(), 'narada-codex-auth-'));
  try {
    const available = await probeCodexSubscriptionService({
      env: {
        ...process.env,
        NARADA_CODEX_AUTH_HOME: authHome,
        NARADA_CODEX_EXEC_COMMAND: process.execPath,
        NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify(['-e', 'process.exit(0)']),
      },
      session: 'runtime-probe-available',
    });
    assert.equal(available.status, 'ready');
    assert.equal(available.service, 'codex-subscription');
    assert.equal(available.protocol_family, 'codex-subscription');
    assert.equal(available.probe.kind, 'authenticated-provider-preflight');
    assert.match(available.evidence_ref, /runtime-probe-available/);

    const unavailable = await probeCodexSubscriptionService({
      env: {
        ...process.env,
        NARADA_CODEX_AUTH_HOME: authHome,
        NARADA_CODEX_EXEC_COMMAND: `${process.execPath}.missing`,
        NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify([]),
      },
      session: 'runtime-probe-unavailable',
    });
    assert.equal(unavailable.status, 'unavailable');
  } finally {
    rmSync(authHome, { recursive: true, force: true });
  }
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

test('runtime installs the admitted capability catalog before kernel startup', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed());
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const startupCatalog = [{
    type: 'function',
    function: {
      name: 'nars.test.echo',
      parameters: { type: 'object', properties: {} },
    },
    nars_gateway_proxy: true,
  }];
  let startupContext = null;
  let catalogCalls = 0;
  const capabilityGateway = {
    toolCatalog: async () => {
      catalogCalls += 1;
      return startupCatalog;
    },
    invoke: async () => ({ status: 'unknown', admission_action: 'admit', execution_outcome: 'unknown' }),
    close: async () => {},
  };
  const kernel = {
    async start(context) {
      startupContext = context;
      return { schema: 'narada.test.kernel-start.v1' };
    },
    async invokeAdmitted() {
      return { admission: 'acknowledged' };
    },
    health: () => ({ kernel_kind: 'test' }),
  };
  const runtime = await createLocalIntelligenceRuntime({
    runtimeContext: runtimeContext(),
    store,
    materialization,
    clock: () => canonicalTestClock(AT),
    kernel,
    capabilityGateway,
  });
  try {
    assert.equal(catalogCalls, 1);
    assert.deepEqual(startupContext?.tools, startupCatalog);
  } finally {
    await runtime.close();
    await materialization.close();
    await store.close();
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
    
test('runtime preserves the gateway clock when an async service probe completes later', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpointUrl = `http://127.0.0.1:${server.address().port}/v1/invoke`;
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({ endpointUrl }));
  const materialization = await SqliteMaterializationStore.open(':memory:');
  const context = runtimeContext();
  context.executionEvidence = [
    ...['launcher', 'carrier', 'runtime'].map((component_kind) => ({
      schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
      component_kind,
      execution_locus_id: 'execution-locus:operator-pc',
      status: 'ready',
      observed_for_session: context.session,
      process_id: String(process.pid),
      evidence_ref: `local-execution:${context.session}:${component_kind}:${process.pid}`,
    })),
    {
      schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
      component_kind: 'adapter',
      execution_locus_id: 'execution-locus:operator-pc',
      resource_id: 'adapter:openai-compatible-http',
      status: 'ready',
      observed_for_session: context.session,
      process_id: String(process.pid),
      evidence_ref: `local-execution:${context.session}:adapter:${process.pid}`,
    },
  ];
  context.intelligence = {
    ...context.intelligence,
    topologyObservations: [],
    topologyObservationSource: {
      schema: 'narada.invokable-intelligence.local-topology-observation-source.v1',
      authority_ref: 'runtime:clock-race-test',
      observation_validity_ms: 1000,
      runtime_service_validity_ms: 1000,
    },
  };
  let fakeNowMs = Date.parse(AT);
  let probeCalls = 0;
  const clock = () => {
    fakeNowMs += 750;
    return canonicalTestClock(new Date(fakeNowMs).toISOString());
  };
  try {
    const runtime = await createLocalIntelligenceRuntime({
      runtimeContext: context,
      store,
      materialization,
      clock,
      adapter: {
        async invoke() {
          return {
            admission: 'acknowledged',
            transportSubmitted: true,
            response: { choices: [{ message: { role: 'assistant', content: 'clock-race-ok' } }] },
          };
        },
      },
      runtimeServiceProbe: async ({ session, authorityRef }) => {
        probeCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
          service: 'codex-subscription',
          runtime_family: 'node',
          protocol_family: 'codex-subscription',
          status: 'ready',
          observed_for_session: session,
          authority_ref: authorityRef,
          observed_at: clock().instant,
          evidence_class: 'observed',
          evidence_ref: `clock-race-probe:${probeCalls}`,
        };
      },
    });
    const result = await runtime.gateway.invoke({
      operationId: 'operation:clock-race-test',
      purpose: 'operator-chat',
      principal: IDS.principal,
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(result.outcome.kind, 'success');
    assert.ok(probeCalls >= 2);
    await runtime.close();
  } finally {
    await materialization.close();
    await store.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
