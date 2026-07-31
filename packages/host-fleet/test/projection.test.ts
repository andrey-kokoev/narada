import test from 'node:test';
import assert from 'node:assert/strict';
import { hostScopedTargetLabel, resolveRuntimeTarget } from '../src/projection.ts';
import type { HostRuntimeSession } from '../src/contract.ts';

function session(id: string, host = 'desktop-sunroom-2'): HostRuntimeSession {
  return {
    target: {
      host_id: host,
      host_instance_id: 'instance-a',
      site_id: 'sonar',
      agent_id: 'resident',
      runtime_session_id: id,
    },
    state: 'active',
    health_status: 'online',
    started_at: '2026-07-31T12:00:00.000Z',
    last_seen_at: '2026-07-31T12:00:01.000Z',
  };
}

test('resolves only within the explicitly selected host instance', () => {
  const result = resolveRuntimeTarget(
    [session('desktop-session'), session('zima-session', 'zima-board-2')],
    {
      host_id: 'zima-board-2',
      host_instance_id: 'instance-a',
      site_id: 'sonar',
      agent_id: 'resident',
    },
  );
  assert.equal(result.status, 'resolved');
  if (result.status === 'resolved') {
    assert.equal(result.target.runtime_session_id, 'zima-session');
    assert.match(hostScopedTargetLabel(result.target), /zima-board-2@instance-a/);
  }
});

test('refuses ambiguous same-host sessions instead of choosing the newest', () => {
  const result = resolveRuntimeTarget(
    [session('session-a'), session('session-b')],
    {
      host_id: 'desktop-sunroom-2',
      host_instance_id: 'instance-a',
      site_id: 'sonar',
      agent_id: 'resident',
    },
  );
  assert.equal(result.status, 'refused');
  if (result.status === 'refused') {
    assert.equal(result.refusal.reason, 'runtime_target_ambiguous');
    assert.equal(result.refusal.candidates.length, 2);
  }
});
