import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NARS_TURN_TERMINAL_STATES,
  assertNarsTurnTransition,
  canTransitionNarsTurn,
  isNarsTurnTerminalState,
  normalizeNarsTurnRecord,
} from './turn-state.mjs';

test('turn FSM accepts the declared execution path and terminal outcomes', () => {
  const path = [
    ['accepted', 'contextualized'],
    ['contextualized', 'evaluating'],
    ['evaluating', 'tool_requested'],
    ['tool_requested', 'tool_admitted'],
    ['tool_admitted', 'executing'],
    ['executing', 'reconciling'],
    ['reconciling', 'evaluating'],
    ['evaluating', 'reconciling'],
    ['reconciling', 'completed'],
  ];
  for (const [previous, next] of path) assert.equal(canTransitionNarsTurn(previous, next), true);
  for (const state of NARS_TURN_TERMINAL_STATES) assert.equal(isNarsTurnTerminalState(state), true);
});

test('turn FSM refuses illegal transitions and requires explicit retry from terminal state', () => {
  assert.throws(() => assertNarsTurnTransition('accepted', 'completed'), /invalid_nars_turn_transition/);
  assert.equal(canTransitionNarsTurn('completed', 'accepted'), false);
  assert.equal(canTransitionNarsTurn('completed', 'accepted', { retry: true }), true);
});

test('turn records retain the durable input and authority boundary fields', () => {
  assert.deepEqual(normalizeNarsTurnRecord({
    turn_id: 'turn-1',
    input_event_id: 'input-1',
    session_id: 'session-1',
    agent_id: 'agent-1',
    input_ref: { kind: 'session_input', event_id: 'input-1' },
    authority_posture: 'read_only',
  }), {
    schema: 'narada.nars.turn_state.v1',
    turn_id: 'turn-1',
    input_event_id: 'input-1',
    session_id: 'session-1',
    agent_id: 'agent-1',
    input_ref: { kind: 'session_input', event_id: 'input-1' },
    authority_posture: 'read_only',
    turn_state: 'accepted',
    terminal_state: null,
    attempt: 1,
    updated_at: null,
    last_error: null,
  });
});
