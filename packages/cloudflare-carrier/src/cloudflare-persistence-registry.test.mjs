import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createFakeD1 } from '@narada2/invokable-intelligence-registry';
import {
  CLOUDFLARE_CARRIER_PERSISTENCE_SCHEMA_MANIFEST,
  createCloudflarePersistenceRegistry,
  persistenceDomainForTable,
} from './cloudflare-persistence-registry.mjs';
import { createCloudflareD1TaskStoreAdapter } from './cloudflare-d1-task-store-adapter.mjs';
import { fakeD1TaskDatabase } from './cloudflare-d1-test-fixtures.mjs';

test('carrier persistence manifest gives every runtime table one bounded-context owner', () => {
  const tables = CLOUDFLARE_CARRIER_PERSISTENCE_SCHEMA_MANIFEST.map(({ table }) => table);
  assert.equal(tables.length, 38);
  assert.equal(new Set(tables).size, tables.length);
  for (const table of tables) assert.ok(persistenceDomainForTable(table));

  const runtimeDdl = [
    readFileSync(new URL('./cloudflare-worker.mjs', import.meta.url), 'utf8'),
    readFileSync(new URL('./cloudflare-d1-task-store-adapter.mjs', import.meta.url), 'utf8'),
  ].flatMap((source) => [...source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/giu)].map(([, table]) => table));
  assert.deepEqual([...new Set(runtimeDdl)].sort(), [...tables].sort());

  const carrierTest = readFileSync(new URL('./contracts/cloudflare-carrier-contract-cases.mjs', import.meta.url), 'utf8');
  assert.match(carrierTest, /cloudflare-d1-test-fixtures\.mjs/);
  assert.doesNotMatch(carrierTest, /function\s+fakeD1(?:Statement|SiteRegistryStatement|TaskDatabase)/u);
});

test('every persistence domain exposes an owned repository port', () => {
  const db = createFakeD1(':memory:');
  const registry = createCloudflarePersistenceRegistry(db);
  assert.ok(registry);
  for (const domain of registry.domains) {
    const repository = registry.repository(domain);
    assert.ok(repository);
    assert.equal(repository.domain, domain);
    assert.match(repository.owner, /-repository$/);
    assert.ok(repository.schema_owner);
    assert.ok(repository.tables.length > 0);
  }
  db.close();
});

test('persistence repositories reject cross-domain SQL instead of becoming a shared database service', async () => {
  const db = createFakeD1(':memory:');
  const registry = createCloudflarePersistenceRegistry(db);
  assert.ok(registry);
  const taskRepository = registry.repository('task-store');
  assert.throws(
    () => taskRepository.prepare('SELECT * FROM cloudflare_mailbox_status_shadow_reads'),
    /cloudflare_persistence_cross_domain_query:task-store:cloudflare_mailbox_status_shadow_reads/,
  );
  db.close();
});

test('SQLite D1 and the reusable carrier fixture preserve task idempotency, ordering, update, and readback semantics', async () => {
  const sqlite = createFakeD1(':memory:');
  const localFixture = fakeD1TaskDatabase();
  const now = () => '2026-07-21T00:00:00.000Z';
  const sqliteStore = createCloudflareD1TaskStoreAdapter({ CLOUDFLARE_CARRIER_TASK_DB: sqlite })
    .forSession({ site_id: 'site_fixture', site_root: 'cloudflare://site_fixture', now });
  const fixtureStore = createCloudflareD1TaskStoreAdapter({ CLOUDFLARE_CARRIER_TASK_DB: localFixture })
    .forSession({ site_id: 'site_fixture', site_root: 'cloudflare://site_fixture', now });

  const exercise = async (store) => {
    const first = await store.create({ title: 'first' });
    const second = await store.create({ title: 'second' });
    const updated = await store.update({ task_id: first.task_id, status: 'done', note: 'verified' });
    const repeated = await store.update({ task_id: first.task_id, status: 'done', note: 'verified' });
    return { first, second, updated, repeated, listed: await store.list() };
  };

  const sqliteResult = await exercise(sqliteStore);
  const fixtureResult = await exercise(fixtureStore);
  assert.deepEqual(fixtureResult, sqliteResult);
  assert.deepEqual(sqliteResult.listed.map(({ task_number, status }) => ({ task_number, status })), [
    { task_number: 1, status: 'done' },
    { task_number: 2, status: 'open' },
  ]);
  assert.deepEqual(sqliteResult.repeated, sqliteResult.updated);
  assert.equal(sqliteResult.listed.length, 2, 'repeated updates do not create duplicate projections');
  assert.equal(Object.hasOwn(sqliteResult.first, 'site_root'), true);
  sqlite.close();
});
