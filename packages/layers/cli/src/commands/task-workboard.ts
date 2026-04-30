import { join, resolve } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore, type TaskLifecycleRow, type TaskSpecRow } from '../lib/task-lifecycle-store.js';
import { classifyTaskHandoffActionability, type TaskHandoffActionability } from '../lib/task-actionability.js';

export interface TaskWorkboardOptions {
  cwd?: string;
  format?: CliFormat;
  limit?: number;
}

type WorkboardTask = {
  task_number: number;
  task_id: string;
  title: string;
  status: string;
  chapter: string | null;
  assigned_agent: string | null;
  handoff_actionability: TaskHandoffActionability;
};

export interface TaskWorkboard {
  status: 'success';
  generated_at: string;
  limit: number;
  active_chapters: Array<{
    chapter: string;
    active_tasks: number;
    pending_reviews: number;
    in_progress: number;
    deferred: number;
    task_numbers: number[];
  }>;
  pending_reviews: WorkboardTask[];
  in_progress: WorkboardTask[];
  local_followups: WorkboardTask[];
  deferred: WorkboardTask[];
  source_envelopes: Array<{
    envelope_id: string;
    kind: string;
    status: string;
    source_kind: string;
    source_ref: string;
    target: string | null;
  }>;
  upstream_publications: Array<{
    publication_id: string;
    status: string;
    task_number: number | null;
    requester_id: string;
    bundle_path: string;
  }>;
  review_handoff_requirements: string[];
  closure_semantics: string[];
  followup_task_path: string[];
  concurrency_boundaries: string[];
}

const ACTIVE_STATUSES = new Set(['claimed', 'needs_continuation', 'in_review']);
const DEFERRED_STATUSES = new Set(['deferred']);

export async function taskWorkboardCommand(
  options: TaskWorkboardOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const store = openTaskLifecycleStore(cwd);
  try {
    const lifecycles = store.getAllLifecycle();
    const tasks = lifecycles
      .map((row) => workboardTaskFromRow(store, row))
      .filter((task): task is WorkboardTask => task !== null)
      .sort((a, b) => b.task_number - a.task_number);
    const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.has(task.status));
    const deferredTasks = tasks.filter((task) => DEFERRED_STATUSES.has(task.status));
    const result: TaskWorkboard = {
      status: 'success',
      generated_at: new Date().toISOString(),
      limit,
      active_chapters: summarizeChapters([...activeTasks, ...deferredTasks]).slice(0, limit),
      pending_reviews: activeTasks.filter((task) => task.status === 'in_review').slice(0, limit),
      in_progress: activeTasks.filter((task) => task.status === 'claimed' || task.status === 'needs_continuation').slice(0, limit),
      local_followups: tasks.filter((task) => task.status === 'opened' || task.status === 'needs_continuation').slice(0, limit),
      deferred: deferredTasks.slice(0, limit),
      source_envelopes: listSourceEnvelopes(cwd, limit),
      upstream_publications: store.listRepoPublications(limit, null)
        .filter((publication) => publication.status === 'prepared')
        .map((publication) => ({
          publication_id: publication.publication_id,
          status: publication.status,
          task_number: publication.task_number,
          requester_id: publication.requester_id,
          bundle_path: publication.bundle_path,
        })),
      review_handoff_requirements: [
        'Task report or handoff packet names commits, changed files, verification, residuals, and requested review decision.',
        'Reviewer must not infer completion by scanning chat, shell transcript, or git history.',
        'If review is requested outside task review, route a bounded inbox observation or task handoff artifact.',
      ],
      closure_semantics: [
        'manual_helper: helper exists but normal workflow remains manual.',
        'operator_entrypoint: operator can invoke the capability through a named command/UI path.',
        'event_driven_automation: capability runs from the intended event without manual triggering.',
        'fully_integrated: capability is wired into the normal product/runtime path with evidence.',
      ],
      followup_task_path: [
        'Reviewer records finding or inbox observation.',
        'Use narada task derive-from-finding or narada task create/inbox task through sanctioned command.',
        'Claim or assign Builder explicitly.',
        'Emit narada task handoff <n> --artifact when the task is handed to Builder.',
        'Publish governance artifacts without source bleed using narada publication prepare --governance-only when needed.',
      ],
      concurrency_boundaries: [
        'Architect may mutate task/inbox/routing/review governance while Builder source files are dirty.',
        'Do not simultaneously mutate the same task lifecycle row, exported envelope, or lifecycle snapshot without serialized sanctioned commands.',
        'Publication should stage declared governance/evidence paths separately from Builder implementation paths.',
      ],
    };

    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } finally {
    store.db.close();
  }
}

