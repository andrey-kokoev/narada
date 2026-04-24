/**
 * Canonical Crossing Regime Inventory
 *
 * This file backfills the core Narada crossings into the declaration format
 * defined by Task 495. Every entry is a `CrossingRegimeInventoryEntry` that
 * maps an existing Narada durable boundary to the six-field crossing regime
 * contract.
 *
 * Classification:
 * - `canonical`: Structurally load-bearing crossings already documented in
 *   SEMANTICS.md §2.15.4. These are the irreducible crossings Narada relies on.
 * - `advisory`: Real boundary crossings that exist in the pipeline but are
 *   less structurally central than the canonical set.
 * - `deferred`: Suspected boundaries that have not been fully crystallized.
 *
 * This inventory is consumed by lint gates (Task 497) and inspection surfaces
 * (Task 498). It is read-only declaration data; it does not introduce runtime
 * behavior.
 *
 * @see SEMANTICS.md §2.15
 * @see packages/layers/control-plane/src/types/crossing-regime.ts
 */

import type { CrossingRegimeInventoryEntry, CrossingRegimeKind } from "./crossing-regime.js";

/**
 * The canonical initial inventory of Narada crossing regimes.
 *
 * Ordered by pipeline position (Source → Fact → Context → Work → Evaluation
 * → Decision → Intent → Execution → Confirmation → Observation).
 */
