/**
 * Task amendment operator.
 *
 * Sanctioned command path for changing task specification content
 * without direct markdown editing. Mutates the authored specification
 * (markdown body) and records amendment provenance in front matter.
 *
 * Closed/confirmed tasks may not be amended; reopen first.
 */

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  findTaskFile,
  readTaskFile,
  writeTaskFile,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  extractProjectionSections,
  parseTaskSpecFromMarkdown,
  renderTaskBodyFromSpec,
} from '../lib/task-spec.js';

export interface TaskAmendOptions {
  taskNumber: string;
  title?: string;
  goal?: string;
  context?: string;
  requiredWork?: string;
  nonGoals?: string;
  criteria?: string[];
  appendCriteria?: string[];
  fromFile?: string;
  by: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

function appendExecutionNote(existing: string | null, actor: string, changes: string[]): string {
  const timestamp = new Date().toISOString();
  const note = `- Amended by ${actor} at ${timestamp}: ${changes.join(', ')}`;
  return existing ? `${existing.trimEnd()}\n${note}` : note;
}

export async function taskAmendCommand(
  options: TaskAmendOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

  // ── Validation ──

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  if (!options.by || options.by.trim().length === 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--by is required (operator or agent ID)' },
    };
  }

  const num = Number(taskNumber);

  // ── Locate task ──

  const store = openTaskLifecycleStore(cwd);
  const existingSpecByNumber = store.getTaskSpecByNumber(num);
  const lifecycle = store.getLifecycleByNumber(num);
  const taskFile = await findTaskFile(cwd, taskNumber);
  const taskId = taskFile?.taskId ?? existingSpecByNumber?.task_id ?? lifecycle?.task_id ?? null;

  if (!taskId) {
    store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskNumber} not found` },
    };
  }

  // ── Read current state ──

  let frontMatter: Record<string, unknown> = {};
  let body = '';
  if (taskFile) {
    const read = await readTaskFile(taskFile.path);
    frontMatter = read.frontMatter;
    body = read.body;
  }

  let specRow = existingSpecByNumber ?? store.getTaskSpec(taskId);
  if (!specRow) {
    store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task ${taskNumber} has no SQLite task spec` },
    };
  }

  const status = String(lifecycle?.status ?? frontMatter.status ?? 'unknown');

  // ── Closed-task guard ──

  if (status === 'closed' || status === 'confirmed') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task ${taskNumber} is ${status}. Reopen before amending: narada task reopen ${taskNumber} --by <id>`,
      },
    };
  }

  // ── Determine what to change ──

  const changes: string[] = [];
  const updatedSpec = {
    ...specRow,
    title: specRow.title,
    chapter_markdown: specRow.chapter_markdown,
    goal_markdown: specRow.goal_markdown,
    context_markdown: specRow.context_markdown,
    required_work_markdown: specRow.required_work_markdown,
    non_goals_markdown: specRow.non_goals_markdown,
    acceptance_criteria_json: specRow.acceptance_criteria_json,
    dependencies_json: specRow.dependencies_json,
    updated_at: new Date().toISOString(),
  };
  let projectionSections = extractProjectionSections(body);

  if (options.fromFile) {
    try {
      const imported = await readFile(resolve(cwd, options.fromFile), 'utf8');
      const parsed = parseTaskSpecFromMarkdown({
        taskId,
        taskNumber: num,
        frontMatter,
        body: imported,
      });
      updatedSpec.title = parsed.title;
      updatedSpec.chapter_markdown = parsed.chapter;
      updatedSpec.goal_markdown = parsed.goal;
      updatedSpec.context_markdown = parsed.context;
      updatedSpec.required_work_markdown = parsed.required_work;
      updatedSpec.non_goals_markdown = parsed.non_goals;
      updatedSpec.acceptance_criteria_json = JSON.stringify(parsed.acceptance_criteria);
      updatedSpec.dependencies_json = JSON.stringify(parsed.dependencies);
      projectionSections = extractProjectionSections(imported);
      changes.push('body from file');
    } catch (error) {
      store.db.close();
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to read --from-file: ${msg}` },
      };
    }
  } else {
    if (options.title) {
      updatedSpec.title = options.title;
      changes.push('title');
    }
    if (options.goal) {
      updatedSpec.goal_markdown = options.goal;
      changes.push('goal');
    }
    if (options.context) {
      updatedSpec.context_markdown = options.context;
      changes.push('context');
    }
    if (options.requiredWork) {
      updatedSpec.required_work_markdown = options.requiredWork;
      changes.push('required work');
    }
    if (options.nonGoals) {
      updatedSpec.non_goals_markdown = options.nonGoals;
      changes.push('non-goals');
    }
    if (options.criteria && options.criteria.length > 0) {
      updatedSpec.acceptance_criteria_json = JSON.stringify(options.criteria);
      changes.push('acceptance criteria');
    }
    if (options.appendCriteria && options.appendCriteria.length > 0) {
      const existing = JSON.parse(updatedSpec.acceptance_criteria_json) as string[];
      updatedSpec.acceptance_criteria_json = JSON.stringify([...existing, ...options.appendCriteria]);
      changes.push('appended criteria');
    }
  }

  if (changes.length === 0 && !options.fromFile) {
    store.db.close();
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No amendments specified. Use --title, --goal, --context, --required-work, --non-goals, --criteria, --append-criteria, or --from-file.' },
    };
  }

  // ── Record audit trail ──

  if (!options.fromFile) {
    projectionSections.executionNotes = appendExecutionNote(
      projectionSections.executionNotes,
      options.by,
      changes,
    );
  }

  const newFrontMatter = {
    ...frontMatter,
    amended_by: options.by,
    amended_at: new Date().toISOString(),
  };

  store.upsertTaskSpec(updatedSpec);
  store.db.close();

  const newBody = renderTaskBodyFromSpec({
    spec: {
      title: updatedSpec.title,
      chapter: updatedSpec.chapter_markdown,
      goal: updatedSpec.goal_markdown,
      context: updatedSpec.context_markdown,
      required_work: updatedSpec.required_work_markdown,
      non_goals: updatedSpec.non_goals_markdown,
      acceptance_criteria: JSON.parse(updatedSpec.acceptance_criteria_json) as string[],
    },
    executionNotes: projectionSections.executionNotes,
    verification: projectionSections.verification,
    acceptanceCriteriaState: projectionSections.acceptanceCriteriaState,
  });

  // ── Write ──

  if (taskFile) {
    await writeTaskFile(taskFile.path, newFrontMatter, newBody);
  }

  // ── Output ──

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskId,
        task_number: num,
        amended_by: options.by,
        changes,
      },
    };
  }

  fmt.message(`Amended task ${taskId}`, 'success');
  fmt.kv('Amended by', options.by);
  if (changes.length > 0) {
    fmt.kv('Changes', changes.join(', '));
  }

  return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskId,
        task_number: num,
        amended_by: options.by,
        changes,
    },
  };
}
