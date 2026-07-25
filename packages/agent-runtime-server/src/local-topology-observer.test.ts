import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
  probeHttpEndpoint,
  probeTcpEndpoint,
} from './local-topology-observer.js';

function runtimeContext(session: any = 'topology-observer-test') {
  return {
    identity: 'narada.test',
    session,
    executionEvidence: [
      ...['launcher', 'carrier', 'runtime'].map((component_kind: any) => ({
        schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
        component_kind,
        execution_locus_id: 'execution-locus:operator-pc',
        status: 'ready',
        observed_for_session: session,
        process_id: String(process.pid),
        evidence_ref: `local-execution:${session}:${component_kind}:${process.pid}`,
      })),
      {
        schema: 'narada.invokable-intelligence.local-execution-evidence.v1',
        component_kind: 'adapter',
        execution_locus_id: 'execution-locus:operator-pc',
        resource_id: 'adapter:openai-compatible-http',
        status: 'ready',
        observed_for_session: session,
        process_id: String(process.pid),
        evidence_ref: `local-execution:${session}:adapter:${process.pid}`,
      },
    ],
  };
}

function source(overrides: any = {}) {
  return {
    schema: LOCAL_TOPOLOGY_OBSERVATION_SOURCE_SCHEMA,
    authority_ref: 'runtime:topology-observer-test',
    probe_timeout_ms: 250,
    observation_validity_ms: 1000,
    ...overrides,
  };
}

async function listeningHttpServer(statusCode: any = 200) {
  let requests: any = 0;
  const server: any = createServer((_request: any, response: any) => {
    requests += 1;
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve: any) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    port: server.address().port,
    connections: () => requests,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve: any) => server.close(resolve));
    },
  };
}

test('local topology observer proves the canonical local route with a real endpoint socket', async () => {
  const endpoint: any = await listeningHttpServer();
  const store: any = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${endpoint.port}/v1/chat/completions`,
  }));
  const observer: any = createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext(),
    source: source(),
  });
  try {
    const decisionClock: any = canonicalTestClock();
    const first: any = await observer.observe({ decisionClock });
    const second: any = await observer.observe({ decisionClock });
    assert.equal(first.length, 12);
    assert.equal(first.every(({ status }: any) => status === 'feasible'), true);
    assert.equal(first.some(({ requirement, evidence }: any) => requirement === 'network-reachable'
      && evidence.some(({ ref }: any) => ref.startsWith('local-runtime-http-probe:http:127.0.0.1:'))), true);
    assert.equal(second.length, first.length);
    assert.equal(endpoint.connections(), 2, 'every invocation receives a fresh endpoint probe');
  } finally {
    await store.close();
    await endpoint.close();
  }
});

test('raw TCP probe proves transport only and cannot satisfy service readiness', async () => {
  const endpoint: any = await listeningHttpServer();
  const store: any = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: 'http://127.0.0.1:' + endpoint.port + '/v1/chat/completions',
  }));
  try {
    const observations: any = await createLocalTopologyObserver({
      store,
      runtimeContext: runtimeContext('tcp-only-test'),
      source: source(),
      probeEndpoint: probeTcpEndpoint,
    }).observe({ decisionClock: canonicalTestClock() });
    assert.equal(observations.find(({ requirement }: any) => requirement === 'network-reachable').status, 'feasible');
    assert.equal(observations.filter(({ requirement }: any) => ['endpoint-available', 'service-available'].includes(requirement))
      .every(({ status }: any) => status === 'infeasible'), true);
  } finally {
    await store.close();
    await endpoint.close();
  }
});

test('HTTP probe separates a reachable endpoint from an unavailable service response', async () => {
  const endpoint: any = await listeningHttpServer(503);
  try {
    const result: any = await probeHttpEndpoint({
      kind: 'url',
      url: `http://127.0.0.1:${endpoint.port}/health`,
    }, { timeoutMs: 250 });
    assert.equal(result.transport.status, 'feasible');
    assert.equal(result.transport.reason_code, 'endpoint-tcp-connected');
    assert.equal(result.endpoint.status, 'feasible');
    assert.equal(result.endpoint.reason_code, 'endpoint-http-status-503');
    assert.equal(result.service.status, 'infeasible');
    assert.equal(result.service.reason_code, 'endpoint-http-status-503');
  } finally {
    await endpoint.close();
  }
});

