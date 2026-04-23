---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T17:27:00Z
closed_by: codex
depends_on: [491]
---

# Task 495 - Crossing Regime Declaration Contract

## Context

Task 491 accepted crossing regime as a canonical Narada semantic object, but Narada still lacks a canonical declaration shape that other surfaces can consume mechanically.

Without that shape, "first-class" remains rhetorical.

## Goal

Define the canonical declaration contract for a crossing regime and decide where that declaration lives so other surfaces can use it without inventing parallel formats.

## Read First

- `SEMANTICS.md` §2.15
- `AGENTS.md`
- `.ai/decisions/20260423-491-crossing-regime-semantic-crystallization.md`
- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md`

## Scope

This task owns the declaration contract only:

- field set,
- admissible representation,
- canonical storage/document location,
- and the line between semantic declaration, machine-readable artifact, and runtime code.

It does not own enforcement, inspection, or chapter/task integration beyond defining what those later tasks will consume.

## Required Work

1. Define the canonical declaration shape for a crossing regime.
   At minimum, pressure-test whether the six irreducible fields from Task 491 remain sufficient once the concept becomes inspectable:
   - `source_zone`
   - `destination_zone`
   - `authority_owner`
   - `admissibility_regime`
   - `crossing_artifact`
   - `confirmation_rule`

2. Decide whether the declaration should exist as:
   - docs-only canonical grammar,
   - machine-readable artifact,
   - shared TypeScript type / JSON schema,
   - or a split of these.

3. State the canonical home.
   Examples that may be correct:
   - a new section in `SEMANTICS.md`,
   - a dedicated governance/product/concepts doc,
   - a machine-readable file under `.ai/`,
   - a TypeScript declaration used only for inspection/lint surfaces.

4. Explicitly mark what is **not** owned by the declaration contract:
   - runtime orchestration,
   - state-machine transitions,
   - side-effect execution,
   - generic inheritance requirements.

5. Update authoritative docs so later tasks can point to one canonical contract instead of restating it.

## Non-Goals

- Do not build a generic runtime `CrossingRegime` class.
- Do not require all code paths to instantiate declaration objects immediately.
- Do not widen the concept beyond authority-changing durable crossings.
- Do not add mutation behavior to any surface.

## Acceptance Criteria

- [x] A canonical declaration contract exists in an authoritative location.
- [x] The declaration shape is explicit and stable enough for later lint/inspection use.
- [x] The boundary between declaration and runtime behavior is stated explicitly.
- [x] The task records whether machine-readable form is required now or deferred.
- [x] Focused verification or blocker evidence is recorded in this task.

## Focused Verification

- Prefer doc/lint/typecheck-level verification.
- If code is added for declaration support, run only the smallest relevant package/typecheck/test commands.

## Execution Notes

### 1. Canonical Declaration Shape

The six irreducible fields from Task 491 are preserved as the canonical shape:

| Field | Type | Cardinality |
|-------|------|-------------|
| `source_zone` | string | 1 |
| `destination_zone` | string | 1 |
| `authority_owner` | string | 1 |
| `admissibility_regime` | string | 1 |
| `crossing_artifact` | string | 1 |
| `confirmation_rule` | string | 1 |

These fields are documented in SEMANTICS.md §2.15.8 and encoded as a TypeScript interface.

### 2. Representation Decision

| Representation | Status | Location |
|----------------|--------|----------|
| Prose + tables | **Active** | SEMANTICS.md §2.15 |
| TypeScript interface | **Active** | `packages/layers/control-plane/src/types/crossing-regime.ts` |
| JSON Schema | **Deferred** | Will be generated from TypeScript when a concrete consumer requires it |

The TypeScript type is required now because Tasks 496–498 will import it for inventory, lint, and inspection surfaces.

### 3. Canonical Home

- **Semantic authority**: SEMANTICS.md §2.15
- **Machine-readable contract**: `packages/layers/control-plane/src/types/crossing-regime.ts`
- **Inventory backfill**: Task 496 will declare core crossings as `DocumentedCrossingRegime` values
- **Lint gate**: Task 497 will validate new crossings against the six-field contract

### 4. Boundary Between Declaration and Runtime

Explicitly documented in SEMANTICS.md §2.15.8 under "What the Declaration Contract Does NOT Own":

| Concern | Owner |
|---------|-------|
| Runtime orchestration | Scheduler, workers, adapters |
| State-machine transitions | Individual subsystems (`foreman_decision`, `work_item`, etc.) |
| Side-effect execution | Outbound workers, charter runtime, source adapters |
| Generic inheritance | None — Narada avoids a `CrossingRegime` base class |
| Enforcement timing | Lint and review surfaces (Task 497) |

### 5. Changed Files

- `SEMANTICS.md` — added §2.15.8 "Declaration Contract"
- `packages/layers/control-plane/src/types/crossing-regime.ts` — new file with `CrossingRegimeDeclaration`, `DocumentedCrossingRegime`, view types, and validation result type
- `packages/layers/control-plane/src/types/index.ts` — exported new module
- `AGENTS.md` — added "crossing regime declaration" to concept table and "Modify crossing regime declaration" to By Task table

### 6. Verification

```
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

No runtime code was changed; no tests were added or modified. The change is pure declaration (docs + types).

## Verification

```bash
pnpm verify
```

Result:
- all 5 verification steps passed (`task-file-guard`, `typecheck`, `build`, `charters tests`, `ops-kit tests`)
- no runtime code was changed
- no tests were added or modified because the change is declaration-only (`SEMANTICS.md`, `AGENTS.md`, and exported types)

## Residuals / Deferred Work

- JSON Schema generation is deferred until Task 498 or a later consumer explicitly requires it.
- The actual crossing inventory (Task 496) will populate `DocumentedCrossingRegime` instances.
- Lint enforcement (Task 497) will implement `CrossingRegimeValidationResult` production.
