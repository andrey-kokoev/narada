import { mkdir, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { atomicWriteFile } from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { renderTaskBodyFromSpec, type TaskSpecRecord } from '../lib/task-spec.js';

export interface ChapterCommissionOptions {
  input?: string;
  dryRun?: boolean;
  cwd?: string;
  format?: CliFormat;
}

interface CommissionInput {
  slug?: string;
  title?: string;
  depends_on?: number[];
  dependsOn?: number[];
  tasks?: CommissionTaskInput[];
}

interface CommissionTaskInput {
  title?: string;
  goal?: string;
  context?: string;
  required_work?: string | string[];
  requiredWork?: string | string[];
  non_goals?: string | string[];
  nonGoals?: string | string[];
  acceptance_criteria?: string[];
  acceptanceCriteria?: string[];
  depends_on?: number[];
  dependsOn?: number[];
}

type ParsedCommissionTask = {
  title: string;
  goal: string;
  context?: string;
  required_work?: string;
  requiredWork?: string;
  non_goals?: string;
  nonGoals?: string;
  depends_on?: number[];
  dependsOn?: number[];
  acceptance_criteria: string[];
};

interface ParsedCommissionInput {
  slug: string;
  title: string;
  depends_on: number[];
  tasks: ParsedCommissionTask[];
}

interface PlannedTask {
  task_id: string;
  task_number: number;
  title: string;
  file_path: string;
  status: 'opened';
  acceptance_criteria: string[];
}

export interface ChapterCommissionResult {
  status: 'success' | 'dry_run';
  mutation_performed: boolean;
  chapter: {
    slug: string;
    title: string;
    path: string;
    task_numbers: number[];
  };
  tasks: PlannedTask[];
  lifecycle_statuses: Array<{ task_number: number; status: string }>;
  dirty_published_posture: {
    portable_state_requires_export: boolean;
    next_command: string;
  };
  bounded_output: true;
}

function datePrefix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function validateSlug(value: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('slug must contain lowercase letters, digits, and hyphens only');
  }
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} is required`);
  }
  return value.trim();
}

function parseNumberArray(value: unknown, path: string): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || item < 1)) {
    throw new Error(`${path} must be an array of positive integers`);
  }
  return value as number[];
}

function parseStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${path} must be a non-empty array of strings`);
  }
  return (value as string[]).map((item) => item.trim());
}

function parseMarkdownField(value: unknown, path: string, options: { ordered?: boolean } = {}): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim().length > 0 ? value.trim() : undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        throw new Error(`${path} must be a string or array of non-empty strings`);
      }
      return item.trim();
    });
    return items
      .map((item, index) => options.ordered ? `${index + 1}. ${item}` : `- ${item}`)
      .join('\n');
  }
  throw new Error(`${path} must be a string or array of strings`);
}

function parseInput(raw: string): ParsedCommissionInput {
  const parsed = JSON.parse(raw) as CommissionInput;
  if (!parsed || typeof parsed !== 'object') throw new Error('input must be a JSON object');
  const slug = requireText(parsed.slug, 'slug');
  validateSlug(slug);
  const title = requireText(parsed.title, 'title');
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error('tasks must be a non-empty array');
  }
  const tasks = parsed.tasks.map((task, index): ParsedCommissionTask => {
    if (!task || typeof task !== 'object') throw new Error(`tasks[${index}] must be an object`);
    const acceptanceCriteria = task.acceptance_criteria ?? task.acceptanceCriteria;
    return {
      title: requireText(task.title, `tasks[${index}].title`),
      goal: requireText(task.goal, `tasks[${index}].goal`),
      context: task.context,
      required_work: parseMarkdownField(task.required_work, `tasks[${index}].required_work`, { ordered: true }),
      requiredWork: parseMarkdownField(task.requiredWork, `tasks[${index}].requiredWork`, { ordered: true }),
      non_goals: parseMarkdownField(task.non_goals, `tasks[${index}].non_goals`),
      nonGoals: parseMarkdownField(task.nonGoals, `tasks[${index}].nonGoals`),
      depends_on: task.depends_on,
      dependsOn: task.dependsOn,
      acceptance_criteria: parseStringArray(acceptanceCriteria, `tasks[${index}].acceptance_criteria`),
    };
  });
  return {
    slug,
    title,
    depends_on: parseNumberArray(parsed.depends_on ?? parsed.dependsOn, 'depends_on'),
    tasks,
  };
}

