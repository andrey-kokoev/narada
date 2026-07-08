import assert from 'node:assert/strict';
import { classifyCarrierActionRequest } from '../../packages/carrier-action-admission/src/carrier-action-admission.mjs';

const classification = classifyCarrierActionRequest('agent_context_startup_sequence', {}, {
  toolMetadata: { read_only: true, source: 'surface_registry', reason: 'surface_registry_read_only_tool' },
});

assert.equal(classification.decision, 'read_only_admitted');
assert.equal(classification.classifier_source, 'surface_registry');
