import assert from 'node:assert/strict';
import test from 'node:test';
import worker, {
  CloudflareCarrierDurableObject,
  handleCloudflareScheduled,
  handleCloudflareWorkerRequest,
} from './worker-entry.mjs';

test('Worker entry is composition-only and registers fetch, scheduled, and Durable Object exports', async () => {
  assert.equal(worker.fetch, handleCloudflareWorkerRequest);
  assert.equal(worker.scheduled, handleCloudflareScheduled);
  assert.equal(typeof CloudflareCarrierDurableObject, 'function');

  const response = await worker.fetch(new Request('https://carrier.test/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    carrier_kind: 'cloudflare-carrier',
    product_surface: 'web-console',
  });
});
