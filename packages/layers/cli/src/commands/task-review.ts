import { resolve } from 'node:path';
import { type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import { reviewTaskService, type ReviewTaskServiceOptions, type ReviewTaskServiceResponse } from '@narada2/task-governance/task-review-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  resolvePrincipalStateDir,
  updatePrincipalRuntimeFromTaskEvent,
} from '../lib/principal-bridge.js';
import {
  captureTaskLifecycleEvidenceState,
  writeTaskLifecycleMutationEvidence,
} from '../lib/mutation-evidence-writer.js';
import {
  routeReviewReplyObligation,
  type ReviewReplyFinding,
  type ReviewReplyObligationResult,
} from '../lib/task-review-reply-obligation.js';
import { operatorSurfaceTaskAuthorityRepair } from '../lib/operator-surface-task-authority.js';

const GENERATED_ARTIFACT_AUTHORITY_HUMAN_NOTE =
  'Generated review/report artifacts are not self-authorizing; authority requires lifecycle admission, reviewer identity, task evidence verdict, and closure status.';

export interface TaskReviewOptions {
  taskNumber?: string;
  format?: 'json' | 'human' | 'auto';
  agent?: string;
  verdict?: 'accepted' | 'accepted_with_notes' | 'rejected';
  findings?: string;
  report?: string;
  noCapaReason?: string;
  cwd?: string;
  principalStateDir?: string;
  store?: TaskLifecycleStore;
}

