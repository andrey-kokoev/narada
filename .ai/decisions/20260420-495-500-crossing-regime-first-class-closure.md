---
closes_tasks: [495, 496, 497, 498, 499, 500]
closed_at: 2026-04-20
closed_by: codex
---

# Decision: Crossing Regime First-Class Chapter Closure

## Date

2026-04-20

## Chapter

Crossing Regime First-Class (Tasks 495–500)

## Capabilities Delivered

### Task 495 — Crossing Regime Declaration Contract
- **Canonical shape**: Six irreducible fields (`source_zone`, `destination_zone`, `authority_owner`, `admissibility_regime`, `crossing_artifact`, `confirmation_rule`) defined in SEMANTICS.md §2.15.8.
- **Machine-readable contract**: TypeScript interfaces in `packages/layers/control-plane/src/types/crossing-regime.ts`:
  - `CrossingRegimeDeclaration` — the six-field base
  - `DocumentedCrossingRegime` — base + metadata (name, description, anti-collapse invariant, documented_at anchor)
  - `CrossingRegimeDeclarationView` / `DocumentedCrossingRegimeView` — read-only view types
  - `CrossingRegimeValidationResult` — structured validation output
- **Representation decision**: Prose (active), TypeScript (active), JSON Schema (deferred).
- **Explicit boundary**: Declaration contract is static grammar only; it does not own runtime orchestration, state-machine transitions, side-effect execution, or generic inheritance.

### Task 496 — Canonical Crossing Inventory And Backfill
- **Machine-readable inventory**: `packages/layers/control-plane/src/types/crossing-regime-inventory.ts` exports `CROSSING_REGIME_INVENTORY` — a const array of 11 `CrossingRegimeInventoryEntry` values.
- **Classification system**: `CrossingClassification = 'canonical' | 'advisory' | 'deferred'`.
- **Canonical crossings (7)**: Fact admission, Evaluation → Decision, Intent admission, Execution → Confirmation, Operator action request, Task attachment/carriage, Task completion.
- **Advisory crossings (3)**: Fact → Context, Context → Work, Work → Evaluation — real boundaries that are less structurally central.
- **Deferred crossing (1)**: Intent → Execution — suspected but not yet crystallized enough for canonical status.
- **Filter helpers**: `getCanonicalCrossings()`, `getAdvisoryCrossings()`, `getDeferredCrossings()`.

### Task 497 — Crossing Regime Review And Lint Gate
- **Task lint heuristic** (`scripts/task-graph-lint.ts` + `narada task lint`): Warns when a task file contains boundary keywords but lacks a crossing regime reference. Severity is `warning` (not error) to avoid theater.
- **Review checklist**: `.ai/task-contracts/agent-task-execution.md` §Crossing Regime Review Checklist — four questions reviewers must ask for boundary-shaping tasks.
- **Machine validation API**: `validateCrossingRegimeDeclaration(candidate)` checks any object against the six-field contract and returns structured violations.
- **Zero false positives** on existing task corpus (verified by running `task-graph-lint.ts`).

### Task 498 — Crossing Regime Inspection Surface
- **CLI commands**: `narada crossing list` and `narada crossing show <name>`.
- **Reads from canonical inventory**: Direct import of `CROSSING_REGIME_INVENTORY`; no parallel format.
- **Output fields**: All six irreducible fields + metadata (classification, anti-collapse invariant, documented_at).
- **Filter support**: `--classification canonical,advisory,deferred`.
- **Read-only guarantee**: No writes; uses `Readonly` view types; deferred crossings marked with `⚠` in human output.
- **16 tests** in `packages/layers/cli/test/commands/crossing.test.ts`.

### Task 499 — Crossing Regime Construction Surface Integration
- **Chapter init template**: `narada chapter init` generated tasks include an HTML-commented `## Crossing Regime` section with the six fields. Invisible in rendered output; visible during editing.
- **Construction loop plan warning**: `narada construction-loop plan` warns when open tasks contain boundary keywords but lack crossing regime references.
- **Chapter planning contract**: `.ai/task-contracts/chapter-planning.md` adds "Crossing Regime Awareness" section with planner checklist.
- **Task execution contract**: `.ai/task-contracts/agent-task-execution.md` adds "Crossing Regime Construction Reminder" for task authors.

## What "First-Class" Means Now

Crossing regime is first-class in Narada in the following **precise** sense:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Canonically declared | ✅ | SEMANTICS.md §2.15 + TypeScript interfaces |
| Machine-readable | ✅ | `crossing-regime.ts` types + `crossing-regime-inventory.ts` const array |
| Review-enforceable | ✅ | Lint heuristic + review checklist + validation API |
|Inspectable | ✅ | `narada crossing list/show` CLI commands |
| Construction-integrated | ✅ | Chapter init template + construction loop warnings + planning contract |
| Runtime generalization | ❌ Deferred | No generic `CrossingRegime` class or runtime framework |

The chapter's non-goal was respected: no generic runtime `CrossingRegime` class was built, no orchestration framework was introduced, and no fake provider-neutral abstraction was mandated.

## Deferred Gaps

1. **JSON Schema generation**: The declaration contract includes JSON Schema as a deferred representation. It will be generated from the TypeScript interfaces when a concrete consumer requires it.
2. **Fully automatic boundary detection**: Static text heuristics cannot reliably distinguish a task that introduces a new crossing from one that merely discusses existing boundaries. Human review remains the authoritative gate.
3. **Intent → Execution crystallization**: This crossing is deferred in the inventory. Whether it deserves independent canonical status depends on whether future verticals introduce distinct intent-claiming patterns.
4. **Advisory crossing promotion**: The three advisory crossings (Fact → Context, Context → Work, Work → Evaluation) may be promoted to canonical or demoted to deferred based on operational experience.
5. **Crossing regime in operator action metadata**: Operator action requests do not yet carry crossing regime classification. This would enable automated audit trails per crossing type.

## Residual Risks

1. **Lint heuristic false positives**: The keyword-based heuristic will flag tasks that mention boundaries without introducing new crossings. The warning severity and explicit false-positive message mitigate this, but noise accumulates.
2. **Template drift**: Task authors may delete the commented crossing regime section without reading it. The construction loop plan warning and review checklist provide secondary catches.
3. **Inventory staleness**: New canonical crossings introduced after this chapter must be manually added to `CROSSING_REGIME_INVENTORY`. There is no automatic extraction from code.
4. **Semantic leakage**: The concept is powerful enough that developers may over-apply it, declaring crossing regimes for internal state transitions that do not change authority owners. The review checklist asks "Is the crossing genuinely new?" to counter this.

## Closure Statement

The Crossing Regime First-Class chapter is closed. Crossing regime is now a **declared, inspectable, review-enforceable, and construction-integrated** semantic object in Narada. It is not a runtime framework, not a generic class hierarchy, and not an automatic boundary detector. It is a disciplined lens — a way to see, name, declare, and review the authority transitions that already exist in the system.

The six irreducible fields are stable. The canonical inventory of seven crossings is load-bearing. The inspection surface is read-only and tested. The construction surfaces prompt for declarations without boilerplate. The lint gate warns without theater.

What remains deferred is honest: runtime generalization, automatic detection, and schema generation. These are recognized gaps, not hidden failures.
