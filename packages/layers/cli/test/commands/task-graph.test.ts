import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskGraphCommand } from '../../src/commands/task-graph.js';
import { observationInspectCommand } from '../../src/commands/observation.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string) {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', filename),
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

  it('bounded graph output creates an observation artifact instead of dumping mermaid', async () => {
    writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');
    const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid', bounded: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { mermaid?: string; observation: { artifact_id: string; artifact_uri: string; summary: { node_count: number } } };
    expect(r.mermaid).toBeUndefined();
    expect(r.observation.summary.node_count).toBe(1);
    expect(statSync(join(tempDir, r.observation.artifact_uri)).isFile()).toBe(true);
    const inspected = await observationInspectCommand({
      artifactId: r.observation.artifact_id,
      cwd: tempDir,
      content: true,
      format: 'json',
    });
    expect(inspected.exitCode).toBe(ExitCode.SUCCESS);
    expect((inspected.result as { artifact: { content: string } }).artifact.content).toContain('flowchart TD');
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
    const path = join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-alpha.md');
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

  // --view operator path tests
  describe('operator viewing path (--view)', () => {
    const withNoBrowser = async <T>(fn: () => Promise<T>): Promise<T> => {
      const original = process.env.NARADA_NO_BROWSER;
      process.env.NARADA_NO_BROWSER = '1';
      try {
        return await fn();
      } finally {
        if (original === undefined) delete process.env.NARADA_NO_BROWSER;
        else process.env.NARADA_NO_BROWSER = original;
      }
    };

    it('creates .mmd and .html artifacts with --view', async () => {
      writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');

      const result = await withNoBrowser(() => taskGraphCommand({ cwd: tempDir, view: true }));
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const r = result.result as {
        status: string;
        view: boolean;
        opened: boolean;
        artifact_dir: string;
        mermaid_path: string;
        html_path: string;
      };
      expect(r.status).toBe('success');
      expect(r.view).toBe(true);
      expect(r.opened).toBe(false);
      expect(r.artifact_dir).toContain('narada-task-graph-');

      expect(statSync(r.mermaid_path).isFile()).toBe(true);
      expect(statSync(r.html_path).isFile()).toBe(true);

      const mmd = readFileSync(r.mermaid_path, 'utf8');
      expect(mmd).toContain('flowchart TD');
      expect(mmd).toContain('T100[');

      const html = readFileSync(r.html_path, 'utf8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('mermaid@10');

      rmSync(r.artifact_dir, { recursive: true, force: true });
    });

    it('creates artifacts without opening when open=false', async () => {
      writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');

      const result = await taskGraphCommand({ cwd: tempDir, view: true, open: false });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const r = result.result as {
        status: string;
        view: boolean;
        opened: boolean;
        artifact_dir: string;
      };
      expect(r.view).toBe(true);
      expect(r.opened).toBe(false);
      expect(r.message).toContain('Artifacts written to');

      rmSync(r.artifact_dir, { recursive: true, force: true });
    });

    it('still allows raw mermaid output when --view is not set', async () => {
      writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');

      const result = await taskGraphCommand({ cwd: tempDir, format: 'mermaid' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const r = result.result as { status: string; mermaid: string };
      expect(r.status).toBe('success');
      expect(r.mermaid).toContain('flowchart TD');
      expect(r.mermaid).toContain('T100[');
      // No artifact fields when not using --view
      expect(r).not.toHaveProperty('artifact_dir');
    });

    it('still allows json output when --view is not set', async () => {
      writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — Alpha');

      const result = await taskGraphCommand({ cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const r = result.result as { status: string; nodes: unknown[] };
      expect(r.status).toBe('success');
      expect(r.nodes).toHaveLength(1);
      expect(r).not.toHaveProperty('artifact_dir');
    });

    it('returns empty artifacts for empty graph with --view', async () => {
      writeTask(tempDir, '20260420-100-alpha.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — Alpha');

      const result = await withNoBrowser(() => taskGraphCommand({ cwd: tempDir, view: true }));
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const r = result.result as {
        status: string;
        view: boolean;
        opened: boolean;
        artifact_dir: string;
      };
      expect(r.view).toBe(true);
      expect(r.opened).toBe(false);
      expect(statSync(r.artifact_dir).isDirectory()).toBe(true);

      rmSync(r.artifact_dir, { recursive: true, force: true });
    });
  });
});
