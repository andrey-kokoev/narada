import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkspaceLaunchAttempt,
  canTransitionWorkspaceLaunchUiSession,
  createWorkspaceLaunchAttemptLifecycle,
  createWorkspaceLaunchUiSessionLifecycle,
  transitionWorkspaceLaunchAttempt,
  transitionWorkspaceLaunchUiSession,
} from '../../src/commands/workspace-launch-lifecycle.js';

describe('workspace launch lifecycle contracts', () => {
  it('records the session start and close path', () => {
    let lifecycle = createWorkspaceLaunchUiSessionLifecycle();
    for (const state of ['starting', 'open', 'closing', 'closed'] as const) {
      lifecycle = transitionWorkspaceLaunchUiSession(lifecycle, state);
    }
    expect(lifecycle.state).toBe('closed');
    expect(lifecycle.history).toEqual(['created', 'starting', 'open', 'closing', 'closed']);
    expect(canTransitionWorkspaceLaunchUiSession('open', 'timeout')).toBe(true);
    expect(canTransitionWorkspaceLaunchUiSession('closed', 'open')).toBe(false);
  });

  it('records the handoff and observation path for a launch attempt', () => {
    let lifecycle = createWorkspaceLaunchAttemptLifecycle();
    for (const state of ['planning', 'launching', 'handoff_recorded', 'observing', 'launched'] as const) {
      lifecycle = transitionWorkspaceLaunchAttempt(lifecycle, state);
    }
    expect(lifecycle.state).toBe('launched');
    expect(lifecycle.history).toEqual([
      'queued',
      'planning',
      'launching',
      'handoff_recorded',
      'observing',
      'launched',
    ]);
    expect(canTransitionWorkspaceLaunchAttempt('launched', 'observing')).toBe(true);
    expect(canTransitionWorkspaceLaunchAttempt('failed', 'queued')).toBe(false);
    expect(canTransitionWorkspaceLaunchAttempt('forgotten', 'queued')).toBe(false);
  });

  it('rejects lifecycle shortcuts', () => {
    expect(() => transitionWorkspaceLaunchUiSession(createWorkspaceLaunchUiSessionLifecycle(), 'closed'))
      .toThrow(/invalid_workspace_launch_ui_session_transition/);
    expect(() => transitionWorkspaceLaunchAttempt(createWorkspaceLaunchAttemptLifecycle(), 'launched'))
      .toThrow(/invalid_workspace_launch_attempt_transition/);
  });
});
