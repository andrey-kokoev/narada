import assert from 'node:assert/strict';
import test from 'node:test';

import { createNarsStateMachine } from './runtime-state-machine.js';

test('state-machine canonical fields cannot be overwritten by extensions', () => {
  const machine: any = createNarsStateMachine({
    initialState: 'created',
    identityFields: { request_id: 'canonical-request' },
    metadata: {
      schema: 'metadata-schema',
      request_id: 'metadata-request',
      request_state: 'metadata-state',
      terminal_state: 'metadata-terminal',
      timestamp: 'metadata-timestamp',
      source: 'metadata-source',
    },
    schema: 'canonical-schema',
    event: 'canonical-event',
    stateField: 'request_state',
    isTerminalState: (state: any) => state === 'completed',
    assertTransition: (previousState: any, nextState: any) => {
      assert.equal(previousState, 'created');
      assert.equal(nextState, 'completed');
    },
    now: () => 'canonical-timestamp',
  });

  const record: any = machine.transition('completed', {
    event: 'evidence-event',
    request_id: 'evidence-request',
    request_state: 'evidence-state',
    terminal_state: 'evidence-terminal',
    source: 'evidence-source',
  });

  assert.deepEqual(record, {
    source: 'evidence-source',
    schema: 'canonical-schema',
    event: 'canonical-event',
    timestamp: 'canonical-timestamp',
    request_id: 'canonical-request',
    previous_state: 'created',
    request_state: 'completed',
    terminal_state: 'completed',
  });
  assert.equal(machine.snapshot().request_state, 'completed');
  assert.equal(machine.snapshot().terminal_state, 'completed');
  assert.equal(machine.snapshot().request_id, 'canonical-request');
});

test('state-machine rejects identity fields that collide with canonical fields', () => {
  for (const fieldName of ['schema', 'event', 'timestamp', 'previous_state', 'terminal_state', 'request_state']) {
    assert.throws(
      () => createNarsStateMachine({
        identityFields: { [fieldName]: 'invalid-identity' },
        schema: 'canonical-schema',
        event: 'canonical-event',
        stateField: 'request_state',
        isTerminalState: () => false,
        assertTransition: () => {},
      }),
      (error: any) => error instanceof Error
        && error.message === `narada_state_machine_reserved_identity_field:${fieldName}`,
    );
  }
});
