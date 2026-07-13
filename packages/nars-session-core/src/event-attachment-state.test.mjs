import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNarsEventAttachmentTransition,
  canTransitionNarsEventAttachment,
  createNarsEventAttachmentStateMachine,
} from './event-attachment-state.mjs';

test('event attachment FSM records replay, live, and close lifecycle', () => {
  const machine = createNarsEventAttachmentStateMachine({ attachmentId: 'sub-1' });
  machine.transition('replaying', { source: 'event_log' });
  machine.transition('live');
  machine.transition('closing', { reason: 'client_close' });
  machine.transition('closed');
  assert.equal(machine.state, 'closed');
  assert.deepEqual(machine.history.map((entry) => entry.attachment_state), ['requested', 'replaying', 'live', 'closing', 'closed']);
});

test('event attachment FSM rejects live re-entry after close', () => {
  assert.equal(canTransitionNarsEventAttachment('closed', 'live'), false);
  assert.throws(
    () => assertNarsEventAttachmentTransition('closed', 'replaying'),
    /invalid_nars_event_attachment_transition:closed:replaying/,
  );
});

