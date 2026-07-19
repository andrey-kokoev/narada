import test from 'node:test';
import assert from 'node:assert/strict';
import type { OperatorSiteAgentWireRecord } from '@narada2/operator-console-contract';
import { decideAgentInspection, decideAgentPrimaryAction } from '../src/site-agents/interactions.ts';

function agent(state: 'running' | 'stopped' | 'degraded' | 'ambiguous', sessionId: string | null = null): OperatorSiteAgentWireRecord {
  return {
    agent_id: 'sonar.resident',
    local_agent_id: 'resident',
    title: 'Resident',
    role: 'resident',
    admission_status: 'admitted',
    runtime: {
      state,
      session_count: state === 'stopped' ? 0 : state === 'ambiguous' ? 2 : 1,
      healthy_session_ids: sessionId ? [sessionId] : [],
      selected_session_id: sessionId,
    },
    work: { state: 'available', detail: null, source: 'principal-runtime' },
    actions: { start: state === 'stopped', inspect: state === 'running', inspect_reason: 'No single healthy session is available.' },
  };
}

test('primary activation ensures only stopped or uniquely healthy agents', () => {
  assert.deepEqual(decideAgentPrimaryAction(agent('stopped')), { kind: 'ensure-running' });
  assert.deepEqual(decideAgentPrimaryAction(agent('running', 'session-1')), { kind: 'ensure-running' });
  assert.equal(decideAgentPrimaryAction(agent('degraded')).kind, 'unavailable');
  assert.equal(decideAgentPrimaryAction(agent('ambiguous')).kind, 'unavailable');
});

test('inspection opens one session, routes ambiguity to a chooser, and refuses zero-session guessing', () => {
  assert.deepEqual(decideAgentInspection(agent('running', 'session-1')), { kind: 'open-session', sessionId: 'session-1' });
  assert.deepEqual(decideAgentInspection(agent('ambiguous')), { kind: 'choose-session' });
  assert.equal(decideAgentInspection(agent('stopped')).kind, 'unavailable');
  assert.equal(decideAgentInspection(agent('degraded')).kind, 'unavailable');
});
