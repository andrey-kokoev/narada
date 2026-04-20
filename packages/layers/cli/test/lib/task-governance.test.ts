import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { atomicWriteFile, isValidTransition, checkDependencies, parseFrontMatter, serializeFrontMatter, extractChapter, scanTasksByChapter, computeTaskAffinity, listRunnableTasks } from '../../src/lib/task-governance.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('task-governance utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-governance-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('atomicWriteFile writes data that can be read back', async () => {
    const targetPath = join(tempDir, 'target.txt');
    await atomicWriteFile(targetPath, 'hello world');

    expect(readFileSync(targetPath, 'utf8')).toBe('hello world');
  });

  it('atomicWriteFile leaves no temp file behind', async () => {
    const targetPath = join(tempDir, 'target.txt');
    await atomicWriteFile(targetPath, 'hello world');

    const files = Array.from({ length: 100 }, (_, i) => i).map(() => {
      try {
        return readFileSync(targetPath, 'utf8');
      } catch {
        return null;
      }
    });
    expect(files.filter(Boolean)).toHaveLength(100);

    // No .tmp-* files should remain
    const dirEntries = require('node:fs').readdirSync(tempDir);
    expect(dirEntries).toHaveLength(1);
    expect(dirEntries[0]).toBe('target.txt');
  });

  it('atomicWriteFile overwrites existing file', async () => {
    const targetPath = join(tempDir, 'target.txt');
    writeFileSync(targetPath, 'old content');

    await atomicWriteFile(targetPath, 'new content');

    expect(readFileSync(targetPath, 'utf8')).toBe('new content');
  });
});

describe('transition validation', () => {
  it('allows valid transitions', () => {
    expect(isValidTransition('opened', 'claimed')).toBe(true);
    expect(isValidTransition('claimed', 'in_review')).toBe(true);
    expect(isValidTransition('claimed', 'needs_continuation')).toBe(true);
    expect(isValidTransition('in_review', 'closed')).toBe(true);
    expect(isValidTransition('in_review', 'opened')).toBe(true);
    expect(isValidTransition('closed', 'confirmed')).toBe(true);
    expect(isValidTransition('needs_continuation', 'claimed')).toBe(true);
  });

  it('forbids invalid transitions', () => {
    expect(isValidTransition('opened', 'closed')).toBe(false);
    expect(isValidTransition('claimed', 'confirmed')).toBe(false);
    expect(isValidTransition('draft', 'closed')).toBe(false);
    expect(isValidTransition('confirmed', 'opened')).toBe(false);
  });

  it('forbids transitions from unknown status', () => {
    expect(isValidTransition('garbage', 'opened')).toBe(false);
    expect(isValidTransition(undefined, 'opened')).toBe(false);
  });
});

describe('dependency checking', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-deps-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty when no dependencies', async () => {
    const result = await checkDependencies(tempDir, undefined);
    expect(result.blockedBy).toHaveLength(0);
  });

  it('blocks when dependency is opened', async () => {
    writeFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-dep.md'), '---\nstatus: opened\n---\n\n# Dep\n');
    const result = await checkDependencies(tempDir, [100]);
    expect(result.blockedBy).toHaveLength(1);
    expect(result.blockedBy[0]).toContain('20260420-100-dep');
  });

  it('passes when dependency is closed', async () => {
    writeFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-dep.md'), '---\nstatus: closed\n---\n\n# Dep\n');
    const result = await checkDependencies(tempDir, [100]);
    expect(result.blockedBy).toHaveLength(0);
  });

  it('passes when dependency is confirmed', async () => {
    writeFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-dep.md'), '---\nstatus: confirmed\n---\n\n# Dep\n');
    const result = await checkDependencies(tempDir, [100]);
    expect(result.blockedBy).toHaveLength(0);
  });

  it('blocks when dependency is in_review', async () => {
    writeFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-dep.md'), '---\nstatus: in_review\n---\n\n# Dep\n');
    const result = await checkDependencies(tempDir, [100]);
    expect(result.blockedBy).toHaveLength(1);
  });
});

describe('front matter parsing', () => {
  it('parses depends_on array', () => {
    const content = '---\ntask_id: 261\nstatus: opened\ndepends_on: [259, 260]\n---\n\n# Task\n';
    const { frontMatter } = parseFrontMatter(content);
    expect(frontMatter.task_id).toBe(261);
    expect(frontMatter.status).toBe('opened');
    expect(frontMatter.depends_on).toEqual([259, 260]);
  });

  it('returns empty front matter when none present', () => {
    const content = '# Task\n\nNo front matter.\n';
    const { frontMatter, body } = parseFrontMatter(content);
    expect(Object.keys(frontMatter)).toHaveLength(0);
    expect(body).toBe(content);
  });

  it('parses nested continuation_affinity', () => {
    const content = `---\ntask_id: 263\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: kimicli\n  affinity_strength: 2\n  affinity_reason: Completed prerequisite\n---\n\n# Task 263\n`;
    const { frontMatter } = parseFrontMatter(content);
    expect(frontMatter.task_id).toBe(263);
    expect(frontMatter.continuation_affinity).toEqual({
      preferred_agent_id: 'kimicli',
      affinity_strength: 2,
      affinity_reason: 'Completed prerequisite',
    });
  });

  it('serializes nested continuation_affinity', () => {
    const frontMatter = {
      task_id: 263,
      status: 'opened',
      continuation_affinity: {
        preferred_agent_id: 'kimicli',
        affinity_strength: 2,
        affinity_reason: 'Completed prerequisite',
      },
    };
    const body = '# Task 263\n';
    const serialized = serializeFrontMatter(frontMatter, body);
    expect(serialized).toContain('continuation_affinity:');
    expect(serialized).toContain('  preferred_agent_id: kimicli');
    expect(serialized).toContain('  affinity_strength: 2');
    expect(serialized).toContain('  affinity_reason: Completed prerequisite');

    // Round-trip
    const { frontMatter: parsed } = parseFrontMatter(serialized);
    expect(parsed.continuation_affinity).toEqual(frontMatter.continuation_affinity);
  });
});

