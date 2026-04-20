/**
 * Codex Charter Runner
 *
 * Adapter that invokes an OpenAI-compatible chat completions API
 * (e.g., Codex, GPT-4) with a structured prompt derived from the
 * CharterInvocationEnvelope, then parses and validates the response
 * into a CharterOutputEnvelope.
 *
 * Spec: .ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md
 */

import type {
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
} from "./envelope.js";
import { validateInvocationEnvelope, validateOutputEnvelope } from "./envelope.js";
import { validateCharterOutput } from "./validation.js";
import { resolveSystemPrompt } from "./prompts.js";
import type { CharterRuntimeHealth } from "./health.js";

export interface CodexCharterRunnerOptions {
  /** OpenAI API key (or compatible service) */
  apiKey: string;
  /** Model to use (default: gpt-4o-mini) */
  model?: string;
  /** API base URL (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** When 'draft_only', probeHealth returns degraded_draft_only */
  degradedMode?: "draft_only" | "normal";
}

export interface TraceRecord {
  trace_id: string;
  execution_id: string;
  context_id: string;
  work_item_id: string;
  charter_id: string;
  envelope_json: string;
  reasoning_log?: string;
  created_at: string;
}

/**
 * Runner-side hooks for non-authoritative observability.
 *
 * Evaluation persistence is NOT a runner hook — it belongs to the runtime
 * integration layer (daemon dispatch) which calls `persistEvaluation()`
 * from `@narada2/control-plane` before `foreman.resolveWorkItem()`.
 *
 * Trace persistence may remain here as runner-adjacent commentary capture.
 */
export interface RuntimeHooks {
  persistTrace?(trace: TraceRecord): void | Promise<void>;
}

export interface CharterRunner {
  run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope>;
  probeHealth(): Promise<CharterRuntimeHealth>;
}

export class CodexCharterRunner implements CharterRunner {
  constructor(
    private readonly opts: CodexCharterRunnerOptions,
    private readonly hooks?: RuntimeHooks,
  ) {}

  async probeHealth(): Promise<CharterRuntimeHealth> {
    if (this.opts.degradedMode === "draft_only") {
      return {
        class: "degraded_draft_only",
        checked_at: new Date().toISOString(),
        details: "Runtime is in degraded draft-only mode. All proposed actions require operator approval.",
      };
    }

    const baseUrl = (this.opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          class: "broken",
          checked_at: new Date().toISOString(),
          details: `Authentication failed (${response.status}). API key is invalid or expired.`,
        };
      }

      if (response.status === 429) {
        return {
          class: "partially_degraded",
          checked_at: new Date().toISOString(),
          details: "Rate-limited by API provider. Execution will retry with normal backoff.",
        };
      }

      if (response.status >= 500) {
        return {
          class: "partially_degraded",
          checked_at: new Date().toISOString(),
          details: `API server error (${response.status}). Provider may be experiencing issues.`,
        };
      }

      if (!response.ok) {
        return {
          class: "broken",
          checked_at: new Date().toISOString(),
          details: `API health probe failed with status ${response.status}.`,
        };
      }

      return {
        class: "healthy",
        checked_at: new Date().toISOString(),
        details: `API reachable. Model: ${this.opts.model ?? "gpt-4o-mini"}.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === "AbortError") {
        return {
          class: "partially_degraded",
          checked_at: new Date().toISOString(),
          details: `API health probe timed out after 5s. ${msg}`,
        };
      }
      return {
        class: "broken",
        checked_at: new Date().toISOString(),
        details: `API health probe failed: ${msg}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
    validateInvocationEnvelope(envelope);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? 30000,
    );

    try {
      const response = await fetch(
        `${(this.opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify({
            model: this.opts.model ?? "gpt-4o-mini",
            messages: [
              { role: "system", content: resolveSystemPrompt(envelope) },
              { role: "user", content: this.buildUserPrompt(envelope) },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Codex API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Codex API returned empty content");
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        throw new Error("Codex API returned unparseable JSON");
      }

      // Inject required identity fields if missing
      const patched = this.patchOutput(raw, envelope);
      const output = validateOutputEnvelope(patched);

      // Apply foreman validation rules
      const validation = validateCharterOutput(output, envelope);
      const effectiveOutcome = validation.corrected_outcome ?? output.outcome;

      const finalOutput: CharterOutputEnvelope = {
        ...output,
        outcome: effectiveOutcome,
      };

      await this.persistArtifacts(finalOutput, envelope);

      return finalOutput;
    } finally {
      clearTimeout(timeout);
    }
  }

  // buildSystemPrompt removed — prompt resolution is now handled by
  // resolveSystemPrompt() in ./prompts.ts, which supports charter-specific
  // templates via the PROMPT_REGISTRY. Unknown charter IDs fall back to
  // the generic template.

  private buildUserPrompt(envelope: CharterInvocationEnvelope): string {
    const mat = envelope.context_materialization as Record<string, unknown> | undefined;

    // Best-effort formatting if materialization contains messages (common to mail vertical)
    let contextBody: string;
    if (mat && Array.isArray(mat.messages)) {
      const messages = (mat.messages as Array<Record<string, unknown>>)
        .map(
          (m) =>
            `[${m.received_at ?? "unknown"}] ${JSON.stringify(m.from ?? "unknown")}: ${m.subject ?? "(no subject)"}\n${m.body_preview ?? ""}`,
        )
        .join("\n---\n");
      contextBody = `Context messages:\n${messages}`;
    } else {
      contextBody = `Context materialization:\n${JSON.stringify(envelope.context_materialization, null, 2)}`;
    }

    const priors =
      envelope.prior_evaluations.length > 0
        ? envelope.prior_evaluations
            .map((p) => `- ${p.evaluation_id} (${p.charter_id}, ${p.role}): ${p.summary}`)
            .join("\n")
        : "(none)";

    return `
Scope: ${envelope.scope_id}
Context: ${envelope.context_id}
Revision: ${envelope.revision_id}
Work item: ${envelope.work_item_id}
Execution: ${envelope.execution_id}
Coordinator flags: ${envelope.coordinator_flags.join(", ") || "(none)"}

${contextBody}

Prior evaluations (up to ${envelope.max_prior_evaluations}):
${priors}
`.trim();
  }

  private patchOutput(raw: unknown, envelope: CharterInvocationEnvelope): unknown {
    if (typeof raw !== "object" || raw === null) {
      return raw;
    }
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      output_version: obj.output_version ?? "2.0",
      execution_id: obj.execution_id ?? envelope.execution_id,
      charter_id: obj.charter_id ?? envelope.charter_id,
      role: obj.role ?? envelope.role,
      analyzed_at: obj.analyzed_at ?? new Date().toISOString(),
    };
  }

  private async persistArtifacts(
    output: CharterOutputEnvelope,
    envelope: CharterInvocationEnvelope,
  ): Promise<void> {
    const now = new Date().toISOString();

    if (this.hooks?.persistTrace) {
      const trace: TraceRecord = {
        trace_id: `trace_${envelope.execution_id}`,
        execution_id: envelope.execution_id,
        context_id: envelope.context_id,
        work_item_id: envelope.work_item_id,
        charter_id: envelope.charter_id,
        envelope_json: JSON.stringify(output),
        reasoning_log: output.reasoning_log,
        created_at: now,
      };
      await Promise.resolve(this.hooks.persistTrace(trace));
    }
  }
}