test('HTTP authentication failures remain distinct from endpoint reachability', async () => {
  const endpoint: any = await listeningHttpServer(401);
  try {
    const result: any = await probeHttpEndpoint({
      kind: 'url',
      url: `http://127.0.0.1:${endpoint.port}/health`,
    }, { timeoutMs: 250 });
    assert.equal(result.transport.status, 'feasible');
    assert.equal(result.endpoint.status, 'feasible');
    assert.equal(result.service.status, 'infeasible');
    assert.equal(result.service.reason_code, 'endpoint-http-authentication-required');
  } finally {
    await endpoint.close();
  }
});

test('HTTP probe fails closed when TLS cannot be negotiated', async () => {
  const endpoint: any = await listeningHttpServer();
  try {
    const result: any = await probeHttpEndpoint({
      kind: 'url',
      url: `https://127.0.0.1:${endpoint.port}/health`,
    }, { timeoutMs: 250 });
    assert.equal(result.endpoint.status, 'infeasible');
    assert.equal(result.service.status, 'infeasible');
    assert.match(result.endpoint.reason_code, /^endpoint-http-/);
  } finally {
    await endpoint.close();
  }
});

function seedStore(mutate: any = () => {}) {
  const seed: any = structuredClone(buildCanonicalLocalTestSeed());
  mutate(seed);
  for (const record of seed.records) record.source.digest = canonicalSha256(record.document);
  return {
    listCatalogRecords: async () => seed.records,
    listResources: async () => seed.records
      .filter(({ record_kind }: any) => record_kind === 'resource')
      .map(({ document }: any) => document),
  };
}

function routeRecord(seed: any) {
  return seed.records.find(({ record_kind }: any) => record_kind === 'route');
}

test('local topology observer requires runtime evidence for a runtime-service endpoint', async () => {
  const store: any = seedStore((seed: any) => {
    const endpoint: any = seed.records.find(({ record_id }: any) => record_id === CANONICAL_LOCAL_TEST_IDS.endpoint);
    endpoint.document.address = { kind: 'runtime-service', service: 'codex-subscription' };
    const adapter: any = seed.records.find(({ record_id }: any) => record_id === CANONICAL_LOCAL_TEST_IDS.adapter);
    adapter.document.protocol = { family: 'codex-subscription', operation: 'responses', version: '1' };
  });
  const decisionClock: any = canonicalTestClock();
  const withoutEvidence: any = await createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext('runtime-service-test'),
    source: source(),
  }).observe({ decisionClock });
  assert.equal(withoutEvidence.some(({ requirement, status, reason_code }: any) =>
    requirement === 'service-available'
    && status === 'infeasible'
    && reason_code === 'runtime-service-not-observed'), true);

  const withEvidence: any = await createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext('runtime-service-test'),
    source: source(),
    runtimeServices: [{
      schema: LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA,
      service: 'codex-subscription',
      runtime_family: 'node',
      protocol_family: 'codex-subscription',
      status: 'ready',
      observed_for_session: 'runtime-service-test',
      authority_ref: 'runtime:topology-observer-test',
      observed_at: '2026-07-19T12:00:00.000Z',
      evidence_class: 'observed',
      evidence_ref: 'local-runtime-adapter:runtime-service-test:codex-subscription:test',
    }],
  }).observe({ decisionClock });
  assert.equal(withEvidence.every(({ status }: any) => status === 'feasible'), true);
  assert.equal(withEvidence.some(({ requirement, evidence }: any) =>
    requirement === 'service-available'
    && evidence.some(({ ref }: any) => ref === 'local-runtime-adapter:runtime-service-test:codex-subscription:test')), true);
});

