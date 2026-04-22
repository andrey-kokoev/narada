/**
 * Kimi CLI Browser-Session Charter Runner
 *
 * Adapter that invokes the locally authenticated Kimi CLI (browser-session
 * backed) with a structured prompt derived from the CharterInvocationEnvelope,
 * then parses and validates the response into a CharterOutputEnvelope.
 *
 * The installed Kimi CLI supports non-interactive print mode. This runner uses
 * `--print --final-message-only --prompt` and captures stdout with a timeout.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
} from "./envelope.js";
import {
  validateInvocationEnvelope,
  validateOutputEnvelope,
} from "./envelope.js";
import { validateCharterOutput } from "./validation.js";
import { resolveSystemPrompt } from "./prompts.js";
import type { CharterRunner, RuntimeHooks } from "./runner.js";
import type { CharterRuntimeHealth } from "./health.js";

export interface KimiCliCharterRunnerOptions {
  /** Path to the Kimi CLI executable (default: `kimi` on PATH, then `kimi-cli`) */
  cliPath?: string;
  /** Optional Kimi CLI model override; omitted means use ~/.kimi/config.toml. */
  model?: string;
  /** Session ID to resume */
  sessionId?: string;
  /** Continue the previous session for the working directory */
  continueSession?: boolean;
  /** Working directory for the agent */
  workDir?: string;
  /** Subprocess timeout in ms (default: 120000) */
  timeoutMs?: number;
  /** When 'draft_only', the runner restricts effects to draft-only */
  degradedMode?: "draft_only" | "normal";
}

/** Resolve the Kimi CLI executable path, preferring config then PATH. */
function resolveCliPath(configured?: string): string {
  if (configured) return configured;
  // Default to `kimi` on PATH; the spawn implementation will handle resolution
  return "kimi";
}

/** Check whether the Kimi CLI appears to have a valid browser session. */
function hasBrowserSession(): boolean {
  const credPath = join(homedir(), ".kimi", "credentials", "kimi-code.json");
  // Existence is only a local readiness proxy; the first real CLI invocation
  // remains the authoritative session validity check.
  return existsSync(credPath);
}

export class KimiCliCharterRunner implements CharterRunner {
  constructor(
    private readonly opts: KimiCliCharterRunnerOptions,
    private readonly hooks?: RuntimeHooks,
  ) {}

