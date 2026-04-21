/**
 * Sandbox Charter Runtime Attachment
 *
 * Bridges the Cloudflare Sandbox boundary with the Narada charter runtime.
 *
 * - Receives a bounded envelope
 * - Runs charter evaluation inside the sandbox (timeout + memory guards)
 * - Produces a CharterOutputEnvelope
 * - Does NOT execute effects
 * - Does NOT collapse evaluation into decision
 *
 * Real charter runtime (CodexCharterRunner) is feasible on Cloudflare because:
 * - fetch() is available in Workers
 * - Secrets can be bound via env
 * - No Node.js-specific APIs are required
 *
 * For testing, MockCharterRunner is used to avoid live API calls.
 */

import type { SandboxInvocation, SandboxResult } from "./types.js";
import { runSandbox } from "./runner.js";
import type { SandboxPayload } from "./runner.js";
import type {
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
} from "@narada2/charters";
import { MockCharterRunner } from "@narada2/charters";
import type { CharterRunner } from "@narada2/charters";

export interface CharterSandboxResult {
  status: "success" | "error";
  memory_peak_mb: number;
  output_envelope?: CharterOutputEnvelope;
  error_message?: string;
}

/**
 * Build a sandbox payload that runs a charter runner inside bounded execution.
 */
export function createCharterSandboxPayload(
  runner: CharterRunner,
  envelope: CharterInvocationEnvelope,
): SandboxPayload<CharterSandboxResult> {
  return {
    async run(_invocation: SandboxInvocation): Promise<CharterSandboxResult> {
      try {
        const output = await runner.run(envelope);
        // Estimate memory: base 5MB + 1MB per 10KB of JSON envelope
        const envelopeSize = JSON.stringify(envelope).length;
        const memoryPeak = 5 + Math.ceil(envelopeSize / 10_000);
        return {
          status: "success",
          memory_peak_mb: memoryPeak,
          output_envelope: output,
        };
      } catch (error) {
        const memoryPeak = 5 + Math.ceil(JSON.stringify(envelope).length / 10_000);
        return {
          status: "error",
          memory_peak_mb: memoryPeak,
          error_message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Run charter evaluation inside the Cloudflare Sandbox boundary.
 *
 * Returns a SandboxResult. On success, `output_json` contains a
 * CharterSandboxResult with the output envelope.
 */
export async function runCharterInSandbox(
  runner: CharterRunner,
  envelope: CharterInvocationEnvelope,
  timeoutMs: number = 30_000,
  maxMemoryMb: number = 128,
): Promise<SandboxResult> {
  const invocation: SandboxInvocation = {
    charter_id: envelope.charter_id,
    envelope_json: JSON.stringify(envelope),
    timeout_ms: timeoutMs,
    max_memory_mb: maxMemoryMb,
  };

  const payload = createCharterSandboxPayload(runner, envelope);
  return runSandbox(invocation, payload);
}

/**
 * Create a mock charter runner for testing without live API calls.
 *
 * This proves that the sandbox attachment path works without
 * requiring real credentials or network access.
 */
export function createMockCharterRunnerForSandbox(): CharterRunner {
  return new MockCharterRunner({ delayMs: 5 });
}
