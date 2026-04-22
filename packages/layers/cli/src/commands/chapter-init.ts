/**
 * Chapter init operator.
 *
 * Creates a self-standing chapter skeleton (range file + child task files)
 * without task-number collisions.
 */

import { resolve, join } from 'node:path';
import { readdir, access } from 'node:fs/promises';
import { atomicWriteFile } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface ChapterInitOptions {
  slug: string;
  title?: string;
  from?: number;
  count?: number;
  dependsOn?: string | number[];
  dryRun?: boolean;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

function isFilesystemSafeSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  // Allow lowercase letters, digits, hyphens, and underscores only
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function parseDependsOn(input: unknown): number[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') return [input];
  if (typeof input === 'string') {
    const vals = input.split(',').map((s) => s.trim()).filter(Boolean);
    return vals.length > 0 ? vals.map((v) => Number(v)).filter((n) => !Number.isNaN(n)) : undefined;
  }
  if (Array.isArray(input)) {
    const out: number[] = [];
    for (const v of input) {
      if (typeof v === 'number') {
        out.push(v);
      } else if (typeof v === 'string') {
        for (const s of v.split(',').map((x) => x.trim()).filter(Boolean)) {
          const n = Number(s);
          if (!Number.isNaN(n)) out.push(n);
        }
      }
    }
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

function formatDatePrefix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function extractTaskNumbersFromFileName(fileName: string): number[] {
  const base = fileName.replace(/\.md$/, '');
  const numbers: number[] = [];
  const re = /-(\d+)-/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    numbers.push(Number(m[1]));
  }
  // Also check for simple numeric filenames
  const simple = Number(base);
  if (!Number.isNaN(simple)) numbers.push(simple);
  return numbers;
}

function buildRangeFileBody(options: {
  title: string;
  slug: string;
  from: number;
  to: number;
  dependsOn: number[];
}): string {
  const { title, slug, from, to, dependsOn } = options;
  const tasks: Array<{ num: number; name: string }> = [];
  for (let i = 0; i < to - from + 1; i++) {
    tasks.push({ num: from + i, name: `${slug}-${i + 1}` });
  }

  const mermaidNodes = tasks
    .map((t) => `  T${t.num}["${t.num} ${t.name}"]`)
    .join('\n');

  const mermaidEdges: string[] = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    mermaidEdges.push(`  T${tasks[i].num} --> T${tasks[i + 1].num}`);
  }

  const taskTableRows = tasks
    .map((t, idx) => `| ${idx + 1} | ${t.num} | ${t.name} | TBD |`)
    .join('\n');

  const cccCoordinates = [
    'semantic_resolution',
    'invariant_preservation',
    'constructive_executability',
    'grounded_universalization',
    'authority_reviewability',
    'teleological_pressure',
  ];

  const cccRows = cccCoordinates
    .map((c) => `| ${c} | 0 | 0 | TBD | TBD |`)
    .join('\n');

  return `---
status: opened
depends_on: [${dependsOn.join(', ')}]
---

# ${title}

## Goal

<!-- Goal placeholder -->

## DAG

\`\`\`mermaid
flowchart TD
${mermaidNodes}

${mermaidEdges.join('\n')}
\`\`\`

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
${taskTableRows}

## CCC Posture

| Coordinate | Evidenced State | Projected State If Chapter Verifies | Pressure Path | Evidence Required |
|------------|-----------------|-------------------------------------|---------------|-------------------|
${cccRows}

## Deferred Work

| Deferred Capability | Rationale |
|---------------------|-----------|
| **TBD** | TBD |

## Closure Criteria

- [ ] All tasks in this chapter are closed or confirmed.
- [ ] Semantic drift check passes.
- [ ] Gap table produced.
- [ ] CCC posture recorded.
`;
}

function buildChildTaskBody(options: {
  num: number;
  title: string;
  slug: string;
  index: number;
  dependsOn: number[];
}): string {
  const { num, title, dependsOn } = options;
  const deps = dependsOn.length > 0 ? `[${dependsOn.join(', ')}]` : '[]';

  return `---
status: opened
depends_on: ${deps}
---

# Task ${num} — ${title}

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- TBD

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Acceptance Criteria

- [ ] TBD
`;
}

export async function chapterInitCommand(
  options: ChapterInitOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const slug = options.slug;
  const title = options.title;
  const from = options.from;
  const count = options.count;
  const dependsOn = parseDependsOn(options.dependsOn) ?? [];
  const dryRun = options.dryRun ?? false;

  // ── Validation ──

  if (!isFilesystemSafeSlug(slug)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid slug "${slug}". Slug must be non-empty, lowercase, alphanumeric with hyphens only.` },
    };
  }

  if (!title || title.trim().length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Title is required (--title).' },
    };
  }

  if (from === undefined || from === null || !Number.isInteger(from) || from < 1) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--from must be a positive integer.' },
    };
  }

  if (count === undefined || count === null || !Number.isInteger(count) || count < 1) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--count must be an integer >= 1.' },
    };
  }

  const to = from + count - 1;
  const datePrefix = formatDatePrefix();
  const tasksDir = join(cwd, '.ai', 'tasks');

  // ── Range file existence check ──

  const rangeFileName = `${datePrefix}-${from}-${to}-${slug}.md`;
  const rangeFilePath = join(tasksDir, rangeFileName);
  try {
    await access(rangeFilePath);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Range file already exists: ${rangeFilePath}` },
    };
  } catch {
    // File does not exist — safe to proceed
  }

  // ── Collision checks ──

  let existingFiles: string[] = [];
  try {
    existingFiles = await readdir(tasksDir);
  } catch {
    // Directory may not exist; that's fine, no collisions possible
  }

  const existingNumbers = new Set<number>();
  for (const f of existingFiles) {
    for (const n of extractTaskNumbersFromFileName(f)) {
      existingNumbers.add(n);
    }
  }

  const colliding: number[] = [];
  for (let n = from; n <= to; n++) {
    if (existingNumbers.has(n)) {
      colliding.push(n);
    }
  }

  if (colliding.length > 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task number collision: ${colliding.join(', ')} already exist(s).` },
    };
  }

  // ── Build artifacts ──

  const files: Array<{ path: string; label: string }> = [];

  files.push({ path: rangeFilePath, label: 'range' });

  const childTaskPaths: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = from + i;
    const childFileName = `${datePrefix}-${num}-${slug}-${i + 1}.md`;
    const childPath = join(tasksDir, childFileName);
    childTaskPaths.push(childPath);
    files.push({ path: childPath, label: 'child' });
  }

  if (dryRun) {
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'dry_run',
          slug,
          title,
          from,
          to,
          count,
          depends_on: dependsOn,
          files: files.map((f) => f.path),
        },
      };
    }

    fmt.message(`Dry run: would create ${files.length} file(s) for chapter "${title}"`, 'info');
    for (const f of files) {
      fmt.message(`  [${f.label}] ${f.path}`, 'info');
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'dry_run',
        slug,
        title,
        from,
        to,
        count,
        depends_on: dependsOn,
        files: files.map((f) => f.path),
      },
    };
  }

  // ── Ensure tasks directory exists ──

  try {
    await access(tasksDir);
  } catch {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(tasksDir, { recursive: true });
  }

  // ── Write files ──

  const rangeBody = buildRangeFileBody({ title, slug, from, to, dependsOn });
  await atomicWriteFile(rangeFilePath, rangeBody);

  for (let i = 0; i < count; i++) {
    const num = from + i;
    const childBody = buildChildTaskBody({ num, title: `${title} — Task ${i + 1}`, slug, index: i + 1, dependsOn });
    await atomicWriteFile(childTaskPaths[i]!, childBody);
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        slug,
        title,
        from,
        to,
        count,
        depends_on: dependsOn,
        files: files.map((f) => f.path),
      },
    };
  }

  fmt.message(`Created chapter "${title}"`, 'success');
  fmt.kv('Slug', slug);
  fmt.kv('Tasks', `${from}–${to} (${count})`);
  for (const f of files) {
    fmt.message(`  [${f.label}] ${f.path}`, 'info');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      slug,
      title,
      from,
      to,
      count,
      depends_on: dependsOn,
      files: files.map((f) => f.path),
    },
  };
}
