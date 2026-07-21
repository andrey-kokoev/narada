import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCloudflareOperationRegistry,
  defineCloudflareOperationHandler,
} from './cloudflare-operation-registry.mjs';

test('operation registry describes and dispatches registered handlers', async () => {
  const registry = createCloudflareOperationRegistry([
    defineCloudflareOperationHandler({
      operation: 'site.read',
      mutation_class: 'read',
      authority: 'site-membership',
      surface: 'site-product',
      handler: async (context) => ({ ok: true, context }),
    }),
  ]);

  assert.equal(registry.has('site.read'), true);
  assert.deepEqual(registry.describe('site.read'), {
    operation: 'site.read',
    mutation_class: 'read',
    bounded_context: 'carrier',
    authority: 'site-membership',
    surface: 'site-product',
    description: null,
  });
  assert.deepEqual(await registry.dispatch('site.read', { request_id: 'request-1' }), {
    ok: true,
    context: { request_id: 'request-1' },
  });
  assert.deepEqual(await registry.dispatch('site.unknown', {}), {
    ok: false,
    code: 'cloudflare_operation_not_registered',
    operation: 'site.unknown',
  });
});

test('operation registry rejects duplicate and malformed registrations', () => {
  assert.throws(
    () => createCloudflareOperationRegistry([
      { operation: 'site.read', handler() {} },
      { operation: 'site.read', handler() {} },
    ]),
    (error) => error.code === 'cloudflare_operation_registry_duplicate_operation',
  );
  assert.throws(
    () => defineCloudflareOperationHandler({ operation: 'site.write', mutation_class: 'unknown', handler() {} }),
    (error) => error.code === 'cloudflare_operation_registry_invalid_mutation_class',
  );
  assert.throws(
    () => defineCloudflareOperationHandler({ operation: 'site.read' }),
    (error) => error.code === 'cloudflare_operation_registry_invalid_handler',
  );
});
