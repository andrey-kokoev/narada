---
status: closed
created: 2026-04-23
depends_on: [495]
closed_at: 2026-04-23T17:43:32.550Z
closed_by: codex
governed_by: task_close:codex
---

# Task 496 - Canonical Crossing Inventory And Backfill

## Context

Once the declaration contract exists, Narada needs a declared inventory of its core crossings. Without backfill, enforcement and inspection surfaces will have nothing canonical to operate over.

## Goal

Backfill the core Narada crossings into the canonical declaration format defined by Task 495.

## Read First

- `.ai/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/decisions/20260423-491-crossing-regime-semantic-crystallization.md`
- `SEMANTICS.md` §2.8, §2.13, §2.14, §2.15
- `AGENTS.md`

## Scope

This task owns the initial canonical inventory and backfill. It should cover the crossings that are already structurally load-bearing in Narada.

## Required Work

1. Select the smallest canonical set of crossings that must be declared now.
   At minimum, pressure-test inclusion of:
   - `Source -> Fact`
   - `Evaluation -> Decision`
   - `Decision -> Intent`
   - `Execution -> Confirmation`
   - `Operator -> OperatorActionRequest`
   - `Agent -> Task assignment/continuation`

2. Declare each selected crossing against the Task 495 contract.

3. Record where each declaration is authoritative and how it maps to already-existing Narada boundaries.

4. Explicitly distinguish:
   - already-canonical crossings,
   - advisory examples,
   - and deferred/uncertain cases.

5. Update authoritative docs or machine-readable artifacts so the inventory can be inspected later without reinterpretation.

## Non-Goals

- Do not invent crossings that Narada does not actually rely on.
- Do not backfill every edge in the codebase.
- Do not introduce synthetic provider-neutral examples.
- Do not widen into effect execution or substrate abstraction work.

## Acceptance Criteria

- [x] A canonical initial inventory exists.
- [x] Every included crossing is declared against the Task 495 contract.
- [x] The inventory distinguishes canonical vs deferred/advisory cases.
- [x] The declarations map back to existing Narada durable boundaries or authority transitions.
- [x] Focused verification or blocker evidence is recorded in this task.

## Focused Verification

- Prefer read-only verification: lint, docs consistency, and any declaration-schema/type validation introduced by Task 495.

## Execution Notes

### 1. Inventory Structure

Created `packages/layers/control-plane/src/types/crossing-regime-inventory.ts` containing a const array `CROSSING_REGIME_INVENTORY` of 11 `CrossingRegimeInventoryEntry` values, each declaring against the Task 495 six-field contract.

Added to `crossing-regime.ts`:
- `CrossingClassification` type (`'canonical' | 'advisory' | 'deferred'`)
- `CrossingRegimeInventoryEntry` interface (extends `DocumentedCrossingRegime` with `classification` and `classification_rationale`)
- Filter helpers: `getCanonicalCrossings()`, `getAdvisoryCrossings()`, `getDeferredCrossings()`

### 2. Canonical Crossings (7)

All seven cases from SEMANTICS.md §2.15.4 are declared as `canonical`:

| # | Crossing | Maps to Existing Boundary |
|---|----------|--------------------------|
| 1 | Fact admission | `Fact` record, `event_id` hash |
| 2 | Evaluation → Decision | `foreman_decision` record |
| 3 | Intent admission | `Intent` record, `outbound_handoff` |
| 4 | Execution → Confirmation | Confirmation status, reconciler |
| 5 | Operator action request | `operator_action_request` record |
| 6 | Task attachment / carriage | `TaskAssignment`, `TaskContinuation` |
| 7 | Task completion | Task report / review artifact |

Each entry includes `documented_at` pointing to its SEMANTICS.md anchor and an `anti_collapse_invariant`.

### 3. Advisory Crossings (3)

Real boundaries that exist in the nine-layer pipeline but are less structurally central:

| Crossing | Rationale for Advisory |
|----------|----------------------|
| Fact → Context | Artifact is metadata, not standalone durable record |
| Context → Work | Internal control-plane object, not user-facing boundary |
| Work → Evaluation | Intermediate intelligence artifact, not commitment boundary |

### 4. Deferred Crossing (1)

| Crossing | Rationale for Deferred |
|----------|----------------------|
| Intent → Execution | Tightly coupled with Execution → Confirmation; independent canonical status deferred to Task 500 closure review |

### 5. Updated Authoritative Docs

- **SEMANTICS.md §2.15.4**: Added preamble referencing the machine-readable inventory file; noted advisory and deferred crossings
- **SEMANTICS.md §2.15.8**: Updated inventory backfill reference to point to the actual file
- **AGENTS.md**: Added "crossing regime inventory" to concept table and "Modify crossing regime inventory" to By Task table

### 6. Changed Files

- `packages/layers/control-plane/src/types/crossing-regime.ts` — added `CrossingClassification`, `CrossingRegimeInventoryEntry`, filter helpers
- `packages/layers/control-plane/src/types/crossing-regime-inventory.ts` — new file with `CROSSING_REGIME_INVENTORY` const array (11 entries)
- `packages/layers/control-plane/src/types/index.ts` — exported new module
- `SEMANTICS.md` — updated §2.15.4 and §2.15.8 with inventory references
- `AGENTS.md` — added inventory to concept and task tables

### 7. Verification

```
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

No runtime code was changed; no tests were added or modified.

## Verification

```bash
pnpm verify
```

Result:
- all 5 verification steps passed (`task-file-guard`, `typecheck`, `build`, `charters tests`, `ops-kit tests`)
- no runtime behavior was changed; the work is declaration and inventory only
- no tests were added or modified because the change is limited to exported types, inventory entries, and authoritative docs

## Residuals / Deferred Work

- Task 500 closure review will re-evaluate whether advisory crossings should be promoted to canonical or deferred.
- The deferred `Intent → Execution` crossing awaits vertical evidence before crystallization.
- JSON Schema generation for the inventory is deferred until a concrete consumer requires it.


