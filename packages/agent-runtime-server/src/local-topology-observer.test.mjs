import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';

import {
  buildCanonicalLocalTestSeed,
  canonicalTestClock,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

import {
  createLocalTopologyObserver,
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
    cache_ttl_ms: 5000,
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
    assert.equal(endpoint.connections(), 1, 'endpoint feasibility probe is bounded by the cache');
  } finally {
    await store.close();
    await endpoint.close();
  }
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
      source: source({ probe_timeout_ms: 100, cache_ttl_ms: 0 }),
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
