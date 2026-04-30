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
  view?: string;
  includeGuidance?: boolean;
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
  recommended_compact_command?: string;
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
      recommended_compact_command: 'narada task workboard --view compact --format json',
    };
    const output = compactWorkboard(result, Boolean(options.includeGuidance), options.view);

    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(output, renderHuman(output), options.format ?? 'auto'),
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
        target: envelope.promotion ? formatPromotionTarget(envelope.promotion.target_kind, envelope.promotion.target_ref) : null,
      }));
  } finally {
    store.close();
  }
}

function formatPromotionTarget(kind: string, ref: string): string {
  const normalizedRef = ref.startsWith(`${kind}:`) ? ref.slice(kind.length + 1) : ref;
  return `${kind}:${normalizedRef}`;
}

function compactWorkboard(workboard: TaskWorkboard, includeGuidance: boolean, view: string | undefined): TaskWorkboard | Record<string, unknown> {
  if ((view ?? 'full') !== 'compact') return workboard;
  const compact: Record<string, unknown> = {
    status: workboard.status,
    view: 'compact',
    generated_at: workboard.generated_at,
    limit: workboard.limit,
    counts: {
      active_chapters: workboard.active_chapters.length,
      pending_reviews: workboard.pending_reviews.length,
      in_progress: workboard.in_progress.length,
      local_followups: workboard.local_followups.length,
      deferred: workboard.deferred.length,
      source_envelopes: workboard.source_envelopes.length,
      prepared_publications: workboard.upstream_publications.length,
    },
    active_chapters: workboard.active_chapters,
    pending_reviews: workboard.pending_reviews,
    in_progress: workboard.in_progress,
    local_followups: workboard.local_followups,
    deferred: workboard.deferred,
    high_priority_diagnostics: highPriorityDiagnostics(workboard),
    source_envelopes: workboard.source_envelopes,
    upstream_publications: workboard.upstream_publications,
    recommended_command: workboard.recommended_compact_command,
  };
  if (includeGuidance) {
    compact.review_handoff_requirements = workboard.review_handoff_requirements;
    compact.closure_semantics = workboard.closure_semantics;
    compact.followup_task_path = workboard.followup_task_path;
    compact.concurrency_boundaries = workboard.concurrency_boundaries;
  }
  return compact;
}

function highPriorityDiagnostics(workboard: TaskWorkboard): string[] {
  const diagnostics: string[] = [];
  const underspecified = [...workboard.in_progress, ...workboard.local_followups]
    .filter((task) => task.handoff_actionability.status === 'underspecified')
    .map((task) => task.task_number);
  if (underspecified.length > 0) diagnostics.push(`underspecified_handoffs:${underspecified.join(',')}`);
  if (workboard.pending_reviews.length > 0) diagnostics.push(`pending_reviews:${workboard.pending_reviews.map((task) => task.task_number).join(',')}`);
  if (workboard.upstream_publications.length > 0) diagnostics.push(`prepared_publications:${workboard.upstream_publications.map((publication) => publication.publication_id).join(',')}`);
  return diagnostics;
}

function renderHuman(workboard: TaskWorkboard | Record<string, unknown>): string[] {
  if ((workboard as { view?: string }).view === 'compact') {
    const counts = ((workboard as { counts?: Record<string, number> }).counts ?? {});
    return [
      'Current Workboard (compact)',
      `Generated: ${String(workboard.generated_at)}`,
      `Pending reviews: ${counts.pending_reviews ?? 0}`,
      `In progress: ${counts.in_progress ?? 0}`,
      `Deferred: ${counts.deferred ?? 0}`,
      `Local followups: ${counts.local_followups ?? 0}`,
      `Prepared publications: ${counts.prepared_publications ?? 0}`,
      `Recommended: ${String((workboard as { recommended_command?: string }).recommended_command ?? 'narada task workboard --view compact --format json')}`,
    ];
  }
  const full = workboard as TaskWorkboard;
  const lines = [
    'Current Workboard',
    `Generated: ${full.generated_at}`,
    `Active chapters: ${full.active_chapters.length}`,
    `Pending reviews: ${full.pending_reviews.length}`,
    `In progress: ${full.in_progress.length}`,
    `Deferred: ${full.deferred.length}`,
    `Local followups: ${full.local_followups.length}`,
    `Source envelopes: ${full.source_envelopes.length}`,
    `Prepared publications: ${full.upstream_publications.length}`,
    '',
    'Pending Reviews:',
    ...renderTaskLines(full.pending_reviews),
    '',
    'In Progress:',
    ...renderTaskLines(full.in_progress),
    '',
    'Deferred:',
    ...renderTaskLines(full.deferred),
    '',
    'Concurrency:',
    ...full.concurrency_boundaries.map((line) => `  - ${line}`),
  ];
  return lines;
}

function renderTaskLines(tasks: WorkboardTask[]): string[] {
  if (tasks.length === 0) return ['  none'];
  return tasks.map((task) => `  ${task.task_number} ${task.status} ${task.assigned_agent ?? 'unassigned'}${task.handoff_actionability.status === 'underspecified' ? ' underspecified' : ''} - ${task.title}`);
}
