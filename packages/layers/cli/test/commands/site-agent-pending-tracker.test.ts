import { describe, expect, it } from 'vitest';
import { createSiteAgentPendingTracker } from '../../src/commands/site-agent-pending-tracker.js';

describe('site agent pending tracker', () => {
  it('records, lists, resolves, and removes pending launches', () => {
    const tracker = createSiteAgentPendingTracker();
    tracker.record({ site_id: 'sonar', agent_id: 'sonar.resident', session_id: 'session-1', started_at: '2026-07-19T00:00:00.000Z' });
    tracker.record({ site_id: 'sonar', agent_id: 'sonar.builder', session_id: null, started_at: '2026-07-19T00:01:00.000Z' });
    expect(tracker.list()).toHaveLength(2);
    expect(tracker.resolve('sonar', 'sonar.resident')).toMatchObject({ agent_id: 'sonar.resident', session_id: 'session-1' });
    expect(tracker.resolve('SONAR', 'SONAR.RESIDENT')).toMatchObject({ agent_id: 'sonar.resident' });
    expect(tracker.remove('sonar', 'sonar.resident')).toBe(true);
    expect(tracker.resolve('sonar', 'sonar.resident')).toBeNull();
    expect(tracker.list()).toHaveLength(1);
  });

  it('supersedes an existing pending launch for the same agent', () => {
    const tracker = createSiteAgentPendingTracker();
    tracker.record({ site_id: 'sonar', agent_id: 'sonar.resident', session_id: null, started_at: '2026-07-19T00:00:00.000Z' });
    tracker.record({ site_id: 'sonar', agent_id: 'sonar.resident', session_id: 'session-2', started_at: '2026-07-19T00:02:00.000Z' });
    expect(tracker.list()).toHaveLength(1);
    expect(tracker.resolve('sonar', 'sonar.resident')).toMatchObject({ session_id: 'session-2' });
  });

  it('expires entries after the ttl', () => {
    let current = new Date('2026-07-19T00:00:00.000Z');
    const tracker = createSiteAgentPendingTracker({ ttlMs: 1_000, now: () => current });
    tracker.record({ site_id: 'sonar', agent_id: 'sonar.resident', session_id: null, started_at: current.toISOString() });
    expect(tracker.list()).toHaveLength(1);
    current = new Date('2026-07-19T00:00:02.000Z');
    expect(tracker.list()).toHaveLength(0);
    expect(tracker.resolve('sonar', 'sonar.resident')).toBeNull();
  });
});
