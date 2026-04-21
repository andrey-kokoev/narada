/**
 * Mock Sandbox Runner — Proof Spike for Task 326.
 *
 * Simulates bounded execution inside a Cloudflare Sandbox/Container.
 * In v0 this is a mock; the real Container/Sandbox runtime is deferred.
 *
 * Enforces:
 * - timeout_ms hard limit (Promise.race with a timer)
 * - max_memory_mb limit (payload reports peak; runner rejects if exceeded)
 *
 * Returns structured SandboxResult with CycleSmokeResult output.
 */

import type {
  SandboxInvocation,
  SandboxResult,
  CycleSmokeResult,
} from "./types.js";

export interface SandboxPayload<R = CycleSmokeResult> {
  run(invocation: SandboxInvocation): Promise<R>;
}

/**
 * Run a bounded payload inside the mock sandbox.
 *
 * @param invocation — sandbox bounds and payload input
 * @param payload — the payload to execute (mock for v0)
 * @returns SandboxResult with status, output, and duration
 */
export async function runSandbox<R extends { status: SandboxResult["status"]; memory_peak_mb: number }>(
  invocation: SandboxInvocation,
  payload: SandboxPayload<R>,
): Promise<SandboxResult> {
  const start = performance.now();

  // Timeout guard
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("sandbox_timeout"));
    }, invocation.timeout_ms);
  });

  try {
    const result = await Promise.race([
      payload.run(invocation),
      timeoutPromise,
    ]);

    const duration = Math.round(performance.now() - start);

    // Memory guard
    if (result.memory_peak_mb > invocation.max_memory_mb) {
      return {
        status: "oom",
        duration_ms: duration,
        error_message: `Memory limit exceeded: ${result.memory_peak_mb}MB > ${invocation.max_memory_mb}MB`,
      };
    }

    return {
      status: result.status,
      output_json: JSON.stringify(result),
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - start);

    if (error instanceof Error && error.message === "sandbox_timeout") {
      return {
        status: "timeout",
        duration_ms: duration,
        error_message: `Execution timed out after ${invocation.timeout_ms}ms`,
      };
    }

    return {
      status: "error",
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * A simple cycle-smoke payload that proves startup, input passing,
 * output capture, and simulated resource tracking.
 */
export const cycleSmokePayload: SandboxPayload = {
  async run(invocation: SandboxInvocation): Promise<CycleSmokeResult> {
    const start = performance.now();
    const phases: string[] = ["startup", "parse_input"];

    // Simulate a small amount of work
    await new Promise((resolve) => setTimeout(resolve, 5));

    phases.push("execute");

    // Simulate memory tracking (mock: base 10MB + envelope length factor)
    const envelopeSize = invocation.envelope_json.length;
    const memoryPeak = 10 + Math.ceil(envelopeSize / 1000);

    phases.push("capture_output");

    const payloadDuration = Math.round(performance.now() - start);

    return {
      status: "success",
      phases_run: phases,
      duration_ms: payloadDuration,
      memory_peak_mb: memoryPeak,
    };
  },
};
