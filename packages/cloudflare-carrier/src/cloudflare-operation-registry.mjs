/**
 * Declarative operation-handler registration contract.
 *
 * The registry is intentionally independent of HTTP, Durable Objects, D1,
 * and product handlers. Later routing work can register handlers here without
 * creating another operation-name list or dispatch switch.
 */

export const CLOUDFLARE_OPERATION_REGISTRY_VERSION = 'narada.cloudflare.operation-registry.v1';

const MUTATION_CLASSES = new Set(['read', 'write', 'control']);

function registryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function requireOperation(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw registryError('cloudflare_operation_registry_invalid_operation', 'An operation name is required.');
  }
  return value.trim();
}

function normalizeDefinition(definition = {}) {
  const operation = requireOperation(definition.operation);
  if (typeof definition.handler !== 'function') {
    throw registryError(
      'cloudflare_operation_registry_invalid_handler',
      `Operation ${operation} must provide a handler function.`,
      { operation },
    );
  }
  const mutationClass = definition.mutation_class ?? definition.mutationClass ?? 'read';
  if (!MUTATION_CLASSES.has(mutationClass)) {
    throw registryError(
      'cloudflare_operation_registry_invalid_mutation_class',
      `Operation ${operation} has unsupported mutation class ${mutationClass}.`,
      { operation, mutation_class: mutationClass },
    );
  }
  return Object.freeze({
    operation,
    handler: definition.handler,
    mutation_class: mutationClass,
    bounded_context: typeof definition.bounded_context === 'string' && definition.bounded_context.trim().length > 0
      ? definition.bounded_context.trim()
      : 'carrier',
    authority: typeof definition.authority === 'string' && definition.authority.trim().length > 0
      ? definition.authority.trim()
      : 'carrier',
    surface: typeof definition.surface === 'string' && definition.surface.trim().length > 0
      ? definition.surface.trim()
      : 'carrier',
    description: typeof definition.description === 'string' ? definition.description.trim() : null,
  });
}

function publicDefinition(definition) {
  return Object.freeze({
    operation: definition.operation,
    mutation_class: definition.mutation_class,
    bounded_context: definition.bounded_context,
    authority: definition.authority,
    surface: definition.surface,
    description: definition.description,
  });
}

export function defineCloudflareOperationHandler(definition = {}) {
  return normalizeDefinition(definition);
}

export function createCloudflareOperationRegistry(definitions = []) {
  if (!Array.isArray(definitions)) {
    throw registryError('cloudflare_operation_registry_invalid_definitions', 'Operation definitions must be an array.');
  }
  const entries = definitions.map(normalizeDefinition);
  const byOperation = new Map();
  for (const entry of entries) {
    if (byOperation.has(entry.operation)) {
      throw registryError(
        'cloudflare_operation_registry_duplicate_operation',
        `Operation ${entry.operation} was registered more than once.`,
        { operation: entry.operation },
      );
    }
    byOperation.set(entry.operation, entry);
  }
  return Object.freeze({
    schema: CLOUDFLARE_OPERATION_REGISTRY_VERSION,
    has(operation) {
      return byOperation.has(operation);
    },
    get(operation) {
      return byOperation.get(operation) ?? null;
    },
    describe(operation) {
      const entry = byOperation.get(operation);
      return entry ? publicDefinition(entry) : null;
    },
    list() {
      return Object.freeze(entries.map(publicDefinition));
    },
    async dispatch(operation, context) {
      const entry = byOperation.get(operation);
      if (!entry) {
        return { ok: false, code: 'cloudflare_operation_not_registered', operation };
      }
      return entry.handler(context);
    },
  });
}
