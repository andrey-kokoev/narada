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
  extractSection,
  parseTaskSpecFromMarkdown,
  renderTaskBodyFromSpec,
  type TaskSpecRecord,
} from '../lib/task-spec.js';

export interface TaskCreateOptions {
  title?: string;
  goal?: string;
  context?: string;
  requiredWork?: string;
  chapter?: string;
  dependsOn?: string;
  criteria?: string[];
  number?: number;
  dryRun?: boolean;
  fromFile?: string;
  inputJson?: string;
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
  context?: string;
  requiredWork?: string;
  chapter?: string;
  criteria?: string[];
  dependsOn?: number[];
}): TaskSpecRecord {
  const { taskId, taskNumber, title, goal, context, requiredWork, chapter, criteria, dependsOn } = options;

  return {
    task_id: taskId,
    task_number: taskNumber,
    title,
    chapter: chapter ?? null,
    goal: goal || title,
    context: context ?? null,
    required_work: requiredWork || '1. TBD',
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

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

async function readStructuredInput(cwd: string, inputJson: string | undefined): Promise<Partial<TaskCreateOptions> | { error: string }> {
  if (!inputJson) return {};
  try {
    const raw = await readFile(resolve(cwd, inputJson), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: '--input-json must contain a JSON object.' };
    }
    const dependsOn = Array.isArray(parsed.depends_on)
      ? parsed.depends_on.map((item) => Number(item)).filter((item) => Number.isInteger(item)).join(',')
      : stringValue(parsed.depends_on);
    return {
      title: stringValue(parsed.title),
      goal: stringValue(parsed.goal),
      context: stringValue(parsed.context),
      requiredWork: stringValue(parsed.required_work) ?? stringValue(parsed.requiredWork),
      chapter: stringValue(parsed.chapter),
      dependsOn,
      criteria: stringArray(parsed.acceptance_criteria) ?? stringArray(parsed.criteria),
      number: numberValue(parsed.number),
      fromFile: stringValue(parsed.from_file) ?? stringValue(parsed.fromFile),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { error: `Failed to read --input-json: ${msg}` };
  }
}

function mergeTaskCreateOptions(base: Partial<TaskCreateOptions>, override: TaskCreateOptions): TaskCreateOptions {
  return {
    ...base,
    ...(override.title !== undefined ? { title: override.title } : {}),
    ...(override.goal !== undefined ? { goal: override.goal } : {}),
    ...(override.context !== undefined ? { context: override.context } : {}),
    ...(override.requiredWork !== undefined ? { requiredWork: override.requiredWork } : {}),
    ...(override.chapter !== undefined ? { chapter: override.chapter } : {}),
    ...(override.dependsOn !== undefined ? { dependsOn: override.dependsOn } : {}),
    ...(override.criteria !== undefined ? { criteria: override.criteria } : {}),
    ...(override.number !== undefined ? { number: override.number } : {}),
    ...(override.dryRun !== undefined ? { dryRun: override.dryRun } : {}),
    ...(override.fromFile !== undefined ? { fromFile: override.fromFile } : {}),
    ...(override.inputJson !== undefined ? { inputJson: override.inputJson } : {}),
    ...(override.format !== undefined ? { format: override.format } : {}),
    ...(override.cwd !== undefined ? { cwd: override.cwd } : {}),
  };
}

function suspiciousInlineField(value: string): boolean {
  return (
    value.includes('\n') ||
    value.includes('```') ||
    value.includes('$(') ||
    value.includes('|') ||
    /^\s*[>$]\s+/m.test(value)
  );
}

function rejectSuspiciousInline(options: TaskCreateOptions): string | null {
  if (options.inputJson || options.fromFile) return null;
  const fields: Array<[string, string | undefined]> = [
    ['--goal', options.goal],
    ['--context', options.context],
    ['--required-work', options.requiredWork],
    ['--chapter', options.chapter],
    ...(options.criteria ?? []).map((criterion, index) => [`--criteria[${index}]`, criterion] as [string, string]),
  ];
  const suspicious = fields.find(([, value]) => value && suspiciousInlineField(value));
  return suspicious
    ? `${suspicious[0]} contains shell-sensitive rich text. Use --input-json <file> or --from-file <path> so backticks, $(), pipes, quotes, and multiline text are preserved literally.`
    : null;
}

export async function taskCreateCommand(
  options: TaskCreateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const structured = await readStructuredInput(cwd, options.inputJson);
  if ('error' in structured) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: structured.error },
    };
  }
  const effective = mergeTaskCreateOptions(structured, options);
  const title = effective.title;

  // ── Validation ──

  if (!title || title.trim().length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--title is required.' },
    };
  }
  const normalizedTitle = title.trim();
  const inlineRejection = rejectSuspiciousInline(effective);
  if (inlineRejection) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: inlineRejection },
    };
  }

  const dependsOn = parseDependsOn(effective.dependsOn);

  // ── Determine task number ──

  let taskNumber: number;
  if (effective.number !== undefined) {
    taskNumber = effective.number;
  } else if (effective.dryRun) {
    taskNumber = await previewNextTaskNumber(cwd);
  } else {
    taskNumber = await allocateTaskNumber(cwd);
  }

  const datePrefix = formatDatePrefix();
  const slug = slugifyTitle(normalizedTitle);
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
  let effectiveDependsOn = dependsOn;
  if (effective.fromFile) {
    try {
      const rawBody = await readFile(resolve(cwd, effective.fromFile), 'utf8');
      const parsed = parseFrontMatter(rawBody);
      body = parsed.body;
      spec = parseTaskSpecFromMarkdown({
        taskId,
        taskNumber,
        frontMatter: parsed.frontMatter,
        body: parsed.body,
      });
      if (extractSection(parsed.body, 'Acceptance Criteria') && spec.acceptance_criteria.length === 0) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: 'Failed to parse --from-file Acceptance Criteria: use checkbox items (`- [ ]`), bullet items (`- item`), or numbered items (`1. item`).',
          },
        };
      }
      if (!effectiveDependsOn && spec.dependencies.length > 0) {
        effectiveDependsOn = spec.dependencies;
      }
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
      title: normalizedTitle,
      goal: effective.goal,
      context: effective.context,
      requiredWork: effective.requiredWork,
      chapter: effective.chapter,
      criteria: effective.criteria,
      dependsOn,
    });
    body = buildTaskBody(spec);
  }

  // ── Build front matter ──

  const frontMatter: Record<string, unknown> = {
    status: 'opened',
  };

  if (effectiveDependsOn && effectiveDependsOn.length > 0) {
    frontMatter.depends_on = effectiveDependsOn;
    spec = { ...spec, dependencies: effectiveDependsOn, updated_at: new Date().toISOString() };
  }

  // ── Dry run: preview only ──

  if (effective.dryRun) {
    const preview = {
      task_id: taskId,
      task_number: taskNumber,
      file_name: fileName,
      file_path: filePath,
      front_matter: frontMatter,
      acceptance_criteria: spec.acceptance_criteria,
      dependencies: spec.dependencies,
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
    fmt.kv('Title', normalizedTitle);
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
        title: normalizedTitle,
      },
    };
  }

  fmt.message(`Created task ${taskId}`, 'success');
  fmt.kv('Task number', String(taskNumber));
  fmt.kv('File', fileName);
  fmt.kv('Title', normalizedTitle);

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskId,
      task_number: taskNumber,
      file_name: fileName,
      file_path: filePath,
      title: normalizedTitle,
    },
  };
}
