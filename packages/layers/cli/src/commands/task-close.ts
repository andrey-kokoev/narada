/**
 * Governed task close operator.
 *
 * A task may enter closed/confirmed only when:
 * 1. all acceptance criteria are checked,
 * 2. execution notes exist,
 * 3. verification notes exist,
 * 4. no derivative task-status files exist.
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  readTaskFile,
  writeTaskFile,
  inspectTaskEvidence,
  isValidTransition,
  hasDerivativeFiles,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { TaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskCloseOptions {
  taskNumber: string;
  by?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  store?: TaskLifecycleStore;
}

export async function taskCloseCommand(
  options: TaskCloseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const closedBy = options.by ?? 'operator';

  if (!taskNumber || !Number.isFinite(Number(taskNumber))) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid or missing task number' },
    };
  }

  // Find task file
  let taskFile;
  try {
    taskFile = await findTaskFile(cwd, taskNumber);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }

  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);

  // --- SQLite-backed lifecycle path (Task 564) ---
  // SQLite is the authoritative source for lifecycle state.
  // Markdown front matter is preserved as a compatibility projection.
  const store = options.store;
  let sqliteStatus: string | undefined;
  if (store) {
    let lifecycle = store.getLifecycle(taskFile.taskId);
    if (!lifecycle) {
      // Backfill: task exists in markdown but not yet in SQLite
      const taskNum = Number(taskNumber);
      if (!Number.isFinite(taskNum)) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: 'Cannot determine task number for SQLite backfill' },
        };
      }
      store.upsertLifecycle({
        task_id: taskFile.taskId,
        task_number: taskNum,
        status: (frontMatter.status as import('../lib/task-lifecycle-store.js').TaskStatus) ?? 'opened',
        governed_by: (frontMatter.governed_by as string) || null,
        closed_at: (frontMatter.closed_at as string) || null,
        closed_by: (frontMatter.closed_by as string) || null,
        reopened_at: (frontMatter.reopened_at as string) || null,
        reopened_by: (frontMatter.reopened_by as string) || null,
        continuation_packet_json: null,
        updated_at: new Date().toISOString(),
      });
      lifecycle = store.getLifecycle(taskFile.taskId)!;
    }
    sqliteStatus = lifecycle.status;
  }

  const currentStatus = sqliteStatus ?? (frontMatter.status as string | undefined);

  // Inspect evidence
  const evidence = await inspectTaskEvidence(cwd, taskNumber);

  // If already terminal, validate and report
  if (currentStatus === 'closed' || currentStatus === 'confirmed') {
    const isValid = evidence.violations.length === 0;
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: isValid ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
        result: {
          status: isValid ? 'ok' : 'error',
          task_id: taskFile.taskId,
          task_number: Number(taskNumber),
          current_status: currentStatus,
          valid: isValid,
          ...(isValid
            ? { message: `Task ${taskFile.taskId} is ${currentStatus} and valid by evidence` }
            : { violations: evidence.violations, warnings: evidence.warnings }),
        },
      };
    }

    if (isValid) {
      fmt.message(`Task ${taskFile.taskId} is ${currentStatus} and valid by evidence`, 'success');
    } else {
      fmt.message(`Task ${taskFile.taskId} is ${currentStatus} but INVALID by evidence`, 'error');
      for (const v of evidence.violations) {
        fmt.message(`  ❌ ${v}`, 'error');
      }
      for (const w of evidence.warnings) {
        fmt.message(`  ⚠ ${w}`, 'warning');
      }
    }

    return {
      exitCode: isValid ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: {
        status: isValid ? 'ok' : 'error',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        current_status: currentStatus,
        valid: isValid,
        violations: evidence.violations,
        warnings: evidence.warnings,
      },
    };
  }

  // Validate transition
  if (!isValidTransition(currentStatus, 'closed')) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Transition from '${String(currentStatus)}' to 'closed' is not allowed by the state machine`,
      },
    };
  }

  // Gate checks
  const gateFailures: string[] = [];
  if (evidence.all_criteria_checked === false) {
    gateFailures.push(`${evidence.unchecked_count} acceptance criteria remain unchecked`);
  }
  if (!evidence.has_execution_notes) {
    gateFailures.push('Task lacks execution notes');
  }
  if (!evidence.has_verification) {
    gateFailures.push('Task lacks verification notes');
  }
  const num = Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null;
  if (num !== null && await hasDerivativeFiles(cwd, num)) {
    gateFailures.push('Derivative task-status files exist');
  }

  if (gateFailures.length > 0) {
    const remediation: string[] = [];
    if (evidence.all_criteria_checked === false) {
      remediation.push('  → Check all acceptance criteria: replace `- [ ]` with `- [x]` in `## Acceptance Criteria`');
    }
    if (!evidence.has_execution_notes) {
      remediation.push('  → Add `## Execution Notes` section describing what was done and why');
    }
    if (!evidence.has_verification) {
      remediation.push('  → Add `## Verification` section with commands run and results observed');
    }
    if (num !== null && await hasDerivativeFiles(cwd, num)) {
      remediation.push('  → Remove derivative task-status files (`-EXECUTED.md`, `-DONE.md`, etc.)');
    }

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          task_id: taskFile.taskId,
          task_number: Number(taskNumber),
          current_status: currentStatus,
          gate_failures: gateFailures,
          remediation,
          violations: evidence.violations,
        },
      };
    }

    fmt.message(`Cannot close task ${taskFile.taskId} — closure gates failed`, 'error');
    for (const f of gateFailures) {
      fmt.message(`  ❌ ${f}`, 'error');
    }
    fmt.message('Remediation:', 'info');
    for (const r of remediation) {
      fmt.message(r, 'info');
    }

    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        current_status: currentStatus,
        gate_failures: gateFailures,
        remediation,
        violations: evidence.violations,
      },
    };
  }

  // All gates passed — mutate
  const now = new Date().toISOString();

  // Write authoritative lifecycle state to SQLite
  if (store) {
    store.updateStatus(taskFile.taskId, 'closed', closedBy, {
      closed_at: now,
      closed_by: closedBy,
      governed_by: `task_close:${closedBy}`,
    });
  }

  // Preserve markdown front matter as compatibility projection
  frontMatter.status = 'closed';
  frontMatter.closed_at = now;
  frontMatter.closed_by = closedBy;
  frontMatter.governed_by = `task_close:${closedBy}`;

  await writeTaskFile(taskFile.path, frontMatter, body);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        new_status: 'closed',
        closed_by: closedBy,
        closed_at: frontMatter.closed_at,
      },
    };
  }

  fmt.message(`Closed task ${taskFile.taskId}`, 'success');
  fmt.kv('Closed by', closedBy);
  fmt.kv('Closed at', String(frontMatter.closed_at));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      task_id: taskFile.taskId,
      task_number: Number(taskNumber),
      new_status: 'closed',
      closed_by: closedBy,
      closed_at: frontMatter.closed_at,
    },
  };
}
