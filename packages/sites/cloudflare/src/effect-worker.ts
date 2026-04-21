/**
 * Effect Worker State Machine (Task 359)
 *
 * Approved-only effect execution worker for Cloudflare Site.
 * This module implements the internal state machine before binding to a live
 * mutating external API (Task 360).
 *
 * Rules:
 * - Only commands with status = "approved_for_send" are eligible.
 * - Only action_type = "send_reply" is allowed for this chapter.
 * - An execution attempt record is created before calling the adapter.
 * - The worker never transitions to "confirmed"; that is Task 362.
 * - The worker does not call Graph or send email directly.
 */

import type { ExecutionAttemptRecord, EffectWorkerResult } from "./types.js";

/** Adapter boundary that performs the actual external effect. */
export interface EffectExecutionAdapter {
  attemptEffect(command: {
    outboundId: string;
    scopeId: string;
    actionType: string;
    payloadJson: string | null;
    internetMessageId: string | null;
  }): Promise<{
    status: "submitted" | "failed_retryable" | "failed_terminal";
    externalRef?: string;
    errorCode?: string;
    errorMessage?: string;
    responseJson?: string;
  }>;
}

/** Context abstraction for storage operations (matches CycleCoordinator subset). */
export interface EffectWorkerContext {
  getApprovedOutboundCommands(): {
    outboundId: string;
    contextId: string;
    scopeId: string;
    actionType: string;
    status: string;
    payloadJson: string | null;
    internetMessageId: string | null;
  }[];
  getExecutionAttemptsForOutbound(outboundId: string): ExecutionAttemptRecord[];
  insertExecutionAttempt(
    attempt: Omit<ExecutionAttemptRecord, "finishedAt">,
  ): void;
  updateExecutionAttemptStatus(
    executionAttemptId: string,
    status: string,
    updates?: {
      errorCode?: string | null;
      errorMessage?: string | null;
      responseJson?: string | null;
      externalRef?: string | null;
      finishedAt?: string;
    },
  ): void;
  updateOutboundCommandStatus(outboundId: string, status: string): void;
  getHealth?(): { status: string };
}

const ALLOWED_ACTION_TYPES = new Set<string>(["send_reply"]);

/**
 * Execute all approved outbound commands through the given adapter.
 *
 * Each command flows through:
 *   approved_for_send → attempting (record) → adapter → submitted | failed_retryable | failed_terminal
 */
export async function executeApprovedCommands(
  ctx: EffectWorkerContext,
  adapter: EffectExecutionAdapter,
  options?: {
    workerId?: string;
    leaseTtlMs?: number;
    now?: string;
  },
): Promise<EffectWorkerResult> {
  const workerId = options?.workerId ?? "effect-worker";
  const leaseTtlMs = options?.leaseTtlMs ?? 60_000;
  const nowIso = options?.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();

  const result: EffectWorkerResult = {
    attempted: 0,
    submitted: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    skipped: 0,
    residuals: [],
  };

  // Health gate: do not attempt effects if auth has failed
  if (ctx.getHealth && ctx.getHealth().status === "auth_failed") {
    result.residuals.push("auth_failed_health_blocked");
    return result;
  }

  const commands = ctx.getApprovedOutboundCommands();
  if (commands.length === 0) {
    result.residuals.push("no_approved_commands");
    return result;
  }

  for (const cmd of commands) {
    // Action-type gate: only allowed actions for this chapter
    if (!ALLOWED_ACTION_TYPES.has(cmd.actionType)) {
      result.skipped++;
      result.residuals.push(`skipped_unallowed_action_type_${cmd.outboundId}`);
      continue;
    }

    // Lease gate: skip if an unreleased attempt lease exists
    const attempts = ctx.getExecutionAttemptsForOutbound(cmd.outboundId);
    const hasActiveLease = attempts.some(
      (a) =>
        a.status === "attempting" &&
        a.leaseExpiresAt != null &&
        new Date(a.leaseExpiresAt).getTime() > nowMs,
    );
    if (hasActiveLease) {
      result.skipped++;
      result.residuals.push(`skipped_active_lease_${cmd.outboundId}`);
      continue;
    }

    // Create execution attempt record before calling adapter
    const executionAttemptId = `attempt-${cmd.outboundId}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
    const leaseExpiresAt = new Date(nowMs + leaseTtlMs).toISOString();

    ctx.insertExecutionAttempt({
      executionAttemptId,
      outboundId: cmd.outboundId,
      actionType: cmd.actionType,
      attemptedAt: nowIso,
      status: "attempting",
      errorCode: null,
      errorMessage: null,
      responseJson: null,
      externalRef: null,
      workerId,
      leaseExpiresAt,
    });

    result.attempted++;

    try {
      const adapterResult = await adapter.attemptEffect({
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        actionType: cmd.actionType,
        payloadJson: cmd.payloadJson,
        internetMessageId: cmd.internetMessageId,
      });

      const finishedAt = new Date().toISOString();

      ctx.updateExecutionAttemptStatus(executionAttemptId, adapterResult.status, {
        errorCode: adapterResult.errorCode ?? null,
        errorMessage: adapterResult.errorMessage ?? null,
        responseJson: adapterResult.responseJson ?? null,
        externalRef: adapterResult.externalRef ?? null,
        finishedAt,
      });

      ctx.updateOutboundCommandStatus(cmd.outboundId, adapterResult.status);

      if (adapterResult.status === "submitted") {
        result.submitted++;
        result.residuals.push(`submitted_${cmd.outboundId}`);
      } else if (adapterResult.status === "failed_retryable") {
        result.failedRetryable++;
        result.residuals.push(`failed_retryable_${cmd.outboundId}`);
      } else if (adapterResult.status === "failed_terminal") {
        result.failedTerminal++;
        result.residuals.push(`failed_terminal_${cmd.outboundId}`);
      }
    } catch (error) {
      // Adapter threw unexpectedly — record as retryable and let next cycle retry
      const finishedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);

      ctx.updateExecutionAttemptStatus(executionAttemptId, "failed_retryable", {
        errorCode: "WORKER_EXCEPTION",
        errorMessage,
        finishedAt,
      });

      ctx.updateOutboundCommandStatus(cmd.outboundId, "failed_retryable");
      result.failedRetryable++;
      result.residuals.push(`failed_retryable_exception_${cmd.outboundId}`);
    }
  }

  return result;
}
