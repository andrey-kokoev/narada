---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T19:06:00Z
closed_by: codex
governed_by: task_close:codex
depends_on: [500]
---

# Task 504 - Crossing Regime Kind Taxonomy

## Context

Narada now treats crossing regime as an edge law, but still lacks a taxonomy of reusable regime kinds. Without that, each crossing remains fully local and the doctrine cannot yet say whether there is a smaller family of recurring governed edge types.

## Goal

Define a bounded `crossing_regime_kind` taxonomy for Narada.

## Read First

- `SEMANTICS.md` §2.15
- `AGENTS.md`
- `.ai/do-not-open/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/do-not-open/tasks/20260423-496-canonical-crossing-inventory-and-backfill.md`
- `.ai/do-not-open/tasks/20260423-500-crossing-regime-first-class-closure.md`

## Scope

This task owns reusable regime-kind doctrine only:

- what kinds recur,
- what makes them distinct,
- and what should remain local declaration rather than promoted to a kind.

## Required Work

1. Pressure-test whether the current crossing inventory clusters into a smaller set of reusable kinds.
   Candidate kinds may include ideas like:
   - self-certifying
   - governed admission
   - policy-validated handoff
   - review-gated
   - challenge-confirmed
   - observation-reconciled
   - exclusivity/lease-like carriage

2. Define the smallest useful taxonomy.
   For each kind, state:
   - what sort of admissibility law it names,
   - what confirmation shape is typical,
   - what it excludes.

3. Distinguish:
   - regime kind,
   - concrete crossing regime declaration,
   - and accidental pattern that does not deserve taxonomic promotion.

4. Record ambiguous or overlapping kinds honestly.

## Non-Goals

- Do not make regime kind a runtime switch statement unless truly needed.
- Do not widen into zone templates or runtime derivation.
- Do not force every crossing into a neat kind if the fit is weak.

## Acceptance Criteria

- [x] A bounded candidate `crossing_regime_kind` taxonomy exists.
- [x] Each kind is defined in terms of edge law, not merely examples.
- [x] The task distinguishes kind from concrete declaration clearly.
- [x] Ambiguous or overlapping cases are recorded explicitly.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

### 1. Taxonomy Definition

Six reusable regime kinds were identified from pressure-testing the 11-entry canonical inventory:

| Kind | Edge Law | Confirmation | Population |
|------|----------|-------------|------------|
| `self_certifying` | Deterministic, replay-stable transformation of source | Content hash / replay determinism | 2 (1 canonical + 1 advisory) |
| `policy_governed` | Governance component validates against explicit rules | Append-only durable admission record | 3 (1 canonical + 2 advisory) |
| `intent_handoff` | Governed decision crosses into effect boundary atomically | Downstream execution + reconciliation | 1 (canonical) |
| `challenge_confirmed` | External verifier completes challenge-response | Verified challenge completion token | 1 (canonical) |
| `review_gated` | Human/peer reviewer validates quality against criteria | Review artifact with sign-off | 1 (canonical) |
| `observation_reconciled` | Confirmed by observing external state after effect | Inbound observation matches expected outcome | 2 (1 canonical + 1 deferred) |

### 2. Ambiguous Cases Recorded

- **Task attachment**: Hybrid between `policy_governed` (intent enum, dependency check) and `challenge_confirmed` (exclusivity check against roster state). Mapped to `challenge_confirmed` with noted imperfection.
- **Intent admission**: Could be `policy_governed`; promoted to `intent_handoff` because creating the universal effect boundary is structurally distinct.
- **Review-gated vs. challenge-confirmed**: Both involve external verifiers, but one evaluates quality, the other identity. Boundary may blur with hybrid verification in future crossings.

### 3. What Remains Local Declaration

- Advisory crossings (`Fact→Context`, `Context→Work`, `Work→Eval`) are pipeline stages instantiating existing kinds, not distinct kinds.
- Exclusivity enforcement is a crossing modifier, not a kind.
- Lease acquisition is an internal mechanism, not a crossing regime.

### 4. Changed Files

- `packages/layers/control-plane/src/types/crossing-regime.ts` — added `CrossingRegimeKind` union type and optional `kind` field to `DocumentedCrossingRegime`
- `packages/layers/control-plane/src/types/crossing-regime-inventory.ts` — added `kind` to all 11 inventory entries; added `getCrossingsByKind()` filter helper
- `SEMANTICS.md` — added §2.15.9 "Crossing Regime Kind Taxonomy" with kind definitions, inventory mapping, ambiguous cases, and kind invariants
- `AGENTS.md` — added "crossing regime kind" to concept table and "Modify crossing regime kind taxonomy" to By Task table

## Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

No runtime behavior was changed. The work is pure doctrine (types + docs + inventory metadata).

