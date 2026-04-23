import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskGraphCommand } from '../../src/commands/task-graph.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string) {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', filename),
    `---\n${frontMatter}---\n\n# ${title}\n`,
  );
}

function writeRoster(tempDir: string, agents: Array<{ agent_id: string; task?: number | null }>) {
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({ version: 1, updated_at: new Date().toISOString(), agents }, null, 2),
  );
}

describe('task graph inspection operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-graph-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('renders mermaid for a small synthetic graph', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\ndepends_on: [100]\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('T100[');
    expect(mermaid).toContain('T101[');
    expect(mermaid).toContain('T100 --> T101');
  });

  it('emits json with explicit nodes and edges', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\ndepends_on: [100]\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: unknown[]; edges: unknown[] };
    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ from: 100, to: 101, kind: 'depends_on' });
  });

  it('renders blocked_by edges distinctly', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\nblocked_by: [100]\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;
    expect(mermaid).toContain('T100 -.->|blocked| T101');
    expect(mermaid).not.toContain('T100 --> T101');
  });

  it('filters by range', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — Beta');
    writeTask(tempDir, '20260420-102-gamma.md', 'task_id: 102\nstatus: opened\n', 'Task 102 — Gamma');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json', range: '101-102' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number }> };
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes.map((n) => n.task_number)).toEqual([101, 102]);
  });

  it('filters by status', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: claimed\n', 'Task 101 — Beta');
    writeTask(tempDir, '20260420-102-gamma.md', 'task_id: 102\nstatus: closed\n', 'Task 102 — Gamma');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json', status: 'opened,claimed' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number }> };
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes.map((n) => n.task_number)).toEqual([100, 101]);
  });

  it('shows roster assignment overlay', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — Beta');
    writeRoster(tempDir, [
      { agent_id: 'a6', task: 101 },
      { agent_id: 'a7', task: null },
    ]);

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number; assigned_agent_id: string | null }> };
    const n100 = r.nodes.find((n) => n.task_number === 100);
    const n101 = r.nodes.find((n) => n.task_number === 101);
    expect(n100?.assigned_agent_id).toBeNull();
    expect(n101?.assigned_agent_id).toBe('a6');
  });

  it('escapes quotes and brackets in mermaid labels', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — "Special" [Feature] <Test>');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;
    expect(mermaid).toContain('&quot;');
    expect(mermaid).toContain('&#91;');
    expect(mermaid).toContain('&#93;');
    expect(mermaid).toContain('&lt;');
    expect(mermaid).toContain('&gt;');
    expect(mermaid).not.toContain('"Special"');
    expect(mermaid).not.toContain('[Feature]');
  });

  it('omits closed tasks by default', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number }> };
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0].task_number).toBe(101);
  });

  it('includes closed tasks with --include-closed', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json', includeClosed: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number }> };
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes.map((n) => n.task_number)).toEqual([100, 101]);
  });

  it('includes closed dependency context when needed', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — Alpha');
    writeTask(tempDir, '20260420-101-beta.md', 'task_id: 101\nstatus: opened\ndepends_on: [100]\n', 'Task 101 — Beta');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number }>; edges: unknown[] };
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes.map((n) => n.task_number)).toEqual([100, 101]);
    expect(r.edges).toHaveLength(1);
  });

  it('does not mutate task files', async () => {
    const path = join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md');
    writeFileSync(path, '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100 — Alpha\n');
    const before = readFileSync(path, 'utf8');

    await taskGraphCommand({ cwd: tempDir, format: 'json' });

    const after = readFileSync(path, 'utf8');
    expect(after).toBe(before);
  });

  it('does not mutate roster files', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    const rosterPath = join(tempDir, '.ai', 'agents', 'roster.json');
    writeRoster(tempDir, [{ agent_id: 'a6', task: 100 }]);
    const before = readFileSync(rosterPath, 'utf8');

    await taskGraphCommand({ cwd: tempDir, format: 'json' });

    const after = readFileSync(rosterPath, 'utf8');
    expect(after).toBe(before);
  });

  it('returns empty when no tasks match filters', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — Alpha');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: unknown[]; edges: unknown[] };
    expect(r.nodes).toHaveLength(0);
    expect(r.edges).toHaveLength(0);
  });

  it('returns empty when tasks dir does not exist', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'narada-empty-'));
    const result = await taskGraphCommand({ cwd: emptyDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: unknown[]; edges: unknown[] };
    expect(r.nodes).toHaveLength(0);
    expect(r.edges).toHaveLength(0);
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('distinguishes chapter and task nodes with same number in mermaid', async () => {
    writeTask(tempDir, '20260423-522-525-chapter.md', 'status: opened\ndepends_on: []\n', 'Chapter 522–525');
    writeTask(tempDir, '20260423-522-task.md', 'task_id: 522\nstatus: opened\ndepends_on: []\n', 'Task 522');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;

    // Both nodes must appear with distinct IDs
    expect(mermaid).toContain('C522[');
    expect(mermaid).toContain('T522[');
    // No duplicate declarations
    const c522Matches = mermaid.match(/C522\[/g);
    const t522Matches = mermaid.match(/T522\[/g);
    expect(c522Matches?.length).toBe(1);
    expect(t522Matches?.length).toBe(1);
  });

  it('distinguishes chapter and task nodes in json output', async () => {
    writeTask(tempDir, '20260423-522-525-chapter.md', 'status: opened\ndepends_on: []\n', 'Chapter 522–525');
    writeTask(tempDir, '20260423-522-task.md', 'task_id: 522\nstatus: opened\ndepends_on: []\n', 'Task 522');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { nodes: Array<{ task_number: number; kind: string }> };

    expect(r.nodes).toHaveLength(2);
    const chapterNode = r.nodes.find((n) => n.kind === 'chapter');
    const taskNode = r.nodes.find((n) => n.kind === 'task');
    expect(chapterNode).toBeDefined();
    expect(taskNode).toBeDefined();
    expect(chapterNode!.task_number).toBe(522);
    expect(taskNode!.task_number).toBe(522);
  });

  it('renders chapter dependencies with correct edge targets', async () => {
    writeTask(tempDir, '20260423-520-alpha.md', 'task_id: 520\nstatus: opened\ndepends_on: []\n', 'Task 520');
    writeTask(tempDir, '20260423-522-525-chapter.md', 'status: opened\ndepends_on: [520]\n', 'Chapter 522–525');
    writeTask(tempDir, '20260423-522-task.md', 'task_id: 522\nstatus: opened\ndepends_on: [520]\n', 'Task 522');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;

    // Chapter depends on task 520
    expect(mermaid).toContain('T520 --> C522');
    // Task 522 depends on task 520
    expect(mermaid).toContain('T520 --> T522');
    // Chapter and task are distinct nodes
    expect(mermaid).toContain('C522[');
    expect(mermaid).toContain('T522[');
  });

  it('prefers task node over chapter for dependency edges when both exist', async () => {
    writeTask(tempDir, '20260423-522-525-chapter.md', 'status: opened\ndepends_on: []\n', 'Chapter 522–525');
    writeTask(tempDir, '20260423-522-task.md', 'task_id: 522\nstatus: opened\ndepends_on: []\n', 'Task 522');
    writeTask(tempDir, '20260423-523-other.md', 'task_id: 523\nstatus: opened\ndepends_on: [522]\n', 'Task 523');

    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const mermaid = (result.result as { mermaid: string }).mermaid;

    // Edge from 523 should point to task 522, not chapter 522
    expect(mermaid).toContain('T522 --> T523');
    expect(mermaid).not.toContain('C522 --> T523');
  });
});
