import { describe, expect, it } from 'vitest';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchObservationRecord,
} from '../../src/commands/workspace-launch-types.js';
import { workspaceLaunchAttemptActivityState } from '../../src/commands/workspace-launch-observation.js';

const now = Date.parse('2026-07-16T12:00:00.000Z');

function attempt(
  observation: Partial<WorkspaceLaunchObservationRecord> = {},
): Pick<WorkspaceLaunchAttemptRecord, 'status' | 'expected_launch_session_ids' | 'observations'> {
  return {
    status: 'launched',
    expected_launch_session_ids: ['session-1'],
    observations: [{
      schema: 'narada.workspace_launch.observed_runtime.v1',
      observation_id: 'observation-1',
      launch_attempt_id: 'attempt-1',
      kind: 'nars',
      session_id: 'session-1',
      site_root: 'D:/code/site',
      health: 'healthy',
      authority: 'nars_session_management',
      ownership_posture: 'owned_by_runtime_authority',
      last_checked_at: '2026-07-16T11:59:30.000Z',
      message: 'NARS session session-1 is healthy.',
      ...observation,
    }],
  };
}

describe('workspace launch activity authority', () => {
  it('marks a fresh owned healthy expected session active', () => {
    expect(workspaceLaunchAttemptActivityState(attempt(), now)).toBe('active');
  });

  it('marks stale, unowned, failed, mismatched, and future observations historical', () => {
    expect(workspaceLaunchAttemptActivityState(attempt({ last_checked_at: '2026-07-16T11:00:00.000Z' }), now)).toBe('historical');
    expect(workspaceLaunchAttemptActivityState(attempt({ ownership_posture: 'observed_unowned' }), now)).toBe('historical');
    expect(workspaceLaunchAttemptActivityState(attempt({ health: 'failed' }), now)).toBe('historical');
    expect(workspaceLaunchAttemptActivityState(attempt({ session_id: 'session-2' }), now)).toBe('historical');
    expect(workspaceLaunchAttemptActivityState(attempt({ last_checked_at: '2026-07-16T12:00:01.000Z' }), now)).toBe('historical');
  });

  it('never treats a completed or unobserved attempt as active', () => {
    expect(workspaceLaunchAttemptActivityState({ ...attempt(), status: 'failed' }, now)).toBe('historical');
    expect(workspaceLaunchAttemptActivityState({ ...attempt(), expected_launch_session_ids: [], observations: [] }, now)).toBe('historical');
  });
});
