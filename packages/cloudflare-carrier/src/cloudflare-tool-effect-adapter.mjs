/**
 * Capability-scoped tool-effect adapter boundary.
 *
 * The implementation is injected so the compatibility Worker can keep its
 * existing effect semantics while callers depend on a named adapter contract.
 * The implementation can be moved into this module without changing callers.
 */
export function createCloudflareToolEffectAdapterBoundary({
  env = {},
  createImplementation,
} = {}) {
  if (typeof createImplementation !== 'function') {
    throw new TypeError('cloudflare_tool_effect_adapter_missing_implementation_factory');
  }
  const implementation = createImplementation(env);
  if (!implementation) return null;
  if (typeof implementation.execute !== 'function') {
    throw new TypeError('cloudflare_tool_effect_adapter_invalid_implementation');
  }
  return {
    ...implementation,
    async execute(request) {
      return implementation.execute(request);
    },
  };
}
