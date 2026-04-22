import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadRoster,
  saveRoster,
  withRosterMutation,
  updateAgentRosterEntry,
  atomicWriteFile,
  lintTaskFiles,
  extractTaskRefsFromBody,
  parseFrontMatter,
  serializeFrontMatter,
  readTaskFile,
  writeTaskFile,
  type AgentRoster,
} from '../../src/lib/task-governance.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeRoster(): AgentRoster {
  return {
    version: 2,
    updated_at: '2026-01-01T00:00:00Z',
    agents: [
      {
        agent_id: 'alpha',
        role: 'implementer',
        capabilities: ['claim'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        agent_id: 'beta',
        role: 'reviewer',
        capabilities: ['derive', 'propose'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function setupRepo(tempDir: string, roster?: AgentRoster) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify(roster ?? makeRoster(), null, 2),
  );
}

describe('withRosterMutation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-roster-lock-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('applies a mutation and persists the roster', async () => {
    const result = await withRosterMutation(tempDir, (roster) => {
      const entry = roster.agents.find((a) => a.agent_id === 'alpha')!;
      entry.status = 'working';
      entry.task = 123;
      return roster;
    });

    expect(result.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('working');
    expect(result.agents.find((a) => a.agent_id === 'alpha')?.task).toBe(123);

    // Re-read from disk to confirm persistence
    const reloaded = await loadRoster(tempDir);
    expect(reloaded.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('working');
    expect(reloaded.agents.find((a) => a.agent_id === 'alpha')?.task).toBe(123);
  });

  it('rolls back on mutation error', async () => {
    const original = await loadRoster(tempDir);
    const rosterPath = join(tempDir, '.ai', 'agents', 'roster.json');
    const beforeMtime = statSync(rosterPath).mtimeMs;

    await expect(
      withRosterMutation(tempDir, () => {
        throw new Error('Intentional failure');
      }),
    ).rejects.toThrow('Intentional failure');

    // Roster must remain unchanged
    const after = await loadRoster(tempDir);
    expect(after.version).toBe(original.version);
    expect(after.agents).toHaveLength(original.agents.length);

    // The roster file must always exist and be valid JSON
    const diskRaw = await import('node:fs/promises').then((m) => m.readFile(rosterPath, 'utf8'));
    const parsed = JSON.parse(diskRaw);
    expect(parsed.agents).toBeInstanceOf(Array);
  });

  it('rejects invalid roster shape after mutation', async () => {
    await expect(
      withRosterMutation(tempDir, () => {
        return { version: 1 } as unknown as AgentRoster;
      }),
    ).rejects.toThrow('Roster mutation produced invalid agents array');
  });

  it('serializes conflicting mutations to the same agent deterministically', async () => {
    const results = await Promise.all([
      withRosterMutation(tempDir, (roster) => {
        const entry = roster.agents.find((a) => a.agent_id === 'alpha')!;
        entry.status = 'working';
        entry.task = 1;
        return roster;
      }),
      withRosterMutation(tempDir, (roster) => {
        const entry = roster.agents.find((a) => a.agent_id === 'alpha')!;
        entry.status = 'reviewing';
        entry.task = 2;
        return roster;
      }),
      withRosterMutation(tempDir, (roster) => {
        const entry = roster.agents.find((a) => a.agent_id === 'alpha')!;
        entry.status = 'done';
        entry.task = 3;
        return roster;
      }),
    ]);

    // All three mutations should succeed
    expect(results).toHaveLength(3);

    // Disk must reflect exactly one final state (last writer wins)
    const disk = await loadRoster(tempDir);
    const diskStatus = disk.agents.find((a) => a.agent_id === 'alpha')?.status;
    const diskTask = disk.agents.find((a) => a.agent_id === 'alpha')?.task;

    // The disk state must be one of the three attempted states
    expect(['working', 'reviewing', 'done']).toContain(diskStatus);
    expect([1, 2, 3]).toContain(diskTask);

    // The disk state must be consistent (status/task must come from the same mutation)
    const statePairs = results.map((r) => ({
      status: r.agents.find((a) => a.agent_id === 'alpha')?.status,
      task: r.agents.find((a) => a.agent_id === 'alpha')?.task,
    }));
    expect(statePairs.some((p) => p.status === diskStatus && p.task === diskTask)).toBe(true);
  });

  it('releases lock when mutation throws', async () => {
    const lockPath = join(tempDir, '.ai', 'agents', 'roster.lock');

    await expect(
      withRosterMutation(tempDir, () => {
        throw new Error('Boom');
      }),
    ).rejects.toThrow('Boom');

    // Lock file must not exist after the failed mutation
    expect(() => statSync(lockPath)).toThrow();
  });

  it('recovers a stale lock and succeeds', async () => {
    const lockPath = join(tempDir, '.ai', 'agents', 'roster.lock');
    // Create a stale lock file (older than 30s by manipulating mtime)
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, created_at: '2020-01-01T00:00:00Z' }) + '\n');
    const farPast = new Date('2020-01-01T00:00:00Z');
    import('node:fs').then((fs) => fs.utimesSync(lockPath, farPast, farPast));

    // Mutation should succeed despite the stale lock
    const result = await withRosterMutation(tempDir, (roster) => {
      const entry = roster.agents.find((a) => a.agent_id === 'alpha')!;
      entry.status = 'blocked';
      return roster;
    });

    expect(result.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('blocked');
    // Lock must be released after success
    expect(() => statSync(lockPath)).toThrow();
  });

  it('leaves no temp debris after successful mutation', async () => {
    // Perform several mutations
    await withRosterMutation(tempDir, (roster) => {
      roster.agents[0]!.status = 'working';
      return roster;
    });
    await withRosterMutation(tempDir, (roster) => {
      roster.agents[0]!.status = 'done';
      return roster;
    });

    // No temp files should remain in the agents directory
    const fs = await import('node:fs');
    const agentsDir = join(tempDir, '.ai', 'agents');
    const files = fs.readdirSync(agentsDir);
    const tmpFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tmpFiles).toHaveLength(0);

    // Roster must be valid
    const disk = await loadRoster(tempDir);
    expect(disk.agents[0]!.status).toBe('done');
  });
});

