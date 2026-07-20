import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';

import {
  buildCanonicalLocalTestSeed,
  CANONICAL_LOCAL_TEST_IDS,
  canonicalSha256,
  canonicalTestClock,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

import {
  createLocalTopologyObserver,
  LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA,
  LOCAL_TOPOLOGY_OBSERVATION_SOURCE_SCHEMA,
} from './local-topology-observer.mjs';

function runtimeContext(session = 'topology-observer-test') {
  return {
    identity: 'narada.test',
    session,
  };
}

function source(overrides = {}) {
  return {
    schema: LOCAL_TOPOLOGY_OBSERVATION_SOURCE_SCHEMA,
    authority_ref: 'runtime:topology-observer-test',
    probe_timeout_ms: 250,
    observation_validity_ms: 1000,
    ...overrides,
  };
}

async function listeningTcpServer() {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    port: server.address().port,
    connections: () => connections,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('local topology observer proves the canonical local route with a real endpoint socket', async () => {
  const endpoint = await listeningTcpServer();
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${endpoint.port}/v1/chat/completions`,
  }));
  const observer = createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext(),
    source: source(),
  });
  try {
    const decisionClock = canonicalTestClock(new Date().toISOString());
    const first = await observer.observe({ decisionClock });
    const second = await observer.observe({ decisionClock });
    assert.equal(first.length, 12);
    assert.equal(first.every(({ status }) => status === 'feasible'), true);
    assert.equal(first.some(({ requirement, evidence }) => requirement === 'network-reachable'
      && evidence.some(({ ref }) => ref.startsWith('local-runtime-tcp-probe:http:127.0.0.1:'))), true);
    assert.equal(second.length, first.length);
    assert.equal(endpoint.connections(), 2, 'every invocation receives a fresh endpoint probe');
  } finally {
    await store.close();
    await endpoint.close();
  }
});

function seedStore(mutate = () => {}) {
  const seed = structuredClone(buildCanonicalLocalTestSeed());
  mutate(seed);
  for (const record of seed.records) record.source.digest = canonicalSha256(record.document);
  return {
    listCatalogRecords: async () => seed.records,
    listResources: async () => seed.records
      .filter(({ record_kind }) => record_kind === 'resource')
      .map(({ document }) => document),
  };
}

function routeRecord(seed) {
  return seed.records.find(({ record_kind }) => record_kind === 'route');
}

test('local topology observer requires runtime evidence for a runtime-service endpoint', async () => {
  const store = seedStore((seed) => {
    const endpoint = seed.records.find(({ record_id }) => record_id === CANONICAL_LOCAL_TEST_IDS.endpoint);
    endpoint.document.address = { kind: 'runtime-service', service: 'codex-subscription' };
    const adapter = seed.records.find(({ record_id }) => record_id === CANONICAL_LOCAL_TEST_IDS.adapter);
    adapter.document.protocol = { family: 'codex-subscription', operation: 'responses', version: '1' };
  });
  const decisionClock = canonicalTestClock(new Date().toISOString());
  const withoutEvidence = await createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext('runtime-service-test'),
    source: source(),
  }).observe({ decisionClock });
  assert.equal(withoutEvidence.some(({ requirement, status, reason_code }) =>
    requirement === 'service-available'
    && status === 'infeasible'
    && reason_code === 'runtime-service-not-observed'), true);

  const withEvidence = await createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext('runtime-service-test'),
    source: source(),
    runtimeServices: [{
      schema: LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA,
      service: 'codex-subscription',
      runtime_family: 'node',
      protocol_family: 'codex-subscription',
      status: 'available',
      observed_for_session: 'runtime-service-test',
      evidence_ref: 'local-runtime-adapter:runtime-service-test:codex-subscription:test',
    }],
  }).observe({ decisionClock });
  assert.equal(withEvidence.every(({ status }) => status === 'feasible'), true);
  assert.equal(withEvidence.some(({ requirement, evidence }) =>
    requirement === 'service-available'
    && evidence.some(({ ref }) => ref === 'local-runtime-adapter:runtime-service-test:codex-subscription:test')), true);
});

test('local topology observer cites the admitted catalog envelope for boundary admission', async () => {
  const endpoint = await listeningTcpServer();
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${endpoint.port}/invoke`,
  }));
  try {
    const observations = await createLocalTopologyObserver({
      store,
      runtimeContext: runtimeContext('boundary-evidence-test'),
      source: source(),
    }).observe({ decisionClock: canonicalTestClock(new Date().toISOString()) });
    const boundaries = observations.filter(({ requirement }) => requirement === 'boundary-admitted');
    const admittedRouteRecordId = (await store.listCatalogRecords())
      .find(({ record_kind }) => record_kind === 'route').id;
    assert.equal(boundaries.every(({ status }) => status === 'feasible'), true);
    assert.equal(boundaries.some(({ evidence }) =>
      evidence.some(({ ref }) => ref === admittedRouteRecordId)
      && evidence.some(({ ref }) => ref === 'canonical-local-fixture')), true);
  } finally {
    await store.close();
    await endpoint.close();
  }
});

