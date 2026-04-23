/**
 * Crossing Regime Declaration Contract
 *
 * A crossing regime is the explicit set of rules that determine what may cross
 * a boundary, in what form, under what authority, and with what confirmation
 * obligation.
 *
 * This file defines the canonical machine-readable declaration contract.
 * It is consumed by lint, inspection, and construction surfaces.
 * It does NOT introduce runtime behavior, classes, or orchestration.
 *
 * Semantic authority lives in SEMANTICS.md §2.15.
 * This type is the mechanical contract that later tasks (inventory, lint,
 * inspection, construction) import and validate against.
 */

/**
 * The six irreducible fields of every crossing regime in Narada.
 *
 * No crossing regime may omit any of these fields. A transition that lacks
 * one is either not a meaningful boundary crossing, or an authority collapse.
 *
 * @see SEMANTICS.md §2.15.3 "Irreducible Fields"
 */
export interface CrossingRegimeDeclaration {
  /** The zone providing the artifact (e.g. "Source", "Evaluation", "Operator") */
  source_zone: string;

  /** The zone receiving the artifact (e.g. "Fact", "Decision", "Control") */
  destination_zone: string;

  /** The component/role with permission to govern this crossing */
  authority_owner: string;

  /** The explicit rules for what may cross, in what form */
  admissibility_regime: string;

  /** The durable record produced by the crossing */
  crossing_artifact: string;

  /** How the crossing is verified or reconciled */
  confirmation_rule: string;
}

/**
 * Reusable regime kinds that cluster crossing regimes by edge law.
 *
 * A kind is defined by the admissibility law and confirmation shape,
 * not by the specific zones involved. Crossings with different zone
 * pairs may share a kind if their edge law is the same.
 *
 * @see SEMANTICS.md §2.15.9
 */
export type CrossingRegimeKind =
  | "self_certifying"
  | "policy_governed"
  | "intent_handoff"
  | "challenge_confirmed"
  | "review_gated"
  | "observation_reconciled";

/**
 * A documented crossing regime pairs the irreducible declaration with
 * human-readable metadata and its anti-collapse invariant.
 *
 * This is the shape used by the canonical crossing inventory (Task 496)
 * and inspection surfaces (Task 498).
 */
export interface DocumentedCrossingRegime extends CrossingRegimeDeclaration {
  /** Human-readable name of the crossing (e.g. "Fact admission") */
  name: string;

  /** One-sentence description of what this crossing governs */
  description: string;

  /** The anti-collapse invariant this crossing preserves */
  anti_collapse_invariant: string;

  /** Canonical documentation anchor (e.g. "SEMANTICS.md §2.15.4 case 1") */
  documented_at: string;

  /**
   * Reusable regime kind that classifies this crossing by edge law.
   *
   * Optional because new crossings may be declared before their kind
   * is crystallized. The taxonomy is doctrine, not a runtime switch.
   */
  kind?: CrossingRegimeKind;
}

/**
 * Read-only view of a crossing regime declaration.
 *
 * All inspection and lint surfaces should use this view type to ensure
 * they do not mutate declarations.
 */
export type CrossingRegimeDeclarationView = Readonly<CrossingRegimeDeclaration>;

/**
 * Read-only view of a documented crossing regime.
 */
export type DocumentedCrossingRegimeView = Readonly<DocumentedCrossingRegime>;

/**
 * Classification of a crossing regime within the canonical inventory.
 *
 * - `canonical`: Structurally load-bearing, documented in SEMANTICS.md §2.15.4
 * - `advisory`: Real boundary crossing that exists but is less structurally central
 * - `deferred`: Boundary suspected but not yet crystallized enough to declare
 */
export type CrossingClassification = "canonical" | "advisory" | "deferred";

/**
 * An entry in the canonical crossing regime inventory.
 *
 * Extends the documented declaration with inventory metadata that
 * distinguishes canonical, advisory, and deferred cases.
 */
export interface CrossingRegimeInventoryEntry extends DocumentedCrossingRegime {
  /** Classification within the inventory */
  classification: CrossingClassification;

  /** Rationale for classification, especially for advisory or deferred entries */
  classification_rationale?: string;
}

/**
 * Read-only view of an inventory entry.
 */
export type CrossingRegimeInventoryEntryView = Readonly<CrossingRegimeInventoryEntry>;

/**
 * Admissible representation kinds for a crossing regime declaration.
 *
 * The contract may be represented in multiple forms, but all forms
 * must express the same six irreducible fields.
 */
export type CrossingRegimeRepresentation =
  | { kind: "docs"; location: string }
  | { kind: "typescript"; location: string }
  | { kind: "json_schema"; location: string };

/**
 * Validation result from checking a candidate declaration against the contract.
 */
export interface CrossingRegimeValidationResult {
  /** Whether the candidate satisfies the six-field contract */
  valid: boolean;

  /** Missing or malformed fields, empty when valid */
  violations: Array<{
    field: keyof CrossingRegimeDeclaration;
    message: string;
  }>;
}

/**
 * Validate a candidate object against the six-field crossing regime contract.
 *
 * This is the mechanical enforcement function that lint, inspection, and
 * construction surfaces call to verify a declaration is complete.
 *
 * @example
 * ```ts
 * const result = validateCrossingRegimeDeclaration(candidate);
 * if (!result.valid) {
 *   console.error(result.violations.map(v => v.message).join("\n"));
 * }
 * ```
 */
export function validateCrossingRegimeDeclaration(
  candidate: unknown,
): CrossingRegimeValidationResult {
  const violations: Array<{
    field: keyof CrossingRegimeDeclaration;
    message: string;
  }> = [];

  if (typeof candidate !== "object" || candidate === null) {
    return {
      valid: false,
      violations: [
        {
          field: "source_zone",
          message: "Candidate must be an object",
        },
      ],
    };
  }

  const c = candidate as Record<string, unknown>;
  const requiredFields: (keyof CrossingRegimeDeclaration)[] = [
    "source_zone",
    "destination_zone",
    "authority_owner",
    "admissibility_regime",
    "crossing_artifact",
    "confirmation_rule",
  ];

  for (const field of requiredFields) {
    const value = c[field];
    if (typeof value !== "string" || value.trim() === "") {
      violations.push({
        field,
        message: `${field} must be a non-empty string`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
