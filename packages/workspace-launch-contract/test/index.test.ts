import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkspaceLaunchDashboard, parseWorkspaceLaunchResultEnvelope, parseWorkspaceLaunchUiSessionList } from '../src/index.ts';

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

test('preserves legacy HTTP error envelopes without inventing a status', () => {
  assert.deepEqual(parseWorkspaceLaunchResultEnvelope({ error: 'selection_stale_retry' }), {
    error: 'selection_stale_retry',
  });
  assert.equal(parseWorkspaceLaunchResultEnvelope({}), null);
});

test('keeps historical launcher sessions separate while accepting legacy inventories', () => {
  const session = {
    schema: 'narada.workspace_launch.ui_session.v1',
    ui_session_id: 'ui-session-1',
    started_at: '2026-07-16T00:00:00.000Z',
    status: 'closed',
    url: null,
    registry_paths: [],
    owner: {
      package: '@narada2/cli',
      command: 'launcher workspace-launch',
      surface: 'interactive-selection-ui',
    },
  } as const;
  assert.deepEqual(parseWorkspaceLaunchUiSessionList({
    schema: 'narada.workspace_launch.ui_session_list.v1',
    sessions: [],
    history: [session],
  }), {
    schema: 'narada.workspace_launch.ui_session_list.v1',
    sessions: [],
    history: [session],
  });
  assert.deepEqual(parseWorkspaceLaunchUiSessionList({
    schema: 'narada.workspace_launch.ui_session_list.v1',
    sessions: [],
  })?.history, []);
});
