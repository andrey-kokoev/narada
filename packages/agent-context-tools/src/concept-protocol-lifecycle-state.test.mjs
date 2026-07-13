import assert from 'node:assert/strict';
import Database from './sqlite-database.mjs';
import { recordLifecycleEvent } from './concept-protocol-lifecycle-service.mjs';
import {
  assertConceptProtocolLifecycleTransition,
  canTransitionConceptProtocolLifecycle,
} from './concept-protocol-lifecycle-state.mjs';

const common = {
  object_id: 'concept:state_machine',
  object_type: 'concept',
  actor_agent_id: 'andrey-user.primary',
  authority_basis: { kind: 'operator_decision', summary: 'test authority' },
  scope: { site: 'narada', locus: 'test', applies_to: 'concept' },
  artifact_refs: ['artifact:test'],
  evidence_refs: ['evidence:test'],
};

assert.equal(canTransitionConceptProtocolLifecycle(null, 'observed', 'observed'), true);
assert.equal(canTransitionConceptProtocolLifecycle('observed', 'promoted', 'promoted'), false);
assert.equal(canTransitionConceptProtocolLifecycle('named', 'named', 'corrected'), true);
assert.throws(
  () => assertConceptProtocolLifecycleTransition({
    previousState: 'observed',
    nextState: 'promoted',
    eventType: 'promoted',
  }),
  /invalid_concept_protocol_lifecycle_transition/,
);

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE concept_protocol_lifecycle_events (
    event_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    state_after TEXT NOT NULL,
    actor_agent_id TEXT NOT NULL,
    authority_basis_json TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    artifact_refs_json TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE concept_protocol_lifecycle_current_state (
    object_id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    state_after TEXT NOT NULL,
    last_event_id TEXT NOT NULL,
    last_event_type TEXT NOT NULL,
    last_event_at TEXT NOT NULL,
    actor_agent_id TEXT NOT NULL,
    authority_basis_json TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    artifact_refs_json TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    notes TEXT,
    payload_json TEXT NOT NULL
  );
`);

const first = recordLifecycleEvent({
  db,
  toolArgs: { ...common, event_type: 'observed', state_after: 'observed' },
});
assert.equal(first.previous_state, null);
assert.equal(first.event.previous_state, null);

assert.throws(
  () => recordLifecycleEvent({
    db,
    toolArgs: { ...common, event_type: 'promoted', state_after: 'promoted' },
  }),
  /invalid_concept_protocol_lifecycle_transition/,
);

const named = recordLifecycleEvent({
  db,
  toolArgs: { ...common, event_type: 'named', state_after: 'named' },
});
assert.deepEqual(named.lifecycle_transition, {
  from: 'observed',
  to: 'named',
  event_type: 'named',
});

const corrected = recordLifecycleEvent({
  db,
  toolArgs: { ...common, event_type: 'corrected', state_after: 'named', notes: 'clarified' },
});
assert.equal(corrected.lifecycle_transition, null);
db.close();
