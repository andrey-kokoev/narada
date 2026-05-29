import assert from 'node:assert/strict';
import {
  arraySchema,
  authorityBasisSchema,
  enumStringSchema,
  normalizeToolName,
  objectSchema,
  stringSchema,
  validateArgs,
  validationErrorResult,
} from '../src/index.mjs';

assert.equal(normalizeToolName('old', { old: 'new' }), 'new');
assert.equal(normalizeToolName('current', { old: 'new' }), 'current');

const schema = objectSchema({
  task_number: { type: 'number' },
  agent_id: stringSchema('Agent id.'),
}, ['task_number', 'agent_id'], { payloadRef: true });

assert.equal(schema.additionalProperties, false);
assert.ok(schema.properties.payload_ref);

const errors = validateArgs('task_lifecycle_prove_criteria', {
  task_number: 1,
  agent_id: 'agent',
  summary: 'x'.repeat(500),
}, schema);
assert.deepEqual(errors, [{
  field: 'summary',
  expected: 'none',
  received: 'string',
  message: 'Unexpected field: summary',
}]);

assert.deepEqual(validationErrorResult(errors), {
  status: 'error',
  schema: 'narada.task.mcp.validation_error.v0',
  validation_errors: errors,
});

const nestedSchema = objectSchema({
  status: enumStringSchema(['opened', 'claimed'], 'Task status.'),
  tags: arraySchema(stringSchema('Tag.'), 'Tags.'),
  authority_basis: authorityBasisSchema('Authority basis.'),
}, ['status', 'tags', 'authority_basis']);

assert.deepEqual(validateArgs('nested', {
  status: 'closed',
  tags: ['ok', 7],
  authority_basis: { kind: 'operator_direct_instruction', extra: true },
}, nestedSchema), [
  {
    field: 'status',
    expected: 'one_of:opened|claimed',
    received: 'closed',
    message: 'Field status must be one of: opened, claimed',
  },
  {
    field: 'tags[1]',
    expected: 'string',
    received: 'number',
    message: 'Field tags[1] must be a string, got number',
  },
  {
    field: 'authority_basis.summary',
    expected: 'string',
    received: 'missing',
    message: 'Missing required field: authority_basis.summary',
  },
  {
    field: 'authority_basis.extra',
    expected: 'none',
    received: 'boolean',
    message: 'Unexpected field: authority_basis.extra',
  },
]);

console.log('task lifecycle kernel tests passed');
