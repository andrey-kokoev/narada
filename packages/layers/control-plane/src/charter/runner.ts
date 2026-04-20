/**
 * Charter Runner Interface
 *
 * Abstract interface for charter runtime implementations.
 */

import type { CharterInvocationEnvelope, CharterOutputEnvelope } from "../foreman/types.js";

export interface CharterRunner {
  run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope>;
  probeHealth(): Promise<import("@narada2/charters").CharterRuntimeHealth>;
}

export interface MockCharterRunnerOptions {
  /** Fixed output to return for every run */
  output?: CharterOutputEnvelope;
  /** Delay in ms before resolving */
  delayMs?: number;
  /** Optional hook to inspect or modify the invocation envelope */
  onRun?: (envelope: CharterInvocationEnvelope) => void;
}

export class MockCharterRunner implements CharterRunner {
  constructor(private readonly opts: MockCharterRunnerOptions = {}) {}

  async probeHealth(): Promise<import("@narada2/charters").CharterRuntimeHealth> {
    return {
      class: "unconfigured",
      checked_at: new Date().toISOString(),
      details:
        "Mock runtime is active. No real executor is attached. Configure `charter.runtime` to 'codex-api' or 'kimi-api' with a valid API key to enable real charter execution.",
    };
  }

  async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
    this.opts.onRun?.(envelope);

    if (this.opts.delayMs && this.opts.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs));
    }

    if (this.opts.output) {
      return {
        ...this.opts.output,
        execution_id: envelope.execution_id,
      };
    }

    return {
      output_version: "2.0",
      execution_id: envelope.execution_id,
      charter_id: envelope.charter_id,
      role: envelope.role,
      analyzed_at: new Date().toISOString(),
      outcome: "no_op",
      confidence: { overall: "high", uncertainty_flags: [] },
      summary: "Mock charter runner: no action taken",
      classifications: [],
      facts: [],
      proposed_actions: [],
      tool_requests: [],
      escalations: [],
    };
  }
}
