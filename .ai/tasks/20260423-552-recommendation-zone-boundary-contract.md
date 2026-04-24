---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T19:22:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: []
---

# Task 552 - Recommendation Zone Boundary Contract

## Goal

Define assignment recommendation as a first-class Narada zone rather than as an incidental command-side heuristic.

## Required Work

1. Define the recommendation zone in canonical Narada language:
   - authority owner
   - invariant grammar
   - admissible inputs
   - admissible outputs
2. State what recommendation is not:
   - not assignment
   - not a hidden scheduler override
   - not free-form advisory chat
3. Relate the zone to existing concepts:
   - self-governance
   - recommendation engine
   - promotion operator
   - assignment authority
4. Identify the durable artifact emitted by the zone.
5. Record the boundary between:
   - recommendation production
   - recommendation promotion
6. Place the result in canonical docs or chapter-local doctrine as appropriate.

## Acceptance Criteria

- [x] Recommendation is defined as a first-class zone
- [x] Assignment is explicitly excluded from the recommendation zone
- [x] The emitted recommendation artifact is named
- [x] The separate crossing into assignment is preserved
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined the recommendation and promotion machinery:
- `packages/layers/cli/src/lib/task-recommender.ts` — recommendation engine (6 scoring dimensions, read-only)
- `packages/layers/cli/src/commands/task-recommend.ts` — command wrapper (no mutations)
- `packages/layers/cli/src/commands/task-promote-recommendation.ts` — promotion operator (9 validation checks, delegates to taskClaimCommand)
- `SEMANTICS.md` §2.12 (advisory signals), §2.10 (promotion operators), §2.15 (crossing regimes)
- `packages/layers/control-plane/src/types/crossing-regime.ts` — canonical crossing inventory

### Key Findings

**Recommendation zone properties:**
- Authority class: `derive` (read-only advisory)
- Self-governed: Yes (can run automatically at `allowed_autonomy_level >= recommend`)
- Mutates state: **No** — zero write paths
- Output: Ephemeral `TaskRecommendation` with scored `CandidateAssignment[]`

**What recommendation is NOT:**
- NOT assignment (assignment is a separate governed crossing under `claim` authority)
- NOT a scheduler override (scheduler owns leases independently)
- NOT free-form chat (structured, deterministic, auditable)
- NOT durable (ephemeral only; promotion may snapshot it)

**Promotion crossing:**
- Authority: `propose` + `claim`
- 6 hard gates (never overridable) + 3 advisory checks
- Delegates all mutations to existing `taskClaimCommand` primitive
- Emits `AssignmentPromotionRequest` as append-only audit artifact

**Assignment crossing (canonical):**
- Source zone: `Agent` → Destination zone: `Task`
- Crossing artifact: `TaskAssignmentRecord`
- Authority owner: `Agent (claim)` or `Operator (admin)`

### Boundary Artifact

Written `.ai/decisions/20260424-552-recommendation-zone-boundary-contract.md` (~13 KB) containing:
- Recommendation zone definition with authority owner, invariant grammar, inputs/outputs
- 5 explicit "what recommendation is not" corrections
- Relation to self-governance, engine, promotion operator, assignment authority
- Durable artifact at the boundary: `AssignmentPromotionRequest`
- Visual boundary diagram (zone → crossing → zone)
- 5 invariants
- Next executable line: Task 553 (recommendation engine invariant enforcement)

## Verification

- Decision artifact exists and is ~13 KB ✅
- Recommendation defined as first-class zone with `derive` authority ✅
- Assignment explicitly excluded from zone ✅
- Boundary artifact (`AssignmentPromotionRequest`) named and documented ✅
- Promotion crossing preserves separate assignment authority ✅
- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
