import { describe, expect, it } from 'vitest';
import { workspaceLaunchAttemptActivityState } from '../../src/commands/workspace-launch-observation.js';

const now = Date.parse('2026-07-12T12:00:00.000Z');

function observation(overrides: Partial<{
  health: 'waiting' | 'healthy' | 'ambiguous' | 'stale' | 'failed' | 'unowned';
  session_id: string | null;
  last_checked_at: string;
  ownership_posture: 'not_yet_observed' | 'owned_by_runtime_authority' | 'observed_unowned';
}> = {}) {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1' as const,
    observation_id: 'observation-1',
    launch_attempt_id: 'attempt-1',
    kind: 'nars' as const,
    session_id: 'session-live',
    site_root: 'D:\\code\\smart-scheduling',
    health: 'healthy' as const,
    authority: 'nars_session_management' as const,
    ownership_posture: 'owned_by_runtime_authority' as const,
    last_checked_at: '2026-07-12T11:59:30.000Z',
    message: 'NARS session is healthy.',
    ...overrides,
  };
}

describe('workspace launch activity observation', () => {
  it('requires a fresh healthy observation owned by the expected launch', () => {
    expect(workspaceLaunchAttemptActivityState({
      status: 'launched',
      expected_launch_session_ids: ['session-live'],
      observations: [observation()],
    }, now)).toBe('active');

    expect(workspaceLaunchAttemptActivityState({
      status: 'launched',
      expected_launch_session_ids: ['session-other'],
      observations: [observation()],
    }, now)).toBe('historical');

    expect(workspaceLaunchAttemptActivityState({
      status: 'failed',
      expected_launch_session_ids: ['session-live'],
      observations: [observation()],
    }, now)).toBe('historical');
  });

  it('classifies stale, unhealthy, and unowned observations as historical', () => {
    for (const candidate of [
      observation({ last_checked_at: '2026-07-12T08:00:00.000Z' }),
      observation({ health: 'failed' }),
      observation({ ownership_posture: 'observed_unowned' }),
    ]) {
      expect(workspaceLaunchAttemptActivityState({
        status: 'launched',
        expected_launch_session_ids: ['session-live'],
        observations: [candidate],
      }, now)).toBe('historical');
    }
  });
});
