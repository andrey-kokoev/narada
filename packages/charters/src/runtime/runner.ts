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
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
  AllowedAction,
} from "./envelope.js";
import { validateInvocationEnvelope, validateOutputEnvelope } from "./envelope.js";
import { validateCharterOutput } from "./validation.js";

export interface CodexCharterRunnerOptions {
  /** OpenAI API key (or compatible service) */
  apiKey: string;
  /** Model to use (default: gpt-4o-mini) */
  model?: string;
  /** API base URL (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

export interface EvaluationRecord {
  evaluation_id: string;
  execution_id: string;
  work_item_id: string;
  conversation_id: string;
  charter_id: string;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  outcome: CharterOutputEnvelope["outcome"];
  confidence: CharterOutputEnvelope["confidence"];
  summary: string;
  classifications: CharterClassification[];
  facts: ExtractedFact[];
  recommended_action_class?: AllowedAction;
  proposed_actions: ProposedAction[];
  tool_requests: ToolInvocationRequest[];
  escalations: EscalationProposal[];
}

export interface TraceRecord {
  trace_id: string;
  execution_id: string;
  envelope_json: string;
  reasoning_log?: string;
  created_at: string;
}

export interface RuntimeHooks {
  persistEvaluation?(evaluation: EvaluationRecord): void | Promise<void>;
  persistTrace?(trace: TraceRecord): void | Promise<void>;
}

export interface CharterRunner {
  run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope>;
}

export class CodexCharterRunner implements CharterRunner {
  constructor(
    private readonly opts: CodexCharterRunnerOptions,
    private readonly hooks?: RuntimeHooks,
  ) {}

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
              { role: "system", content: this.buildSystemPrompt(envelope) },
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

  private buildSystemPrompt(envelope: CharterInvocationEnvelope): string {
    const tools = envelope.available_tools
      .map((t) => `- ${t.tool_id}: ${t.description} (read_only=${t.read_only}, timeout=${t.timeout_ms}ms)`)
      .join("\n") || "(none)";

    return `
You are a mailbox charter agent. Your charter_id is "${envelope.charter_id}" and your role is "${envelope.role}".
You MUST respond with a single JSON object matching the CharterOutputEnvelope schema.

Rules:
- output_version must be "2.0"
- execution_id must be "${envelope.execution_id}"
- charter_id must be "${envelope.charter_id}"
- role must be "${envelope.role}"
- outcome must be one of: complete, clarification_needed, escalation, no_op
- proposed_actions may only use action types from: ${envelope.allowed_actions.join(", ") || "(none)"}
- tool_requests may only use tool_ids from: ${envelope.available_tools.map((t) => t.tool_id).join(", ") || "(none)"}
- summary must be 500 characters or fewer
- Each rationale must be 1000 characters or fewer
- Do not include markdown formatting outside the JSON object

Available tools:
${tools}
`.trim();
  }

  private buildUserPrompt(envelope: CharterInvocationEnvelope): string {
    const messages = envelope.thread_context.messages
      .map(
        (m) =>
          `[${m.received_at ?? "unknown"}] ${m.from.map((f) => f.email ?? "unknown").join(", ")}: ${m.subject ?? "(no subject)"}\n${m.body_preview ?? ""}`,
      )
      .join("\n---\n");

    const priors =
      envelope.prior_evaluations.length > 0
        ? envelope.prior_evaluations
            .map((p) => `- ${p.evaluation_id} (${p.charter_id}, ${p.role}): ${p.summary}`)
            .join("\n")
        : "(none)";

    return `
Mailbox: ${envelope.mailbox_id}
Conversation: ${envelope.conversation_id}
Revision: ${envelope.revision_id}
Work item: ${envelope.work_item_id}
Execution: ${envelope.execution_id}
Coordinator flags: ${envelope.coordinator_flags.join(", ") || "(none)"}

Thread messages:
${messages}

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

    if (this.hooks?.persistEvaluation) {
      const evaluation: EvaluationRecord = {
        evaluation_id: `eval_${envelope.execution_id}`,
        execution_id: envelope.execution_id,
        work_item_id: envelope.work_item_id,
        conversation_id: envelope.conversation_id,
        charter_id: envelope.charter_id,
        role: envelope.role,
        output_version: output.output_version,
        analyzed_at: output.analyzed_at,
        outcome: output.outcome,
        confidence: output.confidence,
        summary: output.summary,
        classifications: output.classifications,
        facts: output.facts,
        recommended_action_class: output.recommended_action_class,
        proposed_actions: output.proposed_actions,
        tool_requests: output.tool_requests,
        escalations: output.escalations,
      };
      await Promise.resolve(this.hooks.persistEvaluation(evaluation));
    }

    if (this.hooks?.persistTrace) {
      const trace: TraceRecord = {
        trace_id: `trace_${envelope.execution_id}`,
        execution_id: envelope.execution_id,
        envelope_json: JSON.stringify(output),
        reasoning_log: output.reasoning_log,
        created_at: now,
      };
      await Promise.resolve(this.hooks.persistTrace(trace));
    }
  }
}
