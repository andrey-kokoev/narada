/**
 * Foreman Evaluation Validation
 *
 * Arbitration logic for primary/secondary charter evaluation.
 *
 * The canonical `validateCharterOutput` function lives in `@narada2/charters`
 * and is re-exported by this package for convenience.
 */

import type {
  ProposedAction,
} from "./types.js";

export { validateCharterOutput, type ValidationResult } from "@narada2/charters";

/**
 * Arbitration between primary and secondary charter outputs.
 * Returns the winning evaluation or undefined if they conflict unresolved.
 *
 * V1 simplified arbitration: primary wins unless secondary has an escalation
 * and primary does not.
 */
export function arbitrateEvaluations(
  primary: { evaluation_id: string; proposed_actions: ProposedAction[]; escalations: { urgency: string }[] } | undefined,
  secondary: { evaluation_id: string; proposed_actions: ProposedAction[]; escalations: { urgency: string }[] } | undefined,
): { winner: "primary" | "secondary" | "conflict"; reason: string } {
  if (!primary && !secondary) {
    return { winner: "conflict", reason: "No evaluations to arbitrate" };
  }
  if (primary && !secondary) {
    return { winner: "primary", reason: "Only primary evaluation present" };
  }
  if (!primary && secondary) {
    return { winner: "secondary", reason: "Only secondary evaluation present" };
  }

  const primaryHasHighEscalation = primary!.escalations.some((e) => e.urgency === "high");
  const secondaryHasHighEscalation = secondary!.escalations.some((e) => e.urgency === "high");

  if (secondaryHasHighEscalation && !primaryHasHighEscalation) {
    return { winner: "secondary", reason: "Secondary raised high-urgency escalation" };
  }

  return { winner: "primary", reason: "Primary charter prevails by default" };
}