function buildChapterBody(input: { title: string; slug: string; dependsOn: number[]; tasks: PlannedTask[] }): string {
  const from = input.tasks[0]?.task_number;
  const to = input.tasks[input.tasks.length - 1]?.task_number;
  const taskRows = input.tasks
    .map((task, index) => `| ${index + 1} | ${task.task_number} | ${task.title} | opened |`)
    .join('\n');
  const nodes = input.tasks.map((task) => `  T${task.task_number}["${task.task_number} ${task.title}"]`).join('\n');
  const edges = input.tasks
    .slice(0, -1)
    .map((task, index) => `  T${task.task_number} --> T${input.tasks[index + 1]!.task_number}`)
    .join('\n');
  return `---
status: opened
depends_on: [${input.dependsOn.join(', ')}]
---

# ${input.title}

## Goal

Commissioned chapter ${input.slug} for tasks ${from}-${to}.

## DAG

\`\`\`mermaid
flowchart TD
${nodes}
${edges}
\`\`\`

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
${taskRows}

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
`;
}

function taskSpecFor(input: {
  taskId: string;
  taskNumber: number;
  chapterTitle: string;
  task: ParsedCommissionTask;
  chapterPath: string;
  chapterDependsOn: number[];
}): TaskSpecRecord {
  const dependencies = parseNumberArray(input.task.depends_on ?? input.task.dependsOn, `tasks[${input.taskNumber}].depends_on`);
  return {
    task_id: input.taskId,
    task_number: input.taskNumber,
    title: input.task.title,
    chapter: input.chapterPath,
    goal: input.task.goal,
    context: input.task.context ?? null,
    required_work: input.task.required_work ?? input.task.requiredWork ?? '1. Execute the commissioned task.',
    non_goals: input.task.non_goals ?? input.task.nonGoals ?? [
      '- Do not expand scope beyond this task.',
      '- Do not create derivative task-status files.',
      '- Do not mutate live external systems unless explicitly authorized.',
    ].join('\n'),
    acceptance_criteria: input.task.acceptance_criteria,
    dependencies: [...input.chapterDependsOn, ...dependencies],
    updated_at: new Date().toISOString(),
  };
}

function renderTaskFile(spec: TaskSpecRecord): string {
  const frontMatter = [
    '---',
    'status: opened',
    spec.dependencies.length > 0 ? `depends_on: [${spec.dependencies.join(', ')}]` : null,
    '---',
    '',
  ].filter((line): line is string => line !== null).join('\n');
  return `${frontMatter}${renderTaskBodyFromSpec({ spec, executionNotes: null, verification: null })}`;
}