test('executable presence is not mistaken for Codex subscription readiness', async () => {
  const store: any = seedStore((seed: any) => {
    const endpoint: any = seed.records.find(({ record_id }: any) => record_id === CANONICAL_LOCAL_TEST_IDS.endpoint);
    endpoint.document.address = { kind: 'runtime-service', service: 'codex-subscription' };
    const adapter: any = seed.records.find(({ record_id }: any) => record_id === CANONICAL_LOCAL_TEST_IDS.adapter);
    adapter.document.protocol = { family: 'codex-subscription', operation: 'responses', version: '1' };
  });
  const observations: any = await createLocalTopologyObserver({
    store,
    runtimeContext: runtimeContext('runtime-executable-only-test'),
    source: source(),
    runtimeServices: [{
      schema: LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA,
      service: 'codex-subscription',
      runtime_family: 'node',
      protocol_family: 'codex-subscription',
      status: 'executable-present',
      observed_for_session: 'runtime-executable-only-test',
      authority_ref: 'runtime:topology-observer-test',
      observed_at: '2026-07-19T12:00:00.000Z',
      evidence_class: 'observed',
      evidence_ref: 'local-runtime-executable-only',
    }],
  }).observe({ decisionClock: canonicalTestClock() });
  const service: any = observations.find(({ requirement }: any) => requirement === 'service-available');
  assert.equal(service.status, 'infeasible');
  assert.equal(service.reason_code, 'runtime-service-readiness-not-proven');
});

test('local topology observer cites the admitted catalog envelope for boundary admission', async () => {
  const endpoint: any = await listeningHttpServer();
  const store: any = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${endpoint.port}/invoke`,
  }));
  try {
    const observations: any = await createLocalTopologyObserver({
      store,
      runtimeContext: runtimeContext('boundary-evidence-test'),
      source: source(),
    }).observe({ decisionClock: canonicalTestClock() });
    const boundaries: any = observations.filter(({ requirement }: any) => requirement === 'boundary-admitted');
    const admittedRouteRecordId: any = (await store.listCatalogRecords())
      .find(({ record_kind }: any) => record_kind === 'route').id;
    assert.equal(boundaries.every(({ status }: any) => status === 'feasible'), true);
    assert.equal(boundaries.some(({ evidence }: any) =>
      evidence.some(({ ref }: any) => ref === admittedRouteRecordId)
      && evidence.some(({ ref }: any) => ref === 'canonical-local-fixture')), true);
  } finally {
    await store.close();
    await endpoint.close();
  }
});

test('local topology observer fails closed for duplicate and unresolved topology members', async () => {
  for (const [label, mutate, expected] of [
    [
      'duplicate node',
      (seed: any) => {
        const route: any = routeRecord(seed).document;
        route.topology.nodes.push(structuredClone(route.topology.nodes[0]));
      },
      /local_topology_duplicate_node_id/,
    ],
    [
      'missing route edge',
      (seed: any) => {
        routeRecord(seed).document.topology.route.edge_ids.push('edge:not-present');
      },
      /local_topology_route_edge_not_found/,
    ],
    [
      'edge endpoint missing',
      (seed: any) => {
        routeRecord(seed).document.topology.edges[0].to = 'node:not-present';
      },
      /local_topology_edge_node_not_found/,
    ],
  ]) {
    const observer: any = createLocalTopologyObserver({
      store: seedStore(mutate),
      runtimeContext: runtimeContext(`malformed-${label}`),
      source: source(),
    });
    await assert.rejects(
      observer.observe({ decisionClock: canonicalTestClock() }),
      expected as any,
      label as string,
    );
  }
});

test('local topology observer rejects differing route shapes that reuse one topology identity', async () => {
  const observer: any = createLocalTopologyObserver({
    store: seedStore((seed: any) => {
      const original: any = routeRecord(seed);
      const duplicate: any = structuredClone(original);
      duplicate.id = 'catalog-record:canonical-local:ambiguous-route';
      duplicate.record_id = 'route:canonical-local-ambiguous';
      duplicate.document.id = duplicate.record_id;
      const edge: any = duplicate.document.topology.edges.find(({ id }: any) => id === 'l5');
      edge.boundary.trust_policy_ref = 'policy:different';
      edge.boundary.admission.trust_policy.ref = 'policy:different';
      edge.boundary.admission.trust_policy.evidence[0].ref = 'policy:different';
      seed.records.push(duplicate);
    }),
    runtimeContext: runtimeContext('ambiguous-route-test'),
    source: source(),
  });
  await assert.rejects(
    observer.observe({ decisionClock: canonicalTestClock() }),
    /local_topology_ambiguous_route_topology/,
  );
});

test('local topology observer rejects boundary references without validated policy/path evidence', async () => {
  const observer: any = createLocalTopologyObserver({
    store: seedStore((seed: any) => {
      const edge: any = routeRecord(seed).document.topology.edges.find(({ id }: any) => id === 'l5');
      edge.boundary.admission.trust_policy.evidence = [{ kind: 'test', ref: 'unrelated-proof' }];
    }),
    runtimeContext: runtimeContext('boundary-admission-invalid-test'),
    source: source(),
  });
  await assert.rejects(
    observer.observe({ decisionClock: canonicalTestClock() }),
    /local_topology_boundary_admission_invalid:l5/,
  );
});

test('local topology observer rejects freshness before the admission validity interval', async () => {
  const observer: any = createLocalTopologyObserver({
    store: seedStore((seed: any) => {
      const edge: any = routeRecord(seed).document.topology.edges.find(({ id }: any) => id === 'l5');
      const validFrom: any = Date.parse(edge.boundary.admission.validity.valid_from);
      edge.boundary.admission.validity.fresh_as_of = new Date(validFrom - 1).toISOString();
    }),
    runtimeContext: runtimeContext('boundary-admission-freshness-test'),
    source: source(),
  });
  await assert.rejects(
    observer.observe({ decisionClock: canonicalTestClock() }),
    /local_topology_boundary_admission_validity_invalid:l5/,
  );
});

test('local topology observer emits exact infeasible endpoint evidence before invocation', async () => {
  const endpoint: any = await listeningHttpServer();
  const port: any = endpoint.port;
  await endpoint.close();
  const store: any = await SqliteRegistryStore.open(':memory:');
  await store.loadCatalogSeed(buildCanonicalLocalTestSeed({
    endpointUrl: `http://127.0.0.1:${port}/v1/chat/completions`,
  }));
  try {
    const observer: any = createLocalTopologyObserver({
      store,
      runtimeContext: runtimeContext('topology-observer-refusal'),
      source: source({ probe_timeout_ms: 100 }),
    });
    const observations: any = await observer.observe({
      decisionClock: canonicalTestClock(),
    });
    const failed: any = observations.filter(({ status }: any) => status === 'infeasible');
    assert.deepEqual(
      failed.map(({ requirement }: any) => requirement).sort(),
      ['endpoint-available', 'network-reachable', 'service-available'],
    );
    assert.equal(failed.every(({ requirement, reason_code }: any) => requirement === 'network-reachable'
      ? reason_code.startsWith('endpoint-tcp-')
      : reason_code.startsWith('endpoint-http-')), true);
  } finally {
    await store.close();
  }
});

