import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { generateRecommendations } from '../../src/lib/task-recommender.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'agent-alpha', role: 'implementer', capabilities: ['typescript', 'testing', 'cli'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  // Task 998: opened in markdown, will be overridden in SQLite
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-test-task.md'),
    '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: Test Task\n\nA test task.\n',
  );

  // Task 999: opened in markdown
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-other-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Other Task\n\nAnother test task.\n',
  );

  // Task 997: needs_continuation in markdown, will be overridden to opened in SQLite
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-997-continuation-task.md'),
    '---\ntask_id: 997\nstatus: needs_continuation\n---\n\n# Task 997: Continuation Task\n\nNeeds continuation.\n',
  );
}

function setupWarmContextRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  // Two equivalent agents — same capabilities, both idle
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-04-20T00:00:00Z',
      agents: [
        { agent_id: 'agent-warm', role: 'implementer', capabilities: ['typescript', 'testing'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'agent-cold', role: 'implementer', capabilities: ['typescript', 'testing'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  // Task 1000: in "Warm Chapter" — opened
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1000-warm-ctx-task.md'),
    '---\ntask_id: 1000\nstatus: opened\n---\n\n# Task 1000: Warm Chapter Task\n\n## Chapter\nWarm Chapter\n\nDo something in warm chapter.\n',
  );

  // Task 1001: also in "Warm Chapter" — opened
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1001-warm-ctx-task.md'),
    '---\ntask_id: 1001\nstatus: opened\n---\n\n# Task 1001: Another Warm Chapter Task\n\n## Chapter\nWarm Chapter\n\nDo something else.\n',
  );

  // Task 1002: in "Cold Chapter" — opened
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1002-cold-ctx-task.md'),
    '---\ntask_id: 1002\nstatus: opened\n---\n\n# Task 1002: Cold Chapter Task\n\n## Chapter\nCold Chapter\n\nDo something in cold chapter.\n',
  );
}

describe('generateRecommendations with store', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-recommender-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('filters out tasks that are closed in SQLite even when markdown says opened', async () => {
    const store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: '20260420-998-test-task',
      task_number: 998,
      status: 'closed',
      governed_by: 'operator',
      closed_at: '2026-04-20T00:00:00Z',
      closed_by: 'operator',
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-20T00:00:00Z',
    });

    const result = await generateRecommendations({ cwd: tempDir, store });
    const allIds = [
      ...(result.primary ? [result.primary.task_id] : []),
      ...result.alternatives.map((c) => c.task_id),
    ];
    expect(allIds).not.toContain('20260420-998-test-task');
    expect(allIds).toContain('20260420-999-other-task');

    store.db.close();
  });

  it('includes tasks that are opened in SQLite even when markdown says needs_continuation', async () => {
    const store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: '20260420-997-continuation-task',
      task_number: 997,
      status: 'opened',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-20T00:00:00Z',
    });

    const result = await generateRecommendations({ cwd: tempDir, store });
    const allIds = [
      ...(result.primary ? [result.primary.task_id] : []),
      ...result.alternatives.map((c) => c.task_id),
    ];
    expect(allIds).toContain('20260420-997-continuation-task');

    store.db.close();
  });

  it('falls back to markdown status when store has no record', async () => {
    const store = openTaskLifecycleStore(tempDir);
    // No lifecycle rows inserted

    const result = await generateRecommendations({ cwd: tempDir, store });
    const allIds = [
      ...(result.primary ? [result.primary.task_id] : []),
      ...result.alternatives.map((c) => c.task_id),
    ];
    expect(allIds).toContain('20260420-998-test-task');
    expect(allIds).toContain('20260420-999-other-task');

    store.db.close();
  });
});