test('local topology observer fails closed for duplicate and unresolved topology members', async () => {
  for (const [label, mutate, expected] of [
    [
      'duplicate node',
      (seed) => {
        const route = routeRecord(seed).document;
        route.topology.nodes.push(structuredClone(route.topology.nodes[0]));
      },
      /local_topology_duplicate_node_id/,
    ],
    [
      'missing route edge',
      (seed) => {
        routeRecord(seed).document.topology.route.edge_ids.push('edge:not-present');
      },
      /local_topology_route_edge_not_found/,
    ],
    [
      'edge endpoint missing',
      (seed) => {
        routeRecord(seed).document.topology.edges[0].to = 'node:not-present';
      },
      /local_topology_edge_node_not_found/,
    ],
  ]) {
    const observer = createLocalTopologyObserver({
      store: seedStore(mutate),
      runtimeContext: runtimeContext(`malformed-${label}`),
      source: source(),
    });
    await assert.rejects(
      observer.observe({ decisionClock: canonicalTestClock(new Date().toISOString()) }),
      expected,
      label,
    );
  }
});

test('local topology observer rejects differing route shapes that reuse one topology identity', async () => {
  const observer = createLocalTopologyObserver({
    store: seedStore((seed) => {
      const original = routeRecord(seed);
      const duplicate = structuredClone(original);
      duplicate.id = 'catalog-record:canonical-local:ambiguous-route';
      duplicate.record_id = 'route:canonical-local-ambiguous';
      duplicate.document.id = duplicate.record_id;
      duplicate.document.topology.edges[0].boundary.trust_policy_ref = 'policy:different';
      seed.records.push(duplicate);
    }),
    runtimeContext: runtimeContext('ambiguous-route-test'),
    source: source(),
  });
  await assert.rejects(
    observer.observe({ decisionClock: canonicalTestClock(new Date().toISOString()) }),
    /local_topology_ambiguous_route_topology/,
  );
});

test('local topology observer emits exact infeasible endpoint evidence before invocation', async () => {
  const endpoint = await listeningTcpServer();
  const port = endpoint.port;
  await endpoint.close();
  const store = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${port}/v1/chat/completions`,
  }));
  try {
    const observer = createLocalTopologyObserver({
      store,
      runtimeContext: runtimeContext('topology-observer-refusal'),
      source: source({ probe_timeout_ms: 100 }),
    });
    const observations = await observer.observe({
      decisionClock: canonicalTestClock(new Date().toISOString()),
    });
    const failed = observations.filter(({ status }) => status === 'infeasible');
    assert.deepEqual(
      failed.map(({ requirement }) => requirement).sort(),
      ['endpoint-available', 'network-reachable', 'service-available'],
    );
    assert.equal(failed.every(({ reason_code }) => reason_code.startsWith('endpoint-tcp-')), true);
  } finally {
    await store.close();
  }
});

test('local topology observer refuses an ungoverned observation source', async () => {
  const store = await SqliteRegistryStore.open(':memory:');
  try {
    assert.throws(
      () => createLocalTopologyObserver({ store, runtimeContext: runtimeContext(), source: null }),
      /local_topology_observation_source_required/,
    );
  } finally {
    await store.close();
  }
});
