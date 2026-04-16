/**
 * Process Executor
 *
 * Consumes process intents and launches local subprocesses.
 * Durable results are persisted through ProcessExecutionStore.
 *
 * Unified lifecycle:
 * - pending → running → completed (confirmed immediately by exit code)
 * - pending → running → failed (confirmation_failed)
 */

import { spawn } from "node:child_process";
import type { IntentStore } from "../intent/store.js";
import type { ProcessExecutionStore } from "./store.js";
import type { ProcessRunPayload } from "./types.js";
import type { Logger } from "../logging/types.js";

export interface ProcessExecutorDeps {
  intentStore: IntentStore;
  executionStore: ProcessExecutionStore;
  logger?: Logger;
  /** Lease duration in ms (default: 300_000) */
  leaseDurationMs?: number;
  /** Runner identity for lease ownership (default: 'default-runner') */
  runnerId?: string;
}

const MAX_OUTPUT_BYTES = 64 * 1024;

function truncateOutput(data: string): string {
  if (data.length > MAX_OUTPUT_BYTES) {
    return data.slice(0, MAX_OUTPUT_BYTES) + "\n[truncated]";
  }
  return data;
}

function buildResultJson(
  payload: ProcessRunPayload,
  stdout: string,
  stderr: string,
  exitCode: number | null,
): string {
  return JSON.stringify({
    command: payload.command,
    args: payload.args ?? [],
    cwd: payload.cwd ?? null,
    env: payload.env ?? null,
    stdout,
    stderr,
    exit_code: exitCode ?? -1,
  });
}

export class ProcessExecutor {
  constructor(private readonly deps: ProcessExecutorDeps) {}

  /**
   * Process the next eligible process.run intent.
   * Returns whether an intent was processed.
   */
  async processNext(): Promise<{ processed: boolean; executionId?: string }> {
    const pending = this.deps.intentStore.getPendingIntents("process");
    const candidate = pending.find((intent) => intent.intent_type === "process.run");

    if (!candidate) {
      return { processed: false };
    }

    let payload: ProcessRunPayload;
    try {
      payload = JSON.parse(candidate.payload_json) as ProcessRunPayload;
    } catch (parseError) {
      this.deps.logger?.error("Failed to parse process_run payload", parseError as Error, {
        intent_id: candidate.intent_id,
      });
      this.deps.intentStore.updateStatus(candidate.intent_id, "failed_terminal", {
        terminal_reason: "Invalid payload_json",
      });
      return { processed: true };
    }

    if (!payload.command) {
      this.deps.logger?.error("Missing command in process_run payload", undefined, {
        intent_id: candidate.intent_id,
      });
      this.deps.intentStore.updateStatus(candidate.intent_id, "failed_terminal", {
        terminal_reason: "Missing command",
      });
      return { processed: true };
    }

    const executionId = `pe_${candidate.intent_id}_${Date.now()}`;
    const now = new Date().toISOString();

    const leaseDurationMs = this.deps.leaseDurationMs ?? 300_000;
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
    const runnerId = this.deps.runnerId ?? "default-runner";

    this.deps.executionStore.create({
      execution_id: executionId,
      intent_id: candidate.intent_id,
      executor_family: "process",
      phase: "pending",
      confirmation_status: "unconfirmed",
      command: payload.command,
      args_json: JSON.stringify(payload.args ?? []),
      cwd: payload.cwd ?? null,
      env_json: payload.env ? JSON.stringify(payload.env) : null,
      status: "pending",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: null,
      completed_at: null,
      confirmed_at: null,
      error_message: null,
      artifact_id: null,
      result_json: buildResultJson(payload, "", "", null),
      lease_expires_at: null,
      lease_runner_id: null,
    });

    // Mark intent as executing to prevent duplicate execution on retry.
    this.deps.intentStore.updateStatus(candidate.intent_id, "executing", { target_id: executionId });
    this.deps.executionStore.updateStatus(executionId, "running", {
      phase: "running",
      started_at: now,
      lease_expires_at: leaseExpiresAt,
      lease_runner_id: runnerId,
    });

    try {
      const { exitCode, stdout, stderr } = await this.runProcess(payload);
      const completedAt = new Date().toISOString();

      const success = exitCode === 0;
      this.deps.executionStore.updateStatus(executionId, success ? "completed" : "failed", {
        phase: success ? "completed" : "failed",
        confirmation_status: success ? "confirmed" : "confirmation_failed",
        exit_code: exitCode ?? -1,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        completed_at: completedAt,
        confirmed_at: success ? completedAt : null,
        error_message: success ? null : `Process exited with code ${exitCode}`,
        result_json: buildResultJson(payload, truncateOutput(stdout), truncateOutput(stderr), exitCode),
      });

      this.deps.intentStore.updateStatus(candidate.intent_id, success ? "completed" : "failed_terminal", {
        terminal_reason: success ? null : `Process exited with code ${exitCode}`,
      });

      return { processed: true, executionId };
    } catch (execError) {
      const completedAt = new Date().toISOString();
      const message = execError instanceof Error ? execError.message : String(execError);

      this.deps.executionStore.updateStatus(executionId, "failed", {
        phase: "failed",
        confirmation_status: "confirmation_failed",
        exit_code: -1,
        stdout: "",
        stderr: truncateOutput(message),
        completed_at: completedAt,
        error_message: `Execution error: ${message}`,
        result_json: buildResultJson(payload, "", truncateOutput(message), -1),
      });

      this.deps.intentStore.updateStatus(candidate.intent_id, "failed_terminal", {
        terminal_reason: `Execution error: ${message}`,
      });

      return { processed: true, executionId };
    }
  }

  /**
   * Recover stale running executions.
   * Marks them as failed and resets their associated intents to admitted
   * so they can be retried.
   */
  recoverStaleExecutions(now?: string): { executionId: string; intentId: string }[] {
    const recovered = this.deps.executionStore.recoverStaleExecutions(now);
    const result: { executionId: string; intentId: string }[] = [];
    const t = now ?? new Date().toISOString();

    for (const execution of recovered) {
      this.deps.executionStore.updateStatus(execution.execution_id, "failed", {
        phase: "failed",
        confirmation_status: "confirmation_failed",
        exit_code: -1,
        stdout: "",
        stderr: "Recovered stale execution: lease expired",
        completed_at: t,
        error_message: "Recovered stale execution: lease expired",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const intent = this.deps.intentStore.getById(execution.intent_id);
      if (intent && intent.status === "executing") {
        this.deps.intentStore.updateStatus(execution.intent_id, "admitted", {
          terminal_reason: "Recovered stale execution",
        });
      }

      result.push({ executionId: execution.execution_id, intentId: execution.intent_id });
    }

    return result;
  }

  private runProcess(payload: ProcessRunPayload): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(payload.command, payload.args ?? [], {
        cwd: payload.cwd,
        env: payload.env ? { ...process.env, ...payload.env } : process.env,
        timeout: payload.timeout_ms ?? 300_000,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (err) => reject(err));

      child.on("close", (code) => {
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
    });
  }
}
