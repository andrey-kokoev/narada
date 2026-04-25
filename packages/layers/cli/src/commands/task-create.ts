/**
 * Task creation operator.
 *
 * Combines number allocation with spec authoring to create a complete
 * task file and initialize its SQLite lifecycle row in a single command.
 *
 * This is the sanctioned path for standalone task creation (non-chapter).
 */

import { resolve, join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  allocateTaskNumber,
  previewNextTaskNumber,
  atomicWriteFile,
  serializeFrontMatter,
} from '../lib/task-governance.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { parseFrontMatter } from '../lib/task-governance.js';
import {
  parseTaskSpecFromMarkdown,
  renderTaskBodyFromSpec,
  type TaskSpecRecord,
} from '../lib/task-spec.js';

export interface TaskCreateOptions {
  title: string;
  goal?: string;
  chapter?: string;
  dependsOn?: string;
  criteria?: string[];
  number?: number;
  dryRun?: boolean;
  fromFile?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function formatDatePrefix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function buildTaskSpec(options: {
  taskId: string;
  taskNumber: number;
  title: string;
  goal?: string;
  chapter?: string;
  criteria?: string[];
  dependsOn?: number[];
}): TaskSpecRecord {
  const { taskId, taskNumber, title, goal, chapter, criteria, dependsOn } = options;

  return {
    task_id: taskId,
    task_number: taskNumber,
    title,
    chapter: chapter ?? null,
    goal: goal || title,
    context: null,
    required_work: '1. TBD',
    non_goals: [
      '- Do not expand scope beyond this task.',
      '- Do not create derivative task-status files.',
      '- Do not mutate live external systems unless explicitly authorized.',
    ].join('\n'),
    acceptance_criteria: criteria && criteria.length > 0 ? criteria : ['TBD'],
    dependencies: dependsOn ?? [],
    updated_at: new Date().toISOString(),
  };
}

function buildTaskBody(spec: TaskSpecRecord): string {
  return renderTaskBodyFromSpec({
    spec,
    executionNotes: null,
    verification: null,
  });
}

function parseDependsOn(input: string | undefined): number[] | undefined {
  if (!input) return undefined;
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => !Number.isNaN(n));
}

export async function taskCreateCommand(
  options: TaskCreateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const title = options.title;

  // ── Validation ──

  if (!title || title.trim().length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--title is required.' },
    };
  }

  const dependsOn = parseDependsOn(options.dependsOn);

  // ── Determine task number ──

  let taskNumber: number;
  if (options.number !== undefined) {
    taskNumber = options.number;
  } else if (options.dryRun) {
    taskNumber = await previewNextTaskNumber(cwd);
  } else {
    taskNumber = await allocateTaskNumber(cwd);
  }

  const datePrefix = formatDatePrefix();
  const slug = slugifyTitle(title);
  const taskId = `${datePrefix}-${taskNumber}-${slug}`;
  const fileName = `${taskId}.md`;
  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  const filePath = join(tasksDir, fileName);

  // ── Collision check ──

  try {
    await access(filePath);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task file already exists: ${filePath}` },
    };
  } catch {
    // File does not exist — safe to proceed
  }

  // ── Build body ──

  let body: string;
  let spec: TaskSpecRecord;
  if (options.fromFile) {
    try {
      body = await readFile(resolve(cwd, options.fromFile), 'utf8');
      const parsed = parseFrontMatter(body);
      spec = parseTaskSpecFromMarkdown({
        taskId,
        taskNumber,
        frontMatter: parsed.frontMatter,
        body: parsed.body,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to read --from-file: ${msg}` },
      };
    }
  } else {
    spec = buildTaskSpec({
      taskId,
      taskNumber,
      title,
      goal: options.goal,
      chapter: options.chapter,
      criteria: options.criteria,
      dependsOn,
    });
    body = buildTaskBody(spec);
  }

  // ── Build front matter ──

  const frontMatter: Record<string, unknown> = {
    status: 'opened',
  };

  if (dependsOn && dependsOn.length > 0) {
    frontMatter.depends_on = dependsOn;
  }

  // ── Dry run: preview only ──

  if (options.dryRun) {
    const preview = {
      task_id: taskId,
      task_number: taskNumber,
      file_name: fileName,
      file_path: filePath,
      front_matter: frontMatter,
      body_preview: body.slice(0, 500),
    };

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'dry_run', ...preview },
      };
    }

    fmt.message(`Dry run — task would be created:`, 'info');
    fmt.kv('Task ID', taskId);
    fmt.kv('Task number', String(taskNumber));
    fmt.kv('File', fileName);
    fmt.kv('Title', title);
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'dry_run', ...preview },
    };
  }

  // ── Create file ──

  const fileContent = serializeFrontMatter(frontMatter, body);
  await atomicWriteFile(filePath, fileContent);

  // ── Initialize SQLite lifecycle row ──

  const store = openTaskLifecycleStore(cwd);
  try {
    store.upsertLifecycle({
      task_id: taskId,
      task_number: taskNumber,
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
  } finally {
    store.db.close();
  }

  // ── Output ──

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskId,
        task_number: taskNumber,
        file_name: fileName,
        file_path: filePath,
        title,
      },
    };
  }

  fmt.message(`Created task ${taskId}`, 'success');
  fmt.kv('Task number', String(taskNumber));
  fmt.kv('File', fileName);
  fmt.kv('Title', title);

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskId,
      task_number: taskNumber,
      file_name: fileName,
      file_path: filePath,
      title,
    },
  };
}
