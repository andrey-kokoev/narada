/**
 * Chapter init operator.
 *
 * Creates a self-standing chapter skeleton (range file + child task files)
 * without task-number collisions.
 */

import { resolve, join } from 'node:path';
import { readdir, access, readFile } from 'node:fs/promises';
import { atomicWriteFile } from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { attachFormattedOutput } from '../lib/cli-output.js';

export interface ChapterInitOptions {
  slug: string;
  title?: string;
  from?: number;
  count?: number;
  dependsOn?: string | number[];
  tasksFile?: string;
  dryRun?: boolean;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

export interface ChapterValidateTasksFileOptions {
  path: string;
  count?: number;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

interface ChapterTaskSpec {
  title: string;
  goal: string;
  context?: string;
  required_work?: string[] | string;
  requiredWork?: string[] | string;
  acceptance_criteria?: string[];
  acceptanceCriteria?: string[];
  non_goals?: string[] | string;
  nonGoals?: string[] | string;
  required_reading?: string[];
  requiredReading?: string[];
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

function listBlock(value: string[] | string | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((line, idx) => `${idx + 1}. ${line}`).join('\n') : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return fallback;
}

function bulletBlock(value: string[] | string | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((line) => `- ${line}`).join('\n') : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return fallback;
}

function criteriaBlock(value: string[] | undefined): string {
  if (!value || value.length === 0) return '- [ ] TBD';
  return value.map((line) => `- [ ] ${line}`).join('\n');
}

function formatChapterInitSummary(options: {
  status: 'success' | 'dry_run';
  title: string;
  slug: string;
  from: number;
  to: number;
  count: number;
  files: Array<{ path: string; label: string }>;
}): string {
  const { status, title, slug, from, to, count, files } = options;
  const lines = status === 'dry_run'
    ? [`Dry run: would create ${files.length} file(s) for chapter "${title}"`]
    : [`Created chapter "${title}"`];
  lines.push(`Slug: ${slug}`);
  lines.push(`Tasks: ${from}-${to} (${count})`);
  for (const f of files) {
    lines.push(`  [${f.label}] ${f.path}`);
  }
  return lines.join('\n');
}

function normalizeTaskSpecs(input: unknown, count: number): ChapterTaskSpec[] | null {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) {
    throw new Error('--tasks-file must contain a JSON array of task specifications.');
  }
  if (input.length !== count) {
    throw new Error(`--tasks-file contains ${input.length} task spec(s), but --count is ${count}.`);
  }
  return input.map((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`tasks[${idx}] must be an object.`);
    }
    const spec = item as Record<string, unknown>;
    if (typeof spec.title !== 'string' || spec.title.trim().length === 0) {
      throw new Error(`tasks[${idx}].title is required.`);
    }
    if (typeof spec.goal !== 'string' || spec.goal.trim().length === 0) {
      throw new Error(`tasks[${idx}].goal is required.`);
    }
    const acceptanceCriteria = spec.acceptance_criteria ?? spec.acceptanceCriteria;
    if (acceptanceCriteria !== undefined && (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.some((v) => typeof v !== 'string'))) {
      throw new Error(`tasks[${idx}].acceptance_criteria must be an array of strings.`);
    }
    return {
      title: spec.title.trim(),
      goal: spec.goal.trim(),
      context: typeof spec.context === 'string' ? spec.context.trim() : undefined,
      required_work: (spec.required_work ?? spec.requiredWork) as string[] | string | undefined,
      acceptance_criteria: acceptanceCriteria as string[] | undefined,
      non_goals: (spec.non_goals ?? spec.nonGoals) as string[] | string | undefined,
      required_reading: (spec.required_reading ?? spec.requiredReading) as string[] | undefined,
    };
  });
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
  taskSpecs?: ChapterTaskSpec[] | null;
}): string {
  const { title, slug, from, to, dependsOn, taskSpecs } = options;
  const tasks: Array<{ num: number; name: string }> = [];
  for (let i = 0; i < to - from + 1; i++) {
    tasks.push({ num: from + i, name: taskSpecs?.[i]?.title ?? `${slug}-${i + 1}` });
  }

  const mermaidNodes = tasks
    .map((t) => `  T${t.num}["${t.num} ${t.name}"]`)
    .join('\n');

  const mermaidEdges: string[] = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    mermaidEdges.push(`  T${tasks[i].num} --> T${tasks[i + 1].num}`);
  }

  const taskTableRows = tasks
    .map((t, idx) => `| ${idx + 1} | ${t.num} | ${t.name} | ${taskSpecs?.[idx]?.goal ?? 'TBD'} |`)
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
  taskSpec?: ChapterTaskSpec;
}): string {
  const { num, title, dependsOn, taskSpec } = options;
  const deps = dependsOn.length > 0 ? `[${dependsOn.join(', ')}]` : '[]';
  const resolvedTitle = taskSpec?.title ?? title;
  const requiredReading = bulletBlock(taskSpec?.required_reading ?? taskSpec?.requiredReading, '- TBD');
  const context = taskSpec?.context ?? '<!-- Context placeholder -->';
  const requiredWork = listBlock(taskSpec?.required_work, '1. TBD');
  const nonGoals = bulletBlock(
    taskSpec?.non_goals ?? taskSpec?.nonGoals,
    '- Do not expand scope beyond this task.\n- Do not create derivative task-status files.\n- Do not mutate live external systems unless explicitly authorized.',
  );
  const acceptanceCriteria = criteriaBlock(taskSpec?.acceptance_criteria ?? taskSpec?.acceptanceCriteria);

  return `---
status: opened
depends_on: ${deps}
---

# Task ${num} — ${resolvedTitle}

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

${requiredReading}

## Context

${context}

## Goal

${taskSpec?.goal ?? '<!-- Goal placeholder -->'}

## Required Work

${requiredWork}

## Non-Goals

${nonGoals}

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

${acceptanceCriteria}
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
  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  let taskSpecs: ChapterTaskSpec[] | null = null;
  if (options.tasksFile) {
    try {
      const raw = await readFile(resolve(cwd, options.tasksFile), 'utf8');
      taskSpecs = normalizeTaskSpecs(JSON.parse(raw), count);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to read --tasks-file: ${msg}` },
      };
    }
  }

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
    const result = {
      status: 'dry_run' as const,
      slug,
      title,
      from,
      to,
      count,
      depends_on: dependsOn,
      task_specs: taskSpecs ? taskSpecs.length : 0,
      files: files.map((f) => f.path),
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: attachFormattedOutput(
        result,
        formatChapterInitSummary({ status: 'dry_run', title, slug, from, to, count, files }),
        fmt.getFormat(),
      ),
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

  const rangeBody = buildRangeFileBody({ title, slug, from, to, dependsOn, taskSpecs });
  await atomicWriteFile(rangeFilePath, rangeBody);

  for (let i = 0; i < count; i++) {
    const num = from + i;
    const childBody = buildChildTaskBody({ num, title: `${title} — Task ${i + 1}`, slug, index: i + 1, dependsOn, taskSpec: taskSpecs?.[i] });
    await atomicWriteFile(childTaskPaths[i]!, childBody);
  }

  const result = {
    status: 'success' as const,
    slug,
    title,
    from,
    to,
    count,
    depends_on: dependsOn,
    task_specs: taskSpecs ? taskSpecs.length : 0,
    files: files.map((f) => f.path),
  };

  return {
    exitCode: ExitCode.SUCCESS,
    result: attachFormattedOutput(
      result,
      formatChapterInitSummary({ status: 'success', title, slug, from, to, count, files }),
      fmt.getFormat(),
    ),
  };
}

export async function chapterValidateTasksFileCommand(
  options: ChapterValidateTasksFileOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  if (!options.count || !Number.isInteger(options.count) || options.count < 1) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--count must be an integer >= 1.' },
    };
  }

  try {
    const raw = await readFile(resolve(cwd, options.path), 'utf8');
    const specs = normalizeTaskSpecs(JSON.parse(raw), options.count) ?? [];
    const summary = specs.map((spec, index) => ({
      index: index + 1,
      title: spec.title,
      has_goal: spec.goal.trim().length > 0,
      acceptance_criteria_count: (spec.acceptance_criteria ?? spec.acceptanceCriteria ?? []).length,
    }));
    const result = {
      status: 'success',
      path: resolve(cwd, options.path),
      count: specs.length,
      tasks: summary,
    };
    if (fmt.getFormat() !== 'json') {
      fmt.message(`Valid chapter task-spec file: ${options.path}`, 'success');
      fmt.kv('Tasks', String(specs.length));
    }
    return { exitCode: ExitCode.SUCCESS, result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Invalid tasks file: ${msg}` },
    };
  }
}
