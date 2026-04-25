import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chapterInitCommand } from '../../src/commands/chapter-init.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('chapter init operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-init-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a range file and child files', async () => {
    const result = await chapterInitCommand({
      slug: 'test-chapter',
      title: 'Test Chapter',
      from: 500,
      count: 3,
      dependsOn: [499],
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as {
      status: string;
      slug: string;
      from: number;
      to: number;
      files: string[];
    };
    expect(r.status).toBe('success');
    expect(r.from).toBe(500);
    expect(r.to).toBe(502);
    expect(r.files).toHaveLength(4);

    for (const f of r.files) {
      expect(existsSync(f)).toBe(true);
    }

    // Range file should contain required sections
    const rangePath = r.files.find((f) => f.includes('500-502'));
    expect(rangePath).toBeDefined();
    const rangeContent = readFileSync(rangePath!, 'utf8');
    expect(rangeContent).toContain('status: opened');
    expect(rangeContent).toContain('depends_on: [499]');
    expect(rangeContent).toContain('# Test Chapter');
    expect(rangeContent).toContain('## Goal');
    expect(rangeContent).toContain('```mermaid');
    expect(rangeContent).toContain('flowchart TD');
    expect(rangeContent).toContain('## CCC Posture');
    expect(rangeContent).toContain('## Deferred Work');
    expect(rangeContent).toContain('## Closure Criteria');
    expect(rangeContent).toContain('## Active Tasks');

    // Child files should be self-standing
    const childPaths = r.files.filter((f) => !f.includes('500-502'));
    expect(childPaths).toHaveLength(3);

    for (const cp of childPaths) {
      const content = readFileSync(cp, 'utf8');
      expect(content).toContain('status: opened');
      expect(content).toContain('## Execution Mode');
      expect(content).toContain('## Assignment');
      expect(content).toContain('## Required Reading');
      expect(content).toContain('## Context');
      expect(content).toContain('## Required Work');
      expect(content).toContain('## Non-Goals');
      expect(content).toContain('## Execution Notes');
      expect(content).toContain('## Verification');
      expect(content).toContain('## Acceptance Criteria');
    }
  });

  it('refuses empty slug', async () => {
    const result = await chapterInitCommand({
      slug: '',
      title: 'Test',
      from: 1,
      count: 1,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid slug');
  });

  it('refuses non-filesystem-safe slug', async () => {
    const result = await chapterInitCommand({
      slug: 'Bad Slug!',
      title: 'Test',
      from: 1,
      count: 1,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid slug');
  });

  it('refuses missing title', async () => {
    const result = await chapterInitCommand({
      slug: 'test',
      from: 1,
      count: 1,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Title is required');
  });

  it('refuses non-positive from', async () => {
    const result = await chapterInitCommand({
      slug: 'test',
      title: 'Test',
      from: 0,
      count: 1,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--from must be a positive integer');
  });

  it('refuses count less than 1', async () => {
    const result = await chapterInitCommand({
      slug: 'test',
      title: 'Test',
      from: 1,
      count: 0,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--count must be an integer >= 1');
  });

  it('refuses task number collisions', async () => {
    // Seed an existing task with number 600
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-600-existing.md'),
      '---\ntask_id: 600\nstatus: opened\n---\n\n# Task 600\n',
    );

    const result = await chapterInitCommand({
      slug: 'collision-test',
      title: 'Collision Test',
      from: 599,
      count: 3,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { error: string };
    expect(r.error).toContain('Task number collision');
    expect(r.error).toContain('600');
  });

  it('dry-run writes nothing', async () => {
    const beforeFiles = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));

    const result = await chapterInitCommand({
      slug: 'dry-run-test',
      title: 'Dry Run Test',
      from: 700,
      count: 2,
      dryRun: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; files: string[] };
    expect(r.status).toBe('dry_run');
    expect(r.files).toHaveLength(3);

    const afterFiles = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));
    expect(afterFiles).toEqual(beforeFiles);
  });

  it('generated range file contains plain Mermaid and CCC table', async () => {
    const result = await chapterInitCommand({
      slug: 'mermaid-test',
      title: 'Mermaid Test',
      from: 800,
      count: 2,
      dependsOn: [799],
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { files: string[] };
    const rangePath = r.files.find((f) => f.includes('800-801'));
    expect(rangePath).toBeDefined();
    const content = readFileSync(rangePath!, 'utf8');

    // Plain Mermaid (no classes or styling)
    expect(content).toMatch(/```mermaid\nflowchart TD/);
    expect(content).not.toMatch(/classDef/);
    expect(content).not.toMatch(/class\s/);
    expect(content).not.toMatch(/:::/);

    // CCC posture table with evidenced/projected columns
    expect(content).toContain('| Coordinate | Evidenced State | Projected State If Chapter Verifies | Pressure Path | Evidence Required |');
    expect(content).toContain('| semantic_resolution | 0 | 0 | TBD | TBD |');
  });

  it('generated child tasks contain required self-standing sections', async () => {
    const result = await chapterInitCommand({
      slug: 'standing-test',
      title: 'Standing Test',
      from: 900,
      count: 1,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { files: string[] };
    const childPath = r.files.find((f) => f.includes('900-standing-test-1'));
    expect(childPath).toBeDefined();
    const content = readFileSync(childPath!, 'utf8');

    expect(content).toContain('status: opened');
    expect(content).toContain('## Execution Mode');
    expect(content).toContain('## Assignment');
    expect(content).toContain('## Required Reading');
    expect(content).toContain('## Context');
    expect(content).toContain('## Required Work');
    expect(content).toContain('## Non-Goals');
    expect(content).toContain('## Acceptance Criteria');
  });

  it('refuses when range file already exists', async () => {
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rangeFileName = `${datePrefix}-1000-1002-exists-test.md`;
    writeFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', rangeFileName), '---\nstatus: opened\n---\n');

    const result = await chapterInitCommand({
      slug: 'exists-test',
      title: 'Exists Test',
      from: 1000,
      count: 3,
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Range file already exists');
  });
});