  async probeHealth(): Promise<CharterRuntimeHealth> {
    if (this.opts.degradedMode === "draft_only") {
      return {
        class: "degraded_draft_only",
        checked_at: new Date().toISOString(),
        details:
          "Runtime is in degraded draft-only mode. All proposed actions require operator approval.",
      };
    }

    const cliPath = resolveCliPath(this.opts.cliPath);

    // Check CLI exists on PATH by running `kimi --version`
    const versionCheck = await new Promise<{
      ok: boolean;
      details: string;
    }>((resolve) => {
      const child = spawn(cliPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => {
        stdout += String(d);
      });
      child.stderr?.on("data", (d) => {
        stderr += String(d);
      });
      child.on("error", () => {
        resolve({ ok: false, details: `CLI executable not found: ${cliPath}` });
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true, details: stdout.trim() });
        } else {
          resolve({ ok: false, details: stderr.trim() || `exit code ${code}` });
        }
      });
    });

    if (!versionCheck.ok) {
      return {
        class: "unconfigured",
        checked_at: new Date().toISOString(),
        details: versionCheck.details,
      };
    }

    if (!hasBrowserSession()) {
      return {
        class: "interactive_auth_required",
        checked_at: new Date().toISOString(),
        details:
          "Kimi CLI is installed but no browser session found. Run `kimi login` to authenticate.",
      };
    }

    return {
      class: "healthy",
      checked_at: new Date().toISOString(),
      details: `Kimi CLI ready: ${versionCheck.details}`,
    };
  }

  async run(
    envelope: CharterInvocationEnvelope,
  ): Promise<CharterOutputEnvelope> {
    validateInvocationEnvelope(envelope);

    const cliPath = resolveCliPath(this.opts.cliPath);
    const prompt = this.buildPrompt(envelope);

    const args: string[] = [];
    if (this.opts.workDir) {
      args.push("--work-dir", this.opts.workDir);
    }
    if (this.opts.sessionId) {
      args.push("--session", this.opts.sessionId);
    }
    if (this.opts.continueSession) {
      args.push("--continue");
    }
    if (this.opts.model) {
      args.push("--model", this.opts.model);
    }
    args.push("--print", "--final-message-only", "--prompt", prompt);

    const timeoutMs = this.opts.timeoutMs ?? 120000;

    return new Promise((resolve, reject) => {
      const child = spawn(cliPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killedByTimeout = false;

      const timeout = setTimeout(() => {
        killedByTimeout = true;
        child.kill("SIGTERM");
        // Force kill after graceful period
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.stdout?.on("data", (d) => {
        stdout += String(d);
      });
      child.stderr?.on("data", (d) => {
        stderr += String(d);
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Kimi CLI: ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timeout);

        if (killedByTimeout) {
          reject(new Error(`Kimi CLI timed out after ${timeoutMs}ms`));
          return;
        }

        // The Kimi CLI TUI may exit with non-zero code even on success.
        // We prioritize finding valid JSON in stdout over checking exit code.
        const json = this.extractJson(stdout);
        if (json) {
          this.handleParsedOutput(json, envelope).then(resolve).catch(reject);
          return;
        }

        // If no JSON was found, infer auth issues from stderr
        const lowerStderr = stderr.toLowerCase();
        const lowerStdout = stdout.toLowerCase();
        if (
          lowerStderr.includes("login") ||
          lowerStderr.includes("auth") ||
          lowerStderr.includes("token") ||
          lowerStderr.includes("credential") ||
          lowerStdout.includes("send /login to login")
        ) {
          reject(
            new Error(
              "Kimi CLI reports authentication required. Run `kimi login`.",
            ),
          );
          return;
        }

        reject(
          new Error(
            `Kimi CLI exited (${code}) with no parseable JSON. stderr: ${stderr.slice(0, 500)}`,
          ),
        );
      });
    });
  }

  /** Build the full prompt (system + user) for the CLI. */
  private buildPrompt(envelope: CharterInvocationEnvelope): string {
    const system = resolveSystemPrompt(envelope);
    const user = this.buildUserPrompt(envelope);
    return `${system}\n\n${user}\n\nRespond with a single JSON object conforming to the CharterOutputEnvelope schema. Do not include markdown code fences or any explanatory text outside the JSON.\n`;
  }

  private buildUserPrompt(envelope: CharterInvocationEnvelope): string {
    const mat = envelope.context_materialization as
      | Record<string, unknown>
      | undefined;

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
            .map(
              (p) =>
                `- ${p.evaluation_id} (${p.charter_id}, ${p.role}): ${p.summary}`,
            )
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

  /** Extract the first JSON object from stdout text. */
  private extractJson(text: string): unknown | null {
    // Try to find JSON between code fences first
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]!.trim());
      } catch {
        // fall through
      }
    }

    // Try to find the first `{ ... }` block that parses as JSON
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // fall through
      }
    }

    return null;
  }

  private async handleParsedOutput(
    raw: unknown,
    envelope: CharterInvocationEnvelope,
  ): Promise<CharterOutputEnvelope> {
    const patched = this.patchOutput(raw, envelope);
    const output = validateOutputEnvelope(patched);

    const validation = validateCharterOutput(output, envelope);
    const effectiveOutcome = validation.corrected_outcome ?? output.outcome;

    const finalOutput: CharterOutputEnvelope = {
      ...output,
      outcome: effectiveOutcome,
    };

    await this.persistArtifacts(finalOutput, envelope);

    return finalOutput;
  }

  private patchOutput(
    raw: unknown,
    envelope: CharterInvocationEnvelope,
  ): unknown {
    if (typeof raw !== "object" || raw === null) {
      return raw;
    }
    const obj = raw as Record<string, unknown>;

    const patchedActions = this.patchProposedActions(obj.proposed_actions);

    return {
      ...obj,
      output_version: obj.output_version ?? "2.0",
      execution_id: obj.execution_id ?? envelope.execution_id,
      charter_id: obj.charter_id ?? envelope.charter_id,
      role: obj.role ?? envelope.role,
      analyzed_at: this.normalizeDatetime(obj.analyzed_at) ?? new Date().toISOString(),
      confidence:
        obj.confidence ?? {
          overall: "low",
          uncertainty_flags: ["missing_confidence"],
        },
      summary: obj.summary ?? "",
      classifications: obj.classifications ?? [],
      facts: this.patchFacts(obj.facts),
      proposed_actions: patchedActions,
      tool_requests: obj.tool_requests ?? [],
      escalations: obj.escalations ?? [],
    };
  }

  private patchProposedActions(
    raw: unknown,
  ): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => {
      if (typeof a !== "object" || a === null) return false;
      const act = a as Record<string, unknown>;
      return (
        typeof act.action_type === "string" &&
        typeof act.authority === "string" &&
        typeof act.payload_json === "string" &&
        typeof act.rationale === "string"
      );
    });
  }

  private patchFacts(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => {
      if (typeof f !== "object" || f === null) return f;
      const fact = f as Record<string, unknown>;
      if (
        typeof fact.value_json === "object" &&
        fact.value_json !== null
      ) {
        return { ...fact, value_json: JSON.stringify(fact.value_json) };
      }
      return fact;
    });
  }

  private normalizeDatetime(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    try {
      const d = new Date(raw.trim());
      if (Number.isNaN(d.getTime())) return undefined;
      return d.toISOString();
    } catch {
      return undefined;
    }
  }

  private async persistArtifacts(
    output: CharterOutputEnvelope,
    envelope: CharterInvocationEnvelope,
  ): Promise<void> {
    if (!this.hooks?.persistTrace) return;
    await this.hooks.persistTrace({
      trace_id: `${envelope.execution_id}:trace`,
      execution_id: envelope.execution_id,
      context_id: envelope.context_id,
      work_item_id: envelope.work_item_id,
      charter_id: envelope.charter_id,
      envelope_json: JSON.stringify(output),
      reasoning_log: output.reasoning_log,
      created_at: new Date().toISOString(),
    });
  }
}
