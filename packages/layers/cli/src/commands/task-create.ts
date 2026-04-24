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

function buildTaskBody(options: {
  title: string;
  goal?: string;
  chapter?: string;
  criteria?: string[];
}): string {
  const { title, goal, chapter, criteria } = options;

  const lines: string[] = [];

  if (chapter) {
    lines.push('## Chapter');
    lines.push('');
    lines.push(chapter);
    lines.push('');
  }

  lines.push('## Goal');
  lines.push('');
  lines.push(goal || title);
  lines.push('');

  lines.push('## Context');
  lines.push('');
  lines.push('<!-- Context placeholder -->');
  lines.push('');

  lines.push('## Required Work');
  lines.push('');
  lines.push('1. TBD');
  lines.push('');

  lines.push('## Non-Goals');
  lines.push('');
  lines.push('- Do not expand scope beyond this task.');
  lines.push('- Do not create derivative task-status files.');
  lines.push('- Do not mutate live external systems unless explicitly authorized.');
  lines.push('');

  lines.push('## Execution Notes');
  lines.push('');
  lines.push('<!-- Record what was done, decisions made, and files changed during execution. -->');
  lines.push('');

  lines.push('## Verification');
  lines.push('');
  lines.push('<!-- Record commands run, results observed, and how correctness was checked. -->');
  lines.push('');

  lines.push('## Acceptance Criteria');
  lines.push('');
  if (criteria && criteria.length > 0) {
    for (const c of criteria) {
      lines.push(`- [ ] ${c}`);
    }
  } else {
    lines.push('- [ ] TBD');
  }
  lines.push('');

  return lines.join('\n');
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
  const tasksDir = join(cwd, '.ai', 'tasks');
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
  if (options.fromFile) {
    try {
      body = await readFile(resolve(cwd, options.fromFile), 'utf8');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Failed to read --from-file: ${msg}` },
      };
    }
  } else {
    body = buildTaskBody({
      title,
      goal: options.goal,
      chapter: options.chapter,
      criteria: options.criteria,
    });
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