describe('updateAgentRosterEntry (race-safe)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-roster-update-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists atomic writes under lock', async () => {
    const roster = await updateAgentRosterEntry(tempDir, 'alpha', {
      status: 'blocked',
      task: 123,
    });
    expect(roster.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('blocked');

    const reloaded = await loadRoster(tempDir);
    expect(reloaded.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('blocked');
  });

  it('survives rapid sequential mutations', async () => {
    await updateAgentRosterEntry(tempDir, 'alpha', { status: 'working', task: 100 });
    await updateAgentRosterEntry(tempDir, 'beta', { status: 'reviewing', task: 200 });
    await updateAgentRosterEntry(tempDir, 'alpha', { status: 'done', task: null, last_done: 100 });

    const final = await loadRoster(tempDir);
    expect(final.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('done');
    expect(final.agents.find((a) => a.agent_id === 'alpha')?.last_done).toBe(100);
    expect(final.agents.find((a) => a.agent_id === 'beta')?.status).toBe('reviewing');
    expect(final.agents.find((a) => a.agent_id === 'beta')?.task).toBe(200);
  });

  it('lock is released after a failed mutation', async () => {
    const lockPath = join(tempDir, '.ai', 'agents', 'roster.lock');

    await expect(
      updateAgentRosterEntry(tempDir, 'ghost-agent', { status: 'working', task: 999 }),
    ).rejects.toThrow('not found in roster');

    // Lock file must not exist after the failed mutation
    expect(() => statSync(lockPath)).toThrow();

    // Subsequent mutation must succeed
    const result = await updateAgentRosterEntry(tempDir, 'alpha', { status: 'working', task: 999 });
    expect(result.agents.find((a) => a.agent_id === 'alpha')?.status).toBe('working');
  });
});

describe('lintTaskFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-lint-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTask(taskNum: number, status: string, deps?: number[]) {
    const fm = [`---`, `status: ${status}`];
    if (deps) fm.push(`depends_on: [${deps.join(', ')}]`);
    fm.push(`---\n\n# Task ${taskNum}\n\nTest task.\n`);
    writeFileSync(
      join(tempDir, '.ai', 'tasks', `20260420-${taskNum}-test.md`),
      fm.join('\n'),
    );
  }

  function writeReview(name: string, reviewOf: number | null, body?: string) {
    const fm = ['---'];
    if (reviewOf !== null) fm.push(`review_of: ${reviewOf}`);
    fm.push(`---\n\n${body ?? '# Review\n\nReview of Task ' + reviewOf}\n`);
    writeFileSync(join(tempDir, '.ai', 'reviews', `${name}.md`), fm.join('\n'));
  }

  function writeDecision(name: string, closesTasks: number[], body?: string) {
    const fm = ['---'];
    if (closesTasks.length > 0) fm.push(`closes_tasks: [${closesTasks.join(', ')}]`);
    fm.push(`---\n\n${body ?? '# Closure\n\nClosing tasks.'}\n`);
    writeFileSync(join(tempDir, '.ai', 'decisions', `${name}.md`), fm.join('\n'));
  }

  it('passes for clean task graph', async () => {
    writeTask(100, 'opened');
    writeTask(101, 'opened', [100]);
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects stale review reference from front matter', async () => {
    writeTask(100, 'opened');
    writeReview('review-999', 999);
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'stale_review_reference')).toBe(true);
  });

  it('detects stale review reference from body text', async () => {
    writeTask(100, 'opened');
    writeReview('review-body', null, '# Review\n\nReview of Task 999.');
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'stale_review_reference')).toBe(true);
  });

  it('detects orphan review for in_review task', async () => {
    writeTask(100, 'in_review');
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'orphan_review')).toBe(true);
  });

  it('does not flag orphan review for opened task', async () => {
    writeTask(100, 'opened');
    const result = await lintTaskFiles(tempDir);
    expect(result.issues.some((i) => i.type === 'orphan_review')).toBe(false);
  });

  it('matches review to task via front matter', async () => {
    writeTask(100, 'in_review');
    writeReview('review-100', 100);
    const result = await lintTaskFiles(tempDir);
    expect(result.issues.some((i) => i.type === 'orphan_review')).toBe(false);
  });

  it('detects stale closure reference from front matter', async () => {
    writeTask(100, 'opened');
    writeDecision('closure-999', [999]);
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'stale_closure_reference')).toBe(true);
  });

  it('detects orphan closure for closed task', async () => {
    writeTask(100, 'closed');
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'orphan_closure')).toBe(true);
  });

  it('does not flag orphan closure for opened task', async () => {
    writeTask(100, 'opened');
    const result = await lintTaskFiles(tempDir);
    expect(result.issues.some((i) => i.type === 'orphan_closure')).toBe(false);
  });

  it('matches closure to task via front matter', async () => {
    writeTask(100, 'closed');
    writeDecision('closure-100', [100]);
    const result = await lintTaskFiles(tempDir);
    expect(result.issues.some((i) => i.type === 'orphan_closure')).toBe(false);
  });

  it('detects broken dependency', async () => {
    writeTask(100, 'opened', [999]);
    const result = await lintTaskFiles(tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === 'broken_dependency')).toBe(true);
  });
});