export const CROSSING_REGIME_INVENTORY: readonly CrossingRegimeInventoryEntry[] =
  [
    // ─────────────────────────────────────────────────────────────────────────
    // Canonical crossings (documented in SEMANTICS.md §2.15.4)
    // ─────────────────────────────────────────────────────────────────────────

    {
      name: "Fact admission",
      description:
        "Remote source records cross into the canonical durable fact boundary via deterministic normalization.",
      source_zone: "Source",
      destination_zone: "Fact",
      authority_owner: "Source adapter (`derive`)",
      admissibility_regime:
        "Deterministic normalization + content-addressed `event_id` + idempotent ingestion",
      crossing_artifact: "`Fact` record (`fact_id`, `fact_type`, `payload_json`)",
      confirmation_rule:
        "Self-certifying (`event_id` collision → idempotent upsert); no external confirmation required because the artifact is content-hashed",
      anti_collapse_invariant:
        "Prevents world state from becoming prompt memory.",
      documented_at: "SEMANTICS.md §2.15.4 case 1",
      classification: "canonical",
      kind: "self_certifying",
    },

    {
      name: "Evaluation → Decision",
      description:
        "Charter intelligence output crosses into the authority-governed decision boundary.",
      source_zone: "Evaluation",
      destination_zone: "Decision",
      authority_owner: "Foreman (`resolve`)",
      admissibility_regime:
        "Policy validation of charter output + governance rules (accept / reject / escalate / no-op)",
      crossing_artifact: "`foreman_decision` record",
      confirmation_rule:
        "Append-only; reversal requires new decision, not mutation",
      anti_collapse_invariant:
        "Prevents model judgment from becoming permission.",
      documented_at: "SEMANTICS.md §2.15.4 case 6",
      classification: "canonical",
      kind: "policy_governed",
    },

    {
      name: "Intent admission",
      description:
        "A governed foreman decision crosses into the universal durable effect boundary.",
      source_zone: "Decision",
      destination_zone: "Intent",
      authority_owner: "Foreman handoff (`resolve`)",
      admissibility_regime:
        "Decision must be `accept` (not `reject`, `escalate`, or `no-op`); atomic transaction with `outbound_handoff` creation",
      crossing_artifact:
        "`Intent` record (`intent_id`, `idempotency_key`, `payload_json`)",
      confirmation_rule:
        "Intent is not confirmed at crossing time; confirmation happens downstream via execution → reconciliation",
      anti_collapse_invariant:
        "Prevents approval from becoming direct effect.",
      documented_at: "SEMANTICS.md §2.15.4 case 2",
      classification: "canonical",
      kind: "intent_handoff",
    },

    {
      name: "Execution → Confirmation",
      description:
        "A worker effect attempt crosses into durable truth via external observation.",
      source_zone: "Execution",
      destination_zone: "Confirmation",
      authority_owner: "Reconciler (`confirm`)",
      admissibility_regime:
        "External observation or inbound reconciliation proves the effect took hold",
      crossing_artifact: "Confirmation status update",
      confirmation_rule:
        "Inbound observation matches expected outcome; API success alone is insufficient",
      anti_collapse_invariant:
        "Prevents API success from becoming assumed truth.",
      documented_at: "SEMANTICS.md §2.15.4 case 7",
      classification: "canonical",
      kind: "observation_reconciled",
    },

    {
      name: "Operator action request",
      description:
        "A human operator intent crosses into the system mutation surface under identity verification.",
      source_zone: "Operator",
      destination_zone: "Control",
      authority_owner: "Operator (`admin`) + identity provider confirmation",
      admissibility_regime:
        "Recognized operator contact address → pending request + confirmation challenge → verified identity token → safelisted action",
      crossing_artifact: "`operator_action_request` record",
      confirmation_rule:
        "Challenge completion through configured identity provider (e.g., Microsoft/Entra verified token claims)",
      anti_collapse_invariant:
        "Prevents email desire from becoming direct mutation; email is admissible as input, not as authority.",
      documented_at: "SEMANTICS.md §2.15.4 case 3",
      classification: "canonical",
      kind: "challenge_confirmed",
    },

    {
      name: "Task attachment / carriage",
      description:
        "An agent attaches to a task under a declared intent enum with exclusivity guarantees.",
      source_zone: "Agent",
      destination_zone: "Task",
      authority_owner: "Agent (`claim`) for self-assignment; Operator (`admin`) for override",
      admissibility_regime:
        "Intent enum (`primary`, `review`, `repair`, `takeover`) + reason + dependency check + exclusivity rules",
      crossing_artifact: "`TaskAssignment` record (or `TaskContinuation` for repair)",
      confirmation_rule:
        "Roster state reflects attachment; for `primary`/`takeover`, at most one unreleased primary carriage at any time",
      anti_collapse_invariant:
        "Prevents attachment from being mistaken for carriage; preserves single-primary-carriage invariant.",
      documented_at: "SEMANTICS.md §2.15.4 case 5",
      classification: "canonical",
      kind: "challenge_confirmed",
    },

    {
      name: "Task completion",
      description:
        "Agent work product crosses into review/closure governance under external validation.",
      source_zone: "Work",
      destination_zone: "Review/Closure",
      authority_owner:
        "Primary agent (`claim`) for report; reviewer/operator (`resolve`/`admin`) for acceptance",
      admissibility_regime:
        "Report submission with evidence artifact → review validation → status transition to `closed`",
      crossing_artifact: "Task report / review artifact",
      confirmation_rule:
        "Review artifact exists and passes acceptance criteria; for tasks with review assignment, reviewer sign-off required",
      anti_collapse_invariant:
        "Prevents self-reported completion from becoming terminal status without external validation.",
      documented_at: "SEMANTICS.md §2.15.4 case 4",
      classification: "canonical",
      kind: "review_gated",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Advisory crossings (real boundaries, less structurally central)
    // ─────────────────────────────────────────────────────────────────────────

    {
      name: "Fact → Context",
      description:
        "Canonical facts are grouped into policy-relevant contexts by the context formation strategy.",
      source_zone: "Fact",
      destination_zone: "Context",
      authority_owner: "Context formation strategy (`derive`)",
      admissibility_regime:
        "Fact payload matches context formation rules; context_id is stable across replays",
      crossing_artifact:
        "`context_id`, `revision_id`, and `PolicyContext` metadata",
      confirmation_rule:
        "Context metadata is durable; replay determinism ensures the same facts produce the same context grouping",
      anti_collapse_invariant:
        "Prevents fact ingestion from bypassing policy-relevant grouping.",
      documented_at: "SEMANTICS.md §2.1 (Nine-Layer Pipeline)",
      classification: "advisory",
      classification_rationale:
        "A real boundary crossing (authority changes from normalizer to context formation), but the artifact is metadata rather than a standalone durable record. Less structurally central than the canonical seven.",
      kind: "self_certifying",
    },

    {
      name: "Context → Work",
      description:
        "A context revision crosses into a terminal schedulable work item opened by the foreman.",
      source_zone: "Context",
      destination_zone: "Work",
      authority_owner: "Foreman (`resolve`)",
      admissibility_regime:
        "Context revision triggers work opening via `onContextsAdmitted()`; at most one non-terminal work item per context",
      crossing_artifact: "`work_item` record (`work_item_id`, `context_id`, `scope_id`)",
      confirmation_rule:
        "Work item is durably recorded in the coordinator; foreman owns the insert path",
      anti_collapse_invariant:
        "Prevents context drift from creating ungoverned work.",
      documented_at: "SEMANTICS.md §2.1 + AGENTS.md invariant 6 (Foreman owns work opening)",
      classification: "advisory",
      classification_rationale:
        "Real crossing with authority change and durable artifact, but the work item is an internal control-plane object rather than a user-facing boundary. Canonical status deferred until Task 500 reviews the full pipeline.",
      kind: "policy_governed",
    },

    {
      name: "Work → Evaluation",
      description:
        "A leased work item crosses into charter intelligence output via the charter runtime.",
      source_zone: "Work",
      destination_zone: "Evaluation",
      authority_owner: "Charter runtime (`propose`)",
      admissibility_regime:
        "Work item is leased to a charter invocation; output is captured in `CharterOutputEnvelope`",
      crossing_artifact: "`evaluation_id`, `CharterOutputEnvelope`",
      confirmation_rule:
        "Evaluation is durably recorded; charter runtime is read-only sandbox and does not mutate stores directly",
      anti_collapse_invariant:
        "Prevents work items from being evaluated outside governed charter boundaries.",
      documented_at: "SEMANTICS.md §2.1 + AGENTS.md invariant 13 (Charter runtime is read-only sandbox)",
      classification: "advisory",
      classification_rationale:
        "Real crossing, but evaluation is an intermediate intelligence artifact rather than a durable commitment boundary. The canonical commitment happens at Evaluation → Decision.",
      kind: "policy_governed",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Advisory crossings (task governance)
    // ─────────────────────────────────────────────────────────────────────────

    {
      name: "Recommendation → Assignment",
      description:
        "An advisory recommendation artifact crosses into an authoritative task assignment under operator validation.",
      source_zone: "Recommendation",
      destination_zone: "Task Assignment",
      authority_owner: "Operator (claim) for normal promotion; Operator (admin) for override",
      admissibility_regime:
        "9 validation checks (task_exists, task_status, dependencies, agent_exists, agent_available, no_active_assignment, write_set_risk, recommendation_fresh, principal_unavailable) + 1-hour freshness window + policy gate",
      crossing_artifact: "`AssignmentPromotionRequest` record",
      confirmation_rule:
        "Assignment record durably created in `.ai/tasks/assignments/` + task status transitioned to `claimed`",
      anti_collapse_invariant:
        "Prevents advisory scoring from becoming authoritative assignment without independent validation.",
      documented_at: ".ai/decisions/20260423-555-recommendation-to-assignment-crossing-contract.md",
      classification: "advisory",
      classification_rationale:
        "A real authority-changing boundary with durable artifact and explicit regime, but specific to task governance rather than the core control-plane pipeline.",
      kind: "policy_governed",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Deferred crossings (suspected but not yet crystallized)
    // ─────────────────────────────────────────────────────────────────────────

    {
      name: "Intent → Execution",
      description:
        "A durable intent is claimed by a worker for effect performance.",
      source_zone: "Intent",
      destination_zone: "Execution",
      authority_owner: "Worker (`execute`)",
      admissibility_regime:
        "Intent is claimed via `execution_attempt` creation; worker holds lease during performance",
      crossing_artifact: "`execution_attempt` record",
      confirmation_rule:
        "Execution attempt is durably recorded; downstream reconciliation confirms the effect",
      anti_collapse_invariant:
        "Prevents intent from being performed without durable execution tracking.",
      documented_at: "SEMANTICS.md §2.1 (Nine-Layer Pipeline)",
      classification: "deferred",
      classification_rationale:
        "The boundary exists (authority changes from foreman handoff to worker), but it is tightly coupled with Execution → Confirmation. Whether it deserves independent canonical status depends on whether future verticals introduce distinct intent-claiming patterns. Deferred for Task 500 closure review.",
      kind: "observation_reconciled",
    },
  ];

/**
 * Filter helpers for inventory consumers.
 */
export function getCanonicalCrossings(): readonly CrossingRegimeInventoryEntry[] {
  return CROSSING_REGIME_INVENTORY.filter((c) => c.classification === "canonical");
}

export function getAdvisoryCrossings(): readonly CrossingRegimeInventoryEntry[] {
  return CROSSING_REGIME_INVENTORY.filter((c) => c.classification === "advisory");
}

export function getDeferredCrossings(): readonly CrossingRegimeInventoryEntry[] {
  return CROSSING_REGIME_INVENTORY.filter((c) => c.classification === "deferred");
}

/**
 * Return all inventory entries that match a given regime kind.
 *
 * A kind clusters crossings by edge law (admissibility + confirmation shape),
 * not by zone pair. Crossings with different zone pairs may share a kind.
 */
export function getCrossingsByKind(
  kind: CrossingRegimeKind,
): readonly CrossingRegimeInventoryEntry[] {
  return CROSSING_REGIME_INVENTORY.filter((c) => c.kind === kind);
}