describe('generateRecommendations warm-context affinity', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-warm-context-test-'));
    setupWarmContextRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers agent with recent same-chapter work over equivalent idle agent', async () => {
    // agent-warm completed task 1001 (in Warm Chapter) yesterday
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-1001-warm-ctx-task.json'),
      JSON.stringify({
        task_id: '20260420-1001-warm-ctx-task',
        assignments: [
          {
            agent_id: 'agent-warm',
            claimed_at: '2026-04-19T00:00:00Z',
            claim_context: null,
            released_at: '2026-04-19T12:00:00Z',
            release_reason: 'completed',
          },
        ],
      }, null, 2),
    );

    const result = await generateRecommendations({ cwd: tempDir });

    // Task 1000 is in Warm Chapter; agent-warm should be preferred
    const task1000Candidates = [result.primary, ...result.alternatives].filter(
      (c) => c?.task_id === '20260420-1000-warm-ctx-task',
    );
    expect(task1000Candidates.length).toBeGreaterThan(0);
    const topCandidate = task1000Candidates[0]!;
    expect(topCandidate.principal_id).toBe('agent-warm');
    expect(topCandidate.breakdown.warm_context).toBeGreaterThan(0);
    expect(topCandidate.rationale).toContain('Warm context');
  });

  it('stale warm context decays to near-zero after 14 days', async () => {
    // agent-warm completed task 1001 (in Warm Chapter) 14 days ago
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-1001-warm-ctx-task.json'),
      JSON.stringify({
        task_id: '20260420-1001-warm-ctx-task',
        assignments: [
          {
            agent_id: 'agent-warm',
            claimed_at: '2026-04-06T00:00:00Z',
            claim_context: null,
            released_at: '2026-04-06T12:00:00Z',
            release_reason: 'completed',
          },
        ],
      }, null, 2),
    );

    const result = await generateRecommendations({ cwd: tempDir });

    const task1000Candidates = [result.primary, ...result.alternatives].filter(
      (c) => c?.task_id === '20260420-1000-warm-ctx-task',
    );
    expect(task1000Candidates.length).toBeGreaterThan(0);
    const warmCandidate = task1000Candidates.find((c) => c!.principal_id === 'agent-warm')!;
    expect(warmCandidate).toBeDefined();
    // 14 days with 7-day half-life: decay = exp(-2) ≈ 0.135
    expect(warmCandidate.breakdown.warm_context).toBeLessThan(0.2);
  });

  it('hard blockers still skip agent even with strong warm context', async () => {
    // agent-warm completed task 1001 (in Warm Chapter) yesterday — strong warm context
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-1001-warm-ctx-task.json'),
      JSON.stringify({
        task_id: '20260420-1001-warm-ctx-task',
        assignments: [
          {
            agent_id: 'agent-warm',
            claimed_at: '2026-04-19T00:00:00Z',
            claim_context: null,
            released_at: '2026-04-19T12:00:00Z',
            release_reason: 'completed',
          },
        ],
      }, null, 2),
    );

    // agent-warm has an active assignment on another task (at capacity)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-1002-cold-ctx-task.json'),
      JSON.stringify({
        task_id: '20260420-1002-cold-ctx-task',
        assignments: [
          {
            agent_id: 'agent-warm',
            claimed_at: '2026-04-20T00:00:00Z',
            claim_context: null,
            released_at: null,
            release_reason: null,
          },
        ],
      }, null, 2),
    );

    // Also mark agent-warm as working in roster so load score drops
    writeFileSync(
      join(tempDir, '.ai', 'agents', 'roster.json'),
      JSON.stringify({
        version: 1,
        updated_at: '2026-04-20T00:00:00Z',
        agents: [
          { agent_id: 'agent-warm', role: 'implementer', capabilities: ['typescript', 'testing'], status: 'working', task: 1002, first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
          { agent_id: 'agent-cold', role: 'implementer', capabilities: ['typescript', 'testing'], status: 'idle', first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        ],
      }, null, 2),
    );

    const result = await generateRecommendations({ cwd: tempDir });

    // Task 1000 should still go to agent-cold because agent-warm is at capacity
    const task1000Candidates = [result.primary, ...result.alternatives].filter(
      (c) => c?.task_id === '20260420-1000-warm-ctx-task',
    );
    expect(task1000Candidates.length).toBeGreaterThan(0);
    const topCandidate = task1000Candidates[0]!;
    expect(topCandidate.principal_id).toBe('agent-cold');
  });
});