test('local topology observer rejects catalog-shaped process evidence without a live process', async () => {
  const context: any = runtimeContext('dead-process-evidence');
  context.executionEvidence = context.executionEvidence.map((entry: any) => ({
    ...entry,
    process_id: '999999999',
  }));
  const observations: any = await createLocalTopologyObserver({
    store: seedStore(),
    runtimeContext: context,
    source: source(),
    probeEndpoint: async () => ({
      transport: { status: 'feasible', reason_code: 'test-transport', evidence_ref: 'test-transport' },
      endpoint: { status: 'feasible', reason_code: 'test-endpoint', evidence_ref: 'test-endpoint' },
      service: { status: 'feasible', reason_code: 'test-service', evidence_ref: 'test-service' },
    }),
  }).observe({ decisionClock: canonicalTestClock() });
  const launcher: any = observations.find(({ requirement }: any) => requirement === 'launcher-available');
  assert.equal(launcher.status, 'infeasible');
  assert.equal(launcher.reason_code, 'launcher-runtime-evidence-not-admitted');
  assert.equal(launcher.evidence[0].evidence_class, 'synthetic-correlation');
});

test('local topology observer refuses an ungoverned observation source', async () => {
  const store: any = await SqliteRegistryStore.open(':memory:');
  try {
    assert.throws(
      () => createLocalTopologyObserver({ store, runtimeContext: runtimeContext(), source: null }),
      /local_topology_observation_source_required/,
    );
  } finally {
    await store.close();
  }
});
