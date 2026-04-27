/**
 * Task evidence operators.
 *
 * Inspection is read-only. Proof operators may mutate only evidence
 * projection state and must record admission through Evidence Admission.
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  inspectTaskEvidence,
  readTaskFile,
  writeTaskProjection,
  type TaskCompletionEvidence,
} from '../lib/task-governance.js';
import { inspectTaskEvidenceWithProjection } from '../lib/task-projection.js';
import { ExitCode } from '../lib/exit-codes.js';
import { admitTaskEvidence } from '../lib/evidence-admission.js';
import { openTaskLifecycleStore, type TaskStatus } from '../lib/task-lifecycle-store.js';
import {
  extractProjectionSections,
  parseTaskSpecFromMarkdown,
  renderTaskBodyFromSpec,
} from '../lib/task-spec.js';

export interface TaskEvidenceOptions {
  taskNumber: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskEvidenceProveCriteriaOptions extends TaskEvidenceOptions {
  by: string;
  verificationRunId?: string;
  unboundRationale?: string;
}

export interface TaskEvidenceAdmitOptions extends TaskEvidenceOptions {
  by: string;
}

function normalizeLifecycleStatus(value: unknown): TaskStatus {
  const status = typeof value === 'string' ? value : 'opened';
  if (
    status === 'draft' ||
    status === 'opened' ||
    status === 'claimed' ||
    status === 'needs_continuation' ||
    status === 'in_review' ||
    status === 'closed' ||
    status === 'confirmed'
  ) {
    return status;
  }
  return 'opened';
}

export async function taskEvidenceCommand(
  options: TaskEvidenceOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  let evidence: TaskCompletionEvidence;
  try {
    // Try projection-backed inspection first (SQLite lifecycle + markdown spec)
    const projected = await inspectTaskEvidenceWithProjection(cwd, taskNumber);
    if (projected) {
      evidence = projected;
    } else {
      // Fall back to pure markdown inspection when SQLite is unavailable
      evidence = await inspectTaskEvidence(cwd, taskNumber);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to inspect task evidence: ${msg}` },
    };
  }

  const format = options.format === 'json' ? 'json' : 'human';

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'ok',
        evidence,
      },
    };
  }

  const lines: string[] = [
    `Task ${evidence.task_number ?? taskNumber} Evidence`,
    '',
    `  status:              ${evidence.status ?? 'missing'}`,
    `  verdict:             ${evidence.verdict}`,
    `  criteria checked:    ${evidence.all_criteria_checked === null ? 'n/a' : evidence.all_criteria_checked ? 'yes' : `no (${evidence.unchecked_count} unchecked)`}`,
    `  execution notes:     ${evidence.has_execution_notes ? 'yes' : 'no'}`,
    `  verification:        ${evidence.has_verification ? 'yes' : 'no'}`,
    `  report:              ${evidence.has_report ? 'yes' : 'no'}`,
    `  review:              ${evidence.has_review ? 'yes' : 'no'}`,
    `  closure:             ${evidence.has_closure ? 'yes' : 'no'}`,
    `  assignment intent:   ${evidence.active_assignment_intent ?? 'none'}`,
  ];

  if (evidence.violations.length > 0) {
    lines.push('');
    lines.push('Invariant violations:');
    for (const v of evidence.violations) {
      lines.push(`  ❌ ${v}`);
    }
  }

  if (evidence.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of evidence.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: lines.join('\n'),
  };
}

export async function taskEvidenceAdmitCommand(
  options: TaskEvidenceAdmitOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

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
  const admission = await admitTaskEvidence({
    cwd,
    taskNumber: Number(taskNumber),
    admittedBy: options.by,
    methods: ['admission'],
  });

  return {
    exitCode: admission.blockers.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: {
      status: admission.blockers.length === 0 ? 'success' : 'error',
      task_number: Number(taskNumber),
      admitted_by: options.by,
      admission_result: admission.result,
      evidence_bundle: admission.bundle,
      blockers: admission.blockers,
    },
  };
}

export async function taskEvidenceProveCriteriaCommand(
  options: TaskEvidenceProveCriteriaOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

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
  if (!options.verificationRunId && !options.unboundRationale) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: 'Criteria proof requires --verification-run or --unbound-rationale',
      },
    };
  }

  const taskNum = Number(taskNumber);
  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const store = openTaskLifecycleStore(cwd);
  try {
    const parsedSpec = parseTaskSpecFromMarkdown({
      taskId: taskFile.taskId,
      taskNumber: taskNum,
      frontMatter,
      body,
    });

    if (!store.getLifecycleByNumber(taskNum) && !store.getLifecycle(taskFile.taskId)) {
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: taskNum,
        status: normalizeLifecycleStatus(frontMatter.status),
        governed_by: typeof frontMatter.governed_by === 'string' ? frontMatter.governed_by : null,
        closed_at: typeof frontMatter.closed_at === 'string' ? frontMatter.closed_at : null,
        closed_by: typeof frontMatter.closed_by === 'string' ? frontMatter.closed_by : null,
        reopened_at: typeof frontMatter.reopened_at === 'string' ? frontMatter.reopened_at : null,
        reopened_by: typeof frontMatter.reopened_by === 'string' ? frontMatter.reopened_by : null,
        continuation_packet_json: null,
        updated_at: new Date().toISOString(),
      });
    }

    let specRow = store.getTaskSpecByNumber(taskNum) ?? store.getTaskSpec(taskFile.taskId);
    if (!specRow) {
      specRow = {
        task_id: parsedSpec.task_id,
        task_number: parsedSpec.task_number,
        title: parsedSpec.title,
        chapter_markdown: parsedSpec.chapter,
        goal_markdown: parsedSpec.goal,
        context_markdown: parsedSpec.context,
        required_work_markdown: parsedSpec.required_work,
        non_goals_markdown: parsedSpec.non_goals,
        acceptance_criteria_json: JSON.stringify(parsedSpec.acceptance_criteria),
        dependencies_json: JSON.stringify(parsedSpec.dependencies),
        updated_at: parsedSpec.updated_at,
      };
      store.upsertTaskSpec(specRow);
    }

    const criteria = JSON.parse(specRow.acceptance_criteria_json) as string[];
    if (criteria.length === 0) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Task ${taskNumber} has no acceptance criteria to prove` },
      };
    }

    const projectionSections = extractProjectionSections(body);
    projectionSections.acceptanceCriteriaState = criteria.map((text) => ({ text, checked: true }));
    const newBody = renderTaskBodyFromSpec({
      spec: {
        title: specRow.title,
        chapter: specRow.chapter_markdown,
        goal: specRow.goal_markdown,
        context: specRow.context_markdown,
        required_work: specRow.required_work_markdown,
        non_goals: specRow.non_goals_markdown,
        acceptance_criteria: criteria,
      },
      executionNotes: projectionSections.executionNotes,
      verification: projectionSections.verification,
      acceptanceCriteriaState: projectionSections.acceptanceCriteriaState,
    });
    const verificationBinding = options.verificationRunId
      ? { state: 'bound', verification_run_id: options.verificationRunId }
      : { state: 'unbound', rationale: options.unboundRationale ?? 'No verification run binding supplied' };
    const provedAt = new Date().toISOString();
    store.upsertCriteriaProof({
      proof_id: `criteria_proof_${taskFile.taskId}_${provedAt}`,
      task_id: taskFile.taskId,
      task_number: taskNum,
      proved_by: options.by,
      proved_at: provedAt,
      criteria_json: JSON.stringify(criteria.map((text) => ({ text, checked: true }))),
      verification_binding_json: JSON.stringify(verificationBinding),
    });

    await writeTaskProjection(taskFile.path, {
      ...frontMatter,
      criteria_proved_by: options.by,
      criteria_proved_at: provedAt,
      criteria_proof_verification: verificationBinding,
    }, newBody);

    const admission = await admitTaskEvidence({
      cwd,
      taskNumber: taskNum,
      admittedBy: options.by,
      methods: ['criteria_proof'],
      store,
    });

    return {
      exitCode: admission.blockers.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        status: admission.blockers.length === 0 ? 'success' : 'error',
        task_id: taskFile.taskId,
        task_number: taskNum,
        proved_by: options.by,
        checked_criteria: criteria.length,
        criteria_proof_verification: verificationBinding,
        admission_result: admission.result,
        evidence_bundle: admission.bundle,
        blockers: admission.blockers,
      },
    };
  } finally {
    store.db.close();
  }
}