describe('chapter scanning', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts chapter from body', () => {
    const body = '# Task\n\n## Chapter\n\nMulti-Agent Task Governance\n\n## Context\n';
    expect(extractChapter(body)).toBe('Multi-Agent Task Governance');
  });

  it('returns null when no chapter section', () => {
    expect(extractChapter('# Task\n\nNo chapter here')).toBeNull();
  });

  it('scans tasks by chapter', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: opened\n---\n\n# Task 261\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 262\nstatus: opened\n---\n\n# Task 262\n\n## Chapter\n\nOther Chapter\n',
    );

    const tasks = await scanTasksByChapter(tempDir, 'Test Chapter');
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.taskNumber)).toContain(260);
    expect(tasks.map((t) => t.taskNumber)).toContain(261);
  });
});

describe('affinity computation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-affinity-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns manual affinity when present in task file', async () => {
    const task: import('../../src/lib/task-governance.js').ChapterTaskInfo = {
      taskId: '20260420-263-test',
      taskNumber: 263,
      status: 'opened',
      fileName: '20260420-263-test.md',
      dependsOn: [260],
      continuationAffinity: { preferred_agent_id: 'kimicli', affinity_strength: 3, affinity_reason: 'Manual' },
    };
    const allTasks = new Map<number, import('../../src/lib/task-governance.js').ChapterTaskInfo>();
    const result = await computeTaskAffinity(tempDir, task, allTasks);
    expect(result.source).toBe('manual');
    expect(result.preferred_agent_id).toBe('kimicli');
    expect(result.affinity_strength).toBe(3);
  });

  it('computes history affinity from completed dependency assignments', async () => {
    // Create dependency task with completed assignment
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-dep.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', 'assignments', '20260420-260-dep.json'),
      JSON.stringify({
        task_id: '20260420-260-dep',
        assignments: [
          { agent_id: 'agent-a', claimed_at: '2026-01-01T00:00:00Z', claim_context: null, released_at: '2026-01-02T00:00:00Z', release_reason: 'completed' },
        ],
      }),
    );

    const depTask: import('../../src/lib/task-governance.js').ChapterTaskInfo = {
      taskId: '20260420-260-dep',
      taskNumber: 260,
      status: 'closed',
      fileName: '20260420-260-dep.md',
      dependsOn: undefined,
      continuationAffinity: undefined,
    };

    const task: import('../../src/lib/task-governance.js').ChapterTaskInfo = {
      taskId: '20260420-263-test',
      taskNumber: 263,
      status: 'opened',
      fileName: '20260420-263-test.md',
      dependsOn: [260],
      continuationAffinity: undefined,
    };

    const allTasks = new Map<number, import('../../src/lib/task-governance.js').ChapterTaskInfo>();
    allTasks.set(260, depTask);

    const result = await computeTaskAffinity(tempDir, task, allTasks);
    expect(result.source).toBe('history');
    expect(result.preferred_agent_id).toBe('agent-a');
    expect(result.affinity_strength).toBe(1);
  });

  it('returns none when no affinity sources exist', async () => {
    const task: import('../../src/lib/task-governance.js').ChapterTaskInfo = {
      taskId: '20260420-263-test',
      taskNumber: 263,
      status: 'opened',
      fileName: '20260420-263-test.md',
      dependsOn: undefined,
      continuationAffinity: undefined,
    };
    const allTasks = new Map<number, import('../../src/lib/task-governance.js').ChapterTaskInfo>();
    const result = await computeTaskAffinity(tempDir, task, allTasks);
    expect(result.source).toBe('none');
    expect(result.preferred_agent_id).toBeNull();
    expect(result.affinity_strength).toBe(0);
  });
});

describe('list runnable tasks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-list-test-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists runnable tasks sorted by affinity', async () => {
    // Task 260: opened, manual affinity strength 2
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: agent-a\n  affinity_strength: 2\n---\n\n# Task 260\n',
    );
    // Task 261: opened, no affinity
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: opened\n---\n\n# Task 261\n',
    );
    // Task 262: closed (not runnable)
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 262\nstatus: closed\n---\n\n# Task 262\n',
    );

    const tasks = await listRunnableTasks(tempDir);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].taskNumber).toBe(260);
    expect(tasks[0].affinity.affinity_strength).toBe(2);
    expect(tasks[1].taskNumber).toBe(261);
    expect(tasks[1].affinity.affinity_strength).toBe(0);
  });
});
