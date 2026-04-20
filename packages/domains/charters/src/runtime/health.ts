/**
 * Charter Runtime Health — degraded-state contract for real executor attachment.
 *
 * Defines explicit health classes that describe where in the executor path
 * the system stands, and concrete recovery guidance for operators.
 */

/**
 * Degraded-state classes for charter runtime health.
 *
 * - unconfigured: No real executor is attached (mock runtime or missing API key).
 * - healthy: Real executor is configured and responding normally.
 * - degraded_draft_only: Executor works but effects are restricted to draft-only.
 * - partially_degraded: Executor is experiencing intermittent issues (timeouts,
 *   rate limits). Inspection and replay still work; live execution retries with
 *   extended backoff.
 * - broken: Executor is unreachable or authentication is invalid. Requires
 *   operator intervention.
 */
export type CharterRuntimeHealthClass =
  | "unconfigured"
  | "healthy"
  | "degraded_draft_only"
  | "partially_degraded"
  | "broken";

/** Canonical health snapshot for a charter runtime. */
export interface CharterRuntimeHealth {
  class: CharterRuntimeHealthClass;
  checked_at: string;
  details: string;
}

/** Concrete recovery guidance tied to each degraded-state class. */
export interface RecoveryGuidance {
  /** What the operator should fix. */
  operator_action: string;
  /** What Narada will still do safely in this state. */
  safe_behavior: string;
  /** What remains inspectable during degradation. */
  inspectable: string;
}

/**
 * Return concrete recovery guidance for a given health class.
 *
 * This is the canonical operator-facing advice surface. Every UI, CLI, and
 * observability tool that presents degraded state should derive its copy from
 * this function to keep guidance consistent.
 */
export function getRecoveryGuidance(
  healthClass: CharterRuntimeHealthClass,
): RecoveryGuidance {
  switch (healthClass) {
    case "unconfigured":
      return {
        operator_action:
          "Configure a real charter runtime in config.json: set `charter.runtime` to 'codex-api' or 'kimi-api' and provide an API key via `charter.api_key` or the `NARADA_OPENAI_API_KEY` / `NARADA_KIMI_API_KEY` environment variable.",
        safe_behavior:
          "In production, Narada will skip charter execution when the runtime is unconfigured. Work items remain opened and will be executed once a real runtime is attached. Sync continues normally.",
        inspectable:
          "All observation surfaces remain available: `narada status`, `narada doctor`, and the operator UI continue to show work items, facts, and timelines.",
      };
    case "healthy":
      return {
        operator_action: "No action required.",
        safe_behavior:
          "Full charter execution path is operational. Draft-first effect boundary remains enforced.",
        inspectable:
          "All surfaces operational.",
      };
    case "degraded_draft_only":
      return {
        operator_action:
          "Review the charter runtime configuration. If `charter.degraded_mode` is set to 'draft_only', remove it to restore full capability. If the API reports model deprecation, update `charter.model`.",
        safe_behavior:
          "Charter execution continues, but all proposed actions require explicit operator approval. No autonomous send, move, or delete effects will be created.",
        inspectable:
          "Evaluations, decisions, and draft previews are fully visible. Operator can review and approve or reject each proposed action individually.",
      };
    case "partially_degraded":
      return {
        operator_action:
          "Monitor API health. If rate-limiting persists, consider increasing `charter.timeout_ms` or switching to a different model. Check provider status page for outages.",
        safe_behavior:
          "Narada continues charter execution. API errors trigger normal retry backoff with standard intervals. Draft-first safety is maintained: any successful execution still produces drafts, not direct effects.",
        inspectable:
          "Preview (`narada preview-work`), replay (`narada derive-work`), and observation UI remain fully functional because they do not require live API calls.",
      };
    case "broken":
      return {
        operator_action:
          "Verify the API key is valid and not expired. Check network connectivity to the API endpoint (`charter.base_url` or default). Review provider billing and rate-limit status. Run `narada doctor` for detailed diagnostics.",
        safe_behavior:
          "In production, Narada will skip charter execution when the runtime is broken. Work items remain opened and will be executed once health recovers. Existing facts, drafts, and outbound handoffs are preserved. Sync continues if source APIs are healthy.",
        inspectable:
          "All durable state remains inspectable. Operator can review pending work items, replay past evaluations, and confirm or reject existing drafts. Use `narada recover` after fixing the runtime to re-derive work if needed.",
      };
    default: {
      const _exhaustive: never = healthClass;
      void _exhaustive;
      return {
        operator_action: "Unknown health state. Review logs and run `narada doctor`.",
        safe_behavior: "No assumptions made. System continues with existing safeguards.",
        inspectable: "All durable state remains inspectable.",
      };
    }
  }
}

/**
 * Compute whether a health class permits live charter execution.
 *
 * Returns `true` for healthy, degraded_draft_only, and partially_degraded.
 * Returns `false` for unconfigured and broken.
 */
export function healthClassPermitsExecution(
  healthClass: CharterRuntimeHealthClass,
): boolean {
  return healthClass === "healthy" ||
    healthClass === "degraded_draft_only" ||
    healthClass === "partially_degraded";
}