export async function chapterCommissionCommand(
  options: ChapterCommissionOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!options.input) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--input is required' } };
  }

  let input: ParsedCommissionInput;
  try {
    input = parseInput(await readFile(resolve(cwd, options.input), 'utf8'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Invalid commission input: ${msg}` } };
  }

  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  const prefix = datePrefix();
  const dryRun = options.dryRun ?? false;
  const numbers = await previewNumbers(cwd, input.tasks.length);
  const from = numbers[0]!;
  const to = numbers[numbers.length - 1]!;
  const chapterPath = join(tasksDir, `${prefix}-${from}-${to}-${input.slug}.md`);
  const plannedTasks = input.tasks.map((task, index): PlannedTask => {
    const taskNumber = numbers[index]!;
    const taskSlug = slugify(task.title);
    return {
      task_id: `${prefix}-${taskNumber}-${taskSlug}`,
      task_number: taskNumber,
      title: task.title,
      file_path: join(tasksDir, `${prefix}-${taskNumber}-${taskSlug}.md`),
      status: 'opened',
      acceptance_criteria: task.acceptance_criteria,
    };
  });

  const collision = [chapterPath, ...plannedTasks.map((task) => task.file_path)].find((path) => existsSync(path));
  if (collision) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Commissioning would overwrite existing file: ${collision}` },
    };
  }

  const result: ChapterCommissionResult = {
    status: dryRun ? 'dry_run' : 'success',
    mutation_performed: !dryRun,
    chapter: {
      slug: input.slug,
      title: input.title,
      path: chapterPath,
      task_numbers: numbers,
    },
    tasks: plannedTasks,
    lifecycle_statuses: plannedTasks.map((task) => ({ task_number: task.task_number, status: task.status })),
    dirty_published_posture: {
      portable_state_requires_export: !dryRun,
      next_command: dryRun
        ? `narada chapter commission --input ${options.input}`
        : 'narada task lifecycle export --output .ai/task-lifecycle-snapshot.json',
    },
    bounded_output: true,
  };

  if (dryRun) {
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  }

  await mkdir(tasksDir, { recursive: true });
  const specs = input.tasks.map((task, index) => taskSpecFor({
    taskId: plannedTasks[index]!.task_id,
    taskNumber: plannedTasks[index]!.task_number,
    chapterTitle: input.title,
    task,
    chapterPath,
    chapterDependsOn: input.depends_on,
  }));
  await atomicWriteFile(chapterPath, buildChapterBody({
    title: input.title,
    slug: input.slug,
    dependsOn: input.depends_on,
    tasks: plannedTasks,
  }));
  const store = openTaskLifecycleStore(cwd);
  const writtenFiles: string[] = [chapterPath];
  try {
    store.db.exec('begin immediate;');
    const currentAllocated = store.getLastAllocated();
    const expectedNumbers = Array.from({ length: numbers.length }, (_, index) => currentAllocated + index + 1);
    if (expectedNumbers.some((expected, index) => expected !== numbers[index])) {
      throw new Error(`Task number allocation drift: expected ${numbers.join(', ')}, current sequence yields ${expectedNumbers.join(', ')}`);
    }
    store.db
      .prepare('update task_number_sequence set last_allocated = ? where singleton = 1')
      .run(to);
    for (let index = 0; index < specs.length; index += 1) {
      await atomicWriteFile(plannedTasks[index]!.file_path, renderTaskFile(specs[index]!));
      writtenFiles.push(plannedTasks[index]!.file_path);
    }
    for (const spec of specs) {
      store.upsertLifecycle({
        task_id: spec.task_id,
        task_number: spec.task_number,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: new Date().toISOString(),
      });
      store.upsertTaskSpec({
        task_id: spec.task_id,
        task_number: spec.task_number,
        title: spec.title,
        chapter_markdown: spec.chapter,
        goal_markdown: spec.goal,
        context_markdown: spec.context,
        required_work_markdown: spec.required_work,
        non_goals_markdown: spec.non_goals,
        acceptance_criteria_json: JSON.stringify(spec.acceptance_criteria),
        dependencies_json: JSON.stringify(spec.dependencies),
        updated_at: spec.updated_at,
      });
    }
    store.db.exec('commit;');
  } catch (error) {
    try { store.db.exec('rollback;'); } catch { /* ignore rollback errors */ }
    await Promise.all(writtenFiles.map((path) => unlink(path).catch(() => undefined)));
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Commissioning failed without durable partial artifacts: ${msg}` } };
  } finally {
    store.db.close();
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
  };
}

async function previewNumbers(cwd: string, count: number): Promise<number[]> {
  const store = openTaskLifecycleStore(cwd);
  try {
    const current = store.getLastAllocated();
    return Array.from({ length: count }, (_, index) => current + index + 1);
  } finally {
    store.db.close();
  }
}

function renderHuman(result: ChapterCommissionResult): string[] {
  return [
    result.status === 'dry_run' ? 'Chapter commission dry run' : 'Chapter commissioned',
    `Chapter: ${result.chapter.title}`,
    `Path: ${result.chapter.path}`,
    `Tasks: ${result.chapter.task_numbers.join(', ')}`,
    `Next: ${result.dirty_published_posture.next_command}`,
  ];
}
