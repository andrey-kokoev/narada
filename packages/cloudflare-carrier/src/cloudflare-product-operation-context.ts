import { defineCloudflareOperationHandler } from './cloudflare-operation-registry.ts';

const READ_OPERATION_SUFFIXES = [
  '.read',
  '.list',
  '.status',
  '.scope',
];

export function cloudflareProductOperationMutationClass(operation: any) {
  if (READ_OPERATION_SUFFIXES.some((suffix: any) => operation.endsWith(suffix))) return 'read';
  return 'write';
}

export function defineCloudflareProductContextOperations({
  bounded_context,
  authority,
  operations,
  dispatch,
}: any= {}) {
  if (typeof dispatch !== 'function') {
    throw new TypeError(`cloudflare_product_context_missing_dispatch:${bounded_context ?? 'unknown'}`);
  }
  return operations.map((operation: any) => defineCloudflareOperationHandler({
    operation,
    bounded_context,
    authority,
    mutation_class: cloudflareProductOperationMutationClass(operation),
    surface: 'site-product',
    description: `${bounded_context} operation handler`,
    handler: (request: any) => dispatch({ ...request, operation }),
  }));
}