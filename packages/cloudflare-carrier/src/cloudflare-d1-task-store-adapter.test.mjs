import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeD1 } from '@narada2/invokable-intelligence-registry';
import { createCloudflareD1TaskStoreAdapter } from './cloudflare-d1-task-store-adapter.mjs';

test('D1 task-store adapter owns session-scoped task persistence', async () => {
  const db = createFakeD1(':memory:');
  const adapter = createCloudflareD1TaskStoreAdapter({ CLOUDFLARE_CARRIER_TASK_DB: db });
  const store = adapter.forSession({
    site_id: 'site:adapter-test',
    site_root: 'cloudflare://site:adapter-test',
    carrier_session_id: 'carrier:adapter-test',
    agent_id: 'agent:adapter-test',
    now: () => '2026-07-20T23:00:00.000Z',
  });
  const created = await store.create({ title: 'Adapter task', description: 'persisted' });
  assert.equal(created.task_number, 1);
  assert.equal((await store.list()).length, 1);
  const updated = await store.update({ task_id: created.task_id, status: 'done', note: 'verified' });
  assert.equal(updated.status, 'done');
  assert.equal((await store.list())[0].note, 'verified');
});
