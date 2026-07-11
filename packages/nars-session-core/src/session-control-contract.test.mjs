import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NARS_SESSION_CORE_METHOD_LIST,
  isNarsSessionCoreMethod,
} from './session-control-contract.mjs';

test('session-core control inventory is narrow and explicit', () => {
  assert.deepEqual(NARS_SESSION_CORE_METHOD_LIST, [
    'session.events.subscribe',
    'session.events.read',
    'session.submit',
    'session.health',
    'session.recovery',
    'session.cancel',
    'session.close',
  ]);
  assert.equal(isNarsSessionCoreMethod('session.submit'), true);
  assert.equal(isNarsSessionCoreMethod('conversation.send'), false);
  assert.equal(isNarsSessionCoreMethod('session.affordance.action.request'), false);
});