describe('extractTaskRefsFromBody', () => {
  it('extracts task numbers from body text', () => {
    const body = 'This depends on Task 123 and task 456.';
    expect(extractTaskRefsFromBody(body)).toEqual([123, 456]);
  });

  it('returns empty array when no refs', () => {
    expect(extractTaskRefsFromBody('No tasks here.')).toEqual([]);
  });

  it('deduplicates repeated refs', () => {
    expect(extractTaskRefsFromBody('Task 100 and Task 100')).toEqual([100]);
  });
});

describe('parseFrontMatter', () => {
  it('parses inline array syntax', () => {
    const content = '---\ndepends_on: [998, 999]\n---\n\n# Task\n';
    const { frontMatter } = parseFrontMatter(content);
    expect(frontMatter.depends_on).toEqual([998, 999]);
  });

  it('parses YAML list syntax', () => {
    const content = `---\ndepends_on:\n  - 998\n  - 999\n---\n\n# Task\n`;
    const { frontMatter } = parseFrontMatter(content);
    expect(frontMatter.depends_on).toEqual([998, 999]);
  });

  it('parses nested object syntax', () => {
    const content = `---\ncontinuation_affinity:\n  preferred_agent_id: alpha\n  affinity_strength: 0.8\n---\n\n# Task\n`;
    const { frontMatter } = parseFrontMatter(content);
    expect(frontMatter.continuation_affinity).toEqual({
      preferred_agent_id: 'alpha',
      affinity_strength: 0.8,
    });
  });

  it('round-trips YAML list through serialize', () => {
    const content = `---\ndepends_on:\n  - 998\n  - 999\nstatus: opened\n---\n\n# Task\n`;
    const parsed = parseFrontMatter(content);
    expect(parsed.frontMatter.depends_on).toEqual([998, 999]);

    const serialized = serializeFrontMatter(parsed.frontMatter, parsed.body);
    const reparsed = parseFrontMatter(serialized);
    expect(reparsed.frontMatter.depends_on).toEqual([998, 999]);
    expect(reparsed.frontMatter.status).toBe('opened');
  });

  it('round-trips mixed front matter with lists, objects, and scalars', () => {
    const content = `---\nstatus: opened\ndepends_on:\n  - 100\n  - 101\ncontinuation_affinity:\n  preferred_agent_id: alpha\n  affinity_strength: 1\ntask_id: 999\n---\n\n# Task 999\n\nBody here.\n`;
    const parsed = parseFrontMatter(content);
    expect(parsed.frontMatter.status).toBe('opened');
    expect(parsed.frontMatter.depends_on).toEqual([100, 101]);
    expect(parsed.frontMatter.continuation_affinity).toEqual({
      preferred_agent_id: 'alpha',
      affinity_strength: 1,
    });
    expect(parsed.frontMatter.task_id).toBe(999);

    // Mutate status as claim would
    parsed.frontMatter.status = 'claimed';
    const serialized = serializeFrontMatter(parsed.frontMatter, parsed.body);
    const reparsed = parseFrontMatter(serialized);
    expect(reparsed.frontMatter.status).toBe('claimed');
    expect(reparsed.frontMatter.depends_on).toEqual([100, 101]);
    expect(reparsed.frontMatter.continuation_affinity).toEqual({
      preferred_agent_id: 'alpha',
      affinity_strength: 1,
    });
    expect(reparsed.frontMatter.task_id).toBe(999);
  });
});

describe('writeTaskFile front-matter preservation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-fm-preservation-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('preserves depends_on YAML list through read/write cycle', async () => {
    const path = join(tempDir, '.ai', 'tasks', '20260420-999-test.md');
    const original = `---\nstatus: opened\ndepends_on:\n  - 998\n  - 997\nextra_field: preserved\n---\n\n# Task 999\n\nBody.\n`;
    writeFileSync(path, original);

    const { frontMatter, body } = await readTaskFile(path);
    expect(frontMatter.depends_on).toEqual([998, 997]);
    expect(frontMatter.extra_field).toBe('preserved');

    frontMatter.status = 'claimed';
    await writeTaskFile(path, frontMatter, body);

    const { frontMatter: fm2 } = await readTaskFile(path);
    expect(fm2.status).toBe('claimed');
    expect(fm2.depends_on).toEqual([998, 997]);
    expect(fm2.extra_field).toBe('preserved');
  });
});