export async function taskReviewCommand(
  options: TaskReviewOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const before = await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, options.store);

  const serviceResult = await reviewTaskService({
    taskNumber: options.taskNumber,
    agent: options.agent,
    verdict: options.verdict,
    findings: options.findings,
    report: options.report,
    noCapaReason: options.noCapaReason,
    cwd,
    store: options.store,
  } as ReviewTaskServiceOptions);

  const result = serviceResult.result;
  if (result.status === 'error') {
    const taskAuthorityRepair = await operatorSurfaceTaskAuthorityRepair(cwd, options.agent);
    if (taskAuthorityRepair) {
      const mutable = result as ReviewTaskServiceResponse['result'] & {
        operator_surface_task_authority?: typeof taskAuthorityRepair;
      };
      mutable.operator_surface_task_authority = taskAuthorityRepair;
      if (mutable.review_authority_repair) {
        mutable.review_authority_repair = {
          ...mutable.review_authority_repair,
          commands: [
            taskAuthorityRepair.repair_command,
            `narada task review ${options.taskNumber ?? '<task-number>'} --agent ${taskAuthorityRepair.identity_id} --verdict <accepted|accepted_with_notes|rejected>`,
          ],
        };
      }
    }
  }
  if (result.status === 'success') {
    const reviewReply = await routeReviewReplyObligation({
      cwd,
      taskNumber: options.taskNumber,
      taskId: result.task_id,
      reviewer: options.agent,
      verdict: result.verdict,
      reviewId: result.review_id,
      admissionId: result.admission_id,
      newStatus: result.new_status,
      closeAction: result.close_action,
      evidenceBlocked: result.evidence_blocked,
      evidenceReason: result.evidence_reason,
      closeBlockers: result.close_blockers,
      findings: parseReviewReplyFindings(options.findings),
    });
    if (reviewReply.status !== 'not_applicable') {
      (result as ReviewTaskServiceResponse['result'] & { review_reply_obligation?: ReviewReplyObligationResult }).review_reply_obligation = reviewReply;
    }
  }
  const after = result.status === 'success'
    ? await captureTaskLifecycleEvidenceState(cwd, options.taskNumber, options.store)
    : null;
  if (result.status === 'success') {
    await writeTaskLifecycleMutationEvidence({
      cwd,
      taskNumber: options.taskNumber,
      command: 'task review',
      principal: options.agent,
      authorityClass: 'confirm',
      before,
      after,
      result,
    });
  }

  if (fmt.getFormat() === 'json') {
    if (result.status === 'success' && result.verdict) {
      try {
        const stateDir = resolvePrincipalStateDir({ cwd, principalStateDir: options.principalStateDir });
        const bridgeResult = await updatePrincipalRuntimeFromTaskEvent(stateDir, {
          type: result.verdict === 'rejected' ? 'task_review_rejected' : 'task_review_accepted',
          agent_id: options.agent ?? '',
          task_id: result.task_id ?? '',
          review_id: result.review_id ?? '',
        });
        if (bridgeResult.warning && !('evidence_blocked' in result)) {
          const output = { ...(result as Record<string, unknown>) } as ReviewTaskServiceResponse['result'] & { warning?: string };
          output.warning = bridgeResult.warning;
          return {
            exitCode: serviceResult.exitCode,
            result: output,
          };
        }
      } catch {
        // advisory only
      }
    }
    return {
      exitCode: serviceResult.exitCode,
      result,
    };
  }

  const emitReviewDiagnostics = () => {
    const diagnostics = (result as {
      review_diagnostics?: {
        findings?: Array<{
          index: number;
          posture: string;
          authority_class: string;
          blocking: boolean;
          compatibility_only: boolean;
          projection_only: boolean;
        }>;
      };
    }).review_diagnostics;
    if (!diagnostics?.findings?.length) return;
    const summary = diagnostics.findings
      .map((finding) => {
        const flags = [
          finding.blocking ? 'blocking' : 'non-blocking',
          finding.compatibility_only ? 'compatibility-only' : null,
          finding.projection_only ? 'projection-only' : null,
        ].filter(Boolean).join('/');
        return `#${finding.index + 1} ${finding.posture} ${finding.authority_class} (${flags})`;
      })
      .join('; ');
    fmt.message(`Review diagnostics: ${summary}`, 'info');
  };
  const emitReviewReplyObligation = () => {
    const reply = (result as { review_reply_obligation?: ReviewReplyObligationResult }).review_reply_obligation;
    if (!reply) return;
    const target = reply.requester_identity ? ` to ${reply.requester_identity}` : '';
    const evidence = reply.queue_artifact ?? reply.inbox_envelope_id ?? reply.reason ?? 'no evidence';
    fmt.message(`Review reply: ${reply.status}${target} (${evidence})`, reply.status === 'failed' ? 'warning' : 'info');
  };

  if (serviceResult.exitCode !== ExitCode.SUCCESS) {
    fmt.message((result as { error?: string }).error ?? 'Review failed', 'error');
    const repair = (result as { review_authority_repair?: { commands: string[]; no_workaround: string } }).review_authority_repair;
    const capa = (result as { capa_recommendation?: { recommended: boolean; triggers: string[]; next_command?: string } }).capa_recommendation;
    if (repair) {
      fmt.message(repair.no_workaround, 'warning');
      for (const command of repair.commands) fmt.message(command, 'info');
    }
    const taskAuthority = (result as { operator_surface_task_authority?: { repair_command: string } }).operator_surface_task_authority;
    if (taskAuthority) {
      fmt.message(`Task authority repair: ${taskAuthority.repair_command}`, 'info');
    }
    if (capa?.recommended) {
      fmt.message(`CAPA recommended: ${capa.triggers.join(', ')}`, 'warning');
      if (capa.next_command) fmt.message(capa.next_command, 'info');
    }
  } else if (result.status === 'success' && 'new_status' in result) {
    const target = (result as { verdict: string; new_status: string }).new_status;
    const evidenceBlocked = (result as { evidence_blocked?: boolean }).evidence_blocked;
    const capa = (result as { capa_recommendation?: { recommended: boolean; triggers: string[]; next_command?: string } }).capa_recommendation;
    if (evidenceBlocked) {
      fmt.message(`Reviewed task ${String((result as { task_id?: string }).task_id)}: ${(result as { verdict: string }).verdict} → ${target} (evidence gate blocked)`, 'warning');
    } else {
      fmt.message(`Reviewed task ${String((result as { task_id?: string }).task_id)}: ${(result as { verdict: string }).verdict} → ${target}`, 'success');
    }
    fmt.message(GENERATED_ARTIFACT_AUTHORITY_HUMAN_NOTE, 'info');
    emitReviewDiagnostics();
    emitReviewReplyObligation();
    if (capa?.recommended) {
      fmt.message(`CAPA recommended: ${capa.triggers.join(', ')}`, 'warning');
      if (capa.next_command) fmt.message(capa.next_command, 'info');
    }
  }

  return {
    exitCode: serviceResult.exitCode,
    result,
  };
}

function parseReviewReplyFindings(raw: string | undefined): ReviewReplyFinding[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (typeof record.severity !== 'string' || typeof record.description !== 'string') return [];
      return [{
        severity: record.severity,
        description: record.description,
        location: typeof record.location === 'string' ? record.location : null,
      }];
    });
  } catch {
    return [];
  }
}