function workboardTaskFromRow(
  store: ReturnType<typeof openTaskLifecycleStore>,
  row: TaskLifecycleRow,
): WorkboardTask | null {
  if (row.task_number === null) return null;
  const spec = store.getTaskSpecByNumber(row.task_number);
  const assignment = store.getActiveAssignment(row.task_id);
  const rosterAgent = assignment ? null : store.getRoster().find((agent) => agent.task_number === row.task_number);
  return {
    task_number: row.task_number,
    task_id: row.task_id,
    title: titleForSpec(spec, row.task_id),
    status: row.status,
    chapter: spec?.chapter_markdown ?? null,
    assigned_agent: assignment?.agent_id ?? rosterAgent?.agent_id ?? null,
    handoff_actionability: classifyTaskHandoffActionability({
      taskNumber: row.task_number,
      status: row.status,
      requiredWork: spec?.required_work_markdown ?? null,
    }),
  };
}

function titleForSpec(spec: TaskSpecRow | undefined, fallback: string): string {
  return spec?.title ?? fallback;
}

function summarizeChapters(tasks: WorkboardTask[]): TaskWorkboard['active_chapters'] {
  const byChapter = new Map<string, WorkboardTask[]>();
  for (const task of tasks) {
    const chapter = task.chapter ?? 'Unchaptered';
    byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), task]);
  }
  return [...byChapter.entries()]
    .map(([chapter, chapterTasks]) => ({
      chapter,
      active_tasks: chapterTasks.length,
      pending_reviews: chapterTasks.filter((task) => task.status === 'in_review').length,
      in_progress: chapterTasks.filter((task) => task.status === 'claimed' || task.status === 'needs_continuation').length,
      deferred: chapterTasks.filter((task) => task.status === 'deferred').length,
      task_numbers: chapterTasks.map((task) => task.task_number).sort((a, b) => a - b),
    }))
    .sort((a, b) => b.active_tasks - a.active_tasks || a.chapter.localeCompare(b.chapter));
}

function listSourceEnvelopes(cwd: string, limit: number): TaskWorkboard['source_envelopes'] {
  const store = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
  try {
    return store.list({ limit })
      .map((envelope) => ({
        envelope_id: envelope.envelope_id,
        kind: envelope.kind,
        status: envelope.status,
        source_kind: envelope.source.kind,
        source_ref: envelope.source.ref,
        target: envelope.promotion ? `${envelope.promotion.target_kind}:${envelope.promotion.target_ref}` : null,
      }));
  } finally {
    store.close();
  }
}

function renderHuman(workboard: TaskWorkboard): string[] {
  const lines = [
    'Current Workboard',
    `Generated: ${workboard.generated_at}`,
    `Active chapters: ${workboard.active_chapters.length}`,
    `Pending reviews: ${workboard.pending_reviews.length}`,
    `In progress: ${workboard.in_progress.length}`,
    `Deferred: ${workboard.deferred.length}`,
    `Local followups: ${workboard.local_followups.length}`,
    `Source envelopes: ${workboard.source_envelopes.length}`,
    `Prepared publications: ${workboard.upstream_publications.length}`,
    '',
    'Pending Reviews:',
    ...renderTaskLines(workboard.pending_reviews),
    '',
    'In Progress:',
    ...renderTaskLines(workboard.in_progress),
    '',
    'Deferred:',
    ...renderTaskLines(workboard.deferred),
    '',
    'Concurrency:',
    ...workboard.concurrency_boundaries.map((line) => `  - ${line}`),
  ];
  return lines;
}

function renderTaskLines(tasks: WorkboardTask[]): string[] {
  if (tasks.length === 0) return ['  none'];
  return tasks.map((task) => `  ${task.task_number} ${task.status} ${task.assigned_agent ?? 'unassigned'}${task.handoff_actionability.status === 'underspecified' ? ' underspecified' : ''} - ${task.title}`);
}
