import { describe, expect, it } from 'vitest';
import type { WorkspaceLaunchAttemptRecord } from '../../src/commands/workspace-launch-types.js';
import {
  workspaceLaunchAttachActionAdmitted,
} from '../../src/commands/workspace-launch-ui-actions.js';
import { workspaceLaunchActionsForAttempt } from '../../src/commands/workspace-launch-projection.js';

function attempt(activity_state?: 'active' | 'historical'): WorkspaceLaunchAttemptRecord {
  return {
    schema: 'narada.workspace_launch.attempt.v1',
    launch_attempt_id: 'attempt-1',
    ui_session_id: 'ui-session-1',
    expected_launch_session_ids: ['session-1'],
    submitted_at: '2026-07-16T12:00:00.000Z',
    updated_at: '2026-07-16T12:00:00.000Z',
    selection: {
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: ['agent-web-ui'],
      runtime: 'narada-agent-runtime-server',
      intelligenceProvider: 'codex-subscription',
      selectionMode: { site: 'single', role: 'single', operatorSurface: 'single' },
    },
    status: 'launched',
    activity_state,
    result_summary: 'Launch completed.',
    plan_result_path: null,
    handoffs: [],
    observations: [{
      schema: 'narada.workspace_launch.observed_runtime.v1',
      observation_id: 'observation-1',
      launch_attempt_id: 'attempt-1',
      kind: 'nars',
      session_id: 'session-1',
      site_root: 'D:/code/sonar',
      health: 'healthy',
      authority: 'nars_session_management',
      ownership_posture: 'owned_by_runtime_authority',
      last_checked_at: '2026-07-16T11:59:30.000Z',
      message: 'NARS session is healthy.',
      attach_commands: {
        agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1:1234/events',
        agent_cli: 'narada-agent-cli --attach ws://127.0.0.1:1234/events',
      },
    }],
    projections: [],
    actions: [],
    diagnostic: null,
  };
}

describe('workspace launch projection admission', () => {
  it('admits only a fresh active attach action', () => {
    const live = attempt('active');
    const historical = attempt('historical');
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    expect(workspaceLaunchAttachActionAdmitted(live, 'open-web-ui', now)).toBe(true);
    expect(workspaceLaunchAttachActionAdmitted(live, 'attach-cli', now)).toBe(true);
    expect(workspaceLaunchAttachActionAdmitted(historical, 'open-web-ui', now)).toBe(false);
    expect(workspaceLaunchActionsForAttempt(historical)).not.toContain('open-web-ui');
    expect(workspaceLaunchActionsForAttempt(historical)).not.toContain('attach-cli');
  });

  it('does not reuse attach commands from an older observation', () => {
    const attemptWithStaleCommand = attempt('active');
    const newestObservation = { ...attemptWithStaleCommand.observations[0]! };
    delete newestObservation.attach_commands;
    attemptWithStaleCommand.observations = [
      { ...attemptWithStaleCommand.observations[0]!, last_checked_at: '2026-07-16T11:59:00.000Z' },
      { ...newestObservation, last_checked_at: '2026-07-16T11:59:45.000Z' },
    ];

    expect(workspaceLaunchAttachActionAdmitted(
      attemptWithStaleCommand,
      'open-web-ui',
      Date.parse('2026-07-16T12:00:00.000Z'),
    )).toBe(false);
  });
});
