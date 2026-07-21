import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUDFLARE_PRODUCT_OPERATION_CONTEXTS,
  createCloudflareProductOperationRegistry,
} from './cloudflare-product-operation-registry.mjs';

test('product operation registry has one discoverable owner for every registered operation', async () => {
  const calls = [];
  const registry = createCloudflareProductOperationRegistry({
    dispatch: async (request) => {
      calls.push(request);
      return { ok: true, operation: request.operation, bounded_context: registry.describe(request.operation).bounded_context };
    },
  });
  const definitions = registry.list();

  assert.equal(definitions.length, 91);
  assert.deepEqual(
    [...new Set(definitions.map((definition) => definition.bounded_context))].sort(),
    [...CLOUDFLARE_PRODUCT_OPERATION_CONTEXTS].sort(),
  );
  assert.equal(new Set(definitions.map((definition) => definition.operation)).size, definitions.length);
  for (const definition of definitions) {
    assert.equal(typeof registry.get(definition.operation).handler, 'function');
    const result = await registry.dispatch(definition.operation, { request_id: 'request-registry-contract' });
    assert.deepEqual(result, {
      ok: true,
      operation: definition.operation,
      bounded_context: definition.bounded_context,
    });
  }
  assert.equal(calls.length, definitions.length);
});

test('unregistered product operations fail closed at the registry boundary', async () => {
  const registry = createCloudflareProductOperationRegistry({ dispatch: async () => ({ ok: true }) });
  assert.equal(registry.has('site.not_registered'), false);
  assert.deepEqual(await registry.dispatch('site.not_registered', {}), {
    ok: false,
    code: 'cloudflare_operation_not_registered',
    operation: 'site.not_registered',
  });
});
