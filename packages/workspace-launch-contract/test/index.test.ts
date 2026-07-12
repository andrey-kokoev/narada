import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkspaceLaunchDashboard } from '../src/index.ts';

const selection = {
  site: ['sonar'],
  role: ['resident'],
  operatorSurface: ['agent-cli'],
  runtime: 'codex',
  intelligenceProvider: 'codex-subscription',
};

const validAttempt = {
  launch_attempt_id: 'attempt-1',
  selection,
  status: 'launched',
  result_summary: 'launch accepted',
};

test('accepts an explicitly empty dashboard', () => {
  assert.deepEqual(parseWorkspaceLaunchDashboard({ attempts: [] }), { attempts: [] });
});

test('accepts nullable runtime session identifiers from an unowned observation', () => {
  const parsed = parseWorkspaceLaunchDashboard({
    attempts: [{ ...validAttempt, observations: [{ health: 'unowned', session_id: null }] }],
  });
  assert.equal(parsed?.attempts[0]?.observations?.[0]?.session_id, null);
});

test('rejects a dashboard when any attempt row is malformed', () => {
  assert.equal(
    parseWorkspaceLaunchDashboard({
      attempts: [
        validAttempt,
        { ...validAttempt, launch_attempt_id: 42 },
      ],
    }),
    null,
  );
});
