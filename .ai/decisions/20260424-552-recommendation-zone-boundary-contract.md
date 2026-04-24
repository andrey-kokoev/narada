# Decision 552 — Recommendation Zone Boundary Contract

> **Status:** Closed  
> **Task:** 552  
> **Governed by:** task_close:a2  
> **Chapter:** Assignment Recommendation Zone And Promotion Crossing (552–556)

---

## Goal

Define assignment recommendation as a first-class Narada zone rather than as an incidental command-side heuristic.

---

## Why This Matters

Narada already contains recommendation and promotion machinery, but the semantics are blurred:

- Recommendation is treated like helper logic inside `task-recommend`.
- Assignment is sometimes discussed as if recommendation were already authoritative.
- The zone/crossing doctrine has not been explicitly applied to self-governance.

Without a clear zone boundary, operators and agents cannot distinguish:
- What is advisory vs. what is committed
- Who owns the recommendation surface
- What artifact marks the boundary between "suggested" and "assigned"

---

## The Recommendation Zone

### Definition

> The **Recommendation Zone** is the region of authority homogeneity that produces scored, ranked, advisory candidate assignments from task and agent state. It is read-only with respect to all durable stores. Its outputs are advisory signals consumed by operators, agents, and the construction loop.

### Authority Owner

| Property | Value |
|----------|-------|
| **Authority class** | `derive` |
| **Runtime trigger** | Operator command (`narada task recommend`) or construction loop plan phase |
| **Self-governed?** | Yes — the zone may run automatically at `allowed_autonomy_level >= recommend` |
| **Mutates state?** | **No** — the zone is strictly read-only |

### Invariant Grammar

1. **Recomputation determinism.** The same inputs (task graph, roster, assignments, posture) produce the same ranked output within rounding tolerance.
2. **No write paths.** No code inside the recommendation zone may call `writeFile`, `saveRoster`, `saveAssignment`, or any other mutation primitive.
3. **Ephemeral output.** `TaskRecommendation` objects exist only in memory. They are not persisted as durable records.
4. **Conflict resolution is greedy.** The top candidate wins; alternatives are preserved in the output but not queued for future execution.
5. **Score transparency.** Every candidate carries a per-dimension score breakdown and a human-readable rationale.

### Admissible Inputs

| Input | Source | Trust |
|-------|--------|-------|
| Task graph | `.ai/tasks/*.md` | authoritative |
| Agent roster | `.ai/agents/roster.json` | authoritative |
| Assignment history | `.ai/tasks/assignments/*.json` | authoritative |
| Work result reports | `.ai/tasks/reports/*.json` | authoritative |
| PrincipalRuntime snapshots | `JsonPrincipalRuntimeRegistry` | advisory (degrades gracefully) |
| CCC Posture | `.ai/construction-loop/posture.json` | advisory |

### Admissible Outputs

| Output | Type | Authority |
|--------|------|-----------|
| `TaskRecommendation` | Ephemeral object | advisory (`derive`) |
| `CandidateAssignment` | Sub-object within recommendation | advisory (`derive`) |
| `score` | Number [0, 1] | advisory (`derive`) |
| `confidence` | `high` / `medium` / `low` | advisory (`derive`) |
| `rationale` | Human-readable string | advisory (`derive`) |
| `risks` | Structured risk list | advisory (`derive`) |

---

## What Recommendation Is Not

| Misconception | Correction |
|--------------|------------|
| **Recommendation is assignment.** | No. Recommendation is advisory. Assignment is a separate governed crossing under `claim` authority. |
| **Recommendation is a hidden scheduler override.** | No. The scheduler owns leases and mechanical lifecycle. Recommendation feeds into the construction loop plan, but the scheduler does not consume recommendations directly. |
| **Recommendation is free-form advisory chat.** | No. Recommendations are structured, scored, auditable artifacts with explicit inputs and deterministic outputs. Chat is external and non-authoritative. |
| **Recommendation persists as a durable record.** | No. `TaskRecommendation` is ephemeral. The promotion operator may snapshot it inside an `AssignmentPromotionRequest`, but the recommendation itself is not durable. |
| **Recommendation can mutate task status.** | No. The recommendation zone has zero write paths. |

---

## Relation to Existing Concepts

### Self-Governance

The recommendation zone is part of Narada's **self-governance** layer — the system inspects its own state and proposes next actions. But self-governance does not imply self-authorization. The zone proposes; the operator (or a governed auto-promotion gate) decides.

### Recommendation Engine

The engine (`packages/layers/cli/src/lib/task-recommender.ts`) is the **implementation** of the recommendation zone. It is not the zone itself. The zone is the authority boundary; the engine is the code that lives inside it.

### Promotion Operator

The promotion operator (`task-promote-recommendation`) is the **crossing operator** that bridges the Recommendation zone and the Assignment zone. It:
1. Recomputes the recommendation for validation
2. Validates hard gates (task exists, claimable, dependencies met, agent available)
3. Checks advisory risks (write-set overlap, recommendation freshness)
4. Delegates mutation to the existing `taskClaimCommand` primitive
5. Writes an `AssignmentPromotionRequest` as audit trail

### Assignment Authority

Assignment is a **canonical crossing** under the `Task attachment / carriage` regime:

| Field | Value |
|-------|-------|
| Source zone | `Agent` |
| Destination zone | `Task` |
| Authority owner | `Agent (claim)` or `Operator (admin)` |
| Admissibility regime | Intent enum + dependency check + exclusivity |
| Crossing artifact | `TaskAssignmentRecord` |
| Confirmation rule | Roster reflects attachment; at most one unreleased primary carriage |

Recommendation is **upstream** of this crossing. It feeds into the operator's decision to trigger the crossing, but it is not part of the crossing itself.

---

## Durable Artifact Emitted by the Zone

The recommendation zone itself emits **no durable artifact**. Its output is purely ephemeral.

However, the **promotion crossing** (which sits at the boundary between the Recommendation zone and the Assignment zone) emits a durable artifact:

### `AssignmentPromotionRequest`

| Property | Value |
|----------|-------|
| **Location** | `.ai/tasks/promotions/{promotion_id}.json` |
| **Durability** | Append-only, immutable after write |
| **Owner** | Promotion operator (`propose` + `claim`) |
| **Contents** | `task_id`, `agent_id`, `operator_id`, `recommendation_snapshot`, `validation_results`, `status` (`executed` / `rejected` / `failed`), `overrides` |

This artifact preserves the basis for the promotion decision so it remains inspectable even if the task file, roster, or recommendation inputs change later.

---

## The Boundary: Recommendation Production vs. Promotion

| Aspect | Recommendation Production | Promotion |
|--------|--------------------------|-----------|
| **Zone** | Recommendation | Crossing (Recommendation → Assignment) |
| **Authority** | `derive` | `propose` + `claim` |
| **Trigger** | `narada task recommend` or construction loop plan | `narada task promote-recommendation` or construction loop run |
| **Mutates state?** | No | Yes (assignment record, task status, roster) |
| **Output** | Ephemeral `TaskRecommendation` | Durable `AssignmentPromotionRequest` + `TaskAssignmentRecord` |
| **Hard gates** | None (pure computation) | 6 invariant hard gates + 3 advisory checks |
| **Overrideable?** | N/A (no authority exercised) | Advisory risks only (write-set, freshness) |
| **Self-governed?** | Yes | Conditional (bounded auto-promotion at `bounded_auto`) |

### Visual Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                     RECOMMENDATION ZONE                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Task Graph  │    │ Agent Roster│    │ CCC Posture (adv.)  │  │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘  │
│         │                  │                      │             │
│         └──────────────────┼──────────────────────┘             │
│                            ▼                                     │
│                   ┌─────────────────┐                            │
│                   │ Recommendation  │  ← derive authority        │
│                   │ Engine          │                            │
│                   │ (read-only)     │                            │
│                   └────────┬────────┘                            │
│                            │                                     │
│                   Ephemeral TaskRecommendation                   │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │    PROMOTION CROSSING        │
              │  ┌─────────────────────┐    │
              │  │ AssignmentPromotion │    │ ← propose + claim
              │  │ Request (durable)   │    │
              │  └─────────────────────┘    │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │      ASSIGNMENT ZONE         │
              │  TaskAssignmentRecord        │
              │  Task status = claimed       │
              │  Roster status = working     │
              └─────────────────────────────┘
```

---

## Invariants

1. **Recommendation is advisory.** Removing every recommendation from the system must leave all durable boundaries intact and all authority invariants satisfiable.
2. **Recommendation has no write path.** No file, database, or network mutation may originate inside the recommendation zone.
3. **Promotion does not fabricate authority.** The promotion operator adds governance scaffolding (audit, snapshot, validation) but delegates all mutations to existing primitives with existing authority requirements.
4. **Hard gates are invariant.** The six hard validation gates (task exists, claimable status, dependencies, agent exists, agent available, no active assignment) are never overridable by policy or automation.
5. **Crossing artifact is append-only.** `AssignmentPromotionRequest` records are written once and never mutated. Status transitions are recorded as new fields, not state changes.

---

## Verification Evidence

- `task-recommender.ts` has no `.run(`, `.exec(`, `writeFile`, or `save` calls ✅
- `task-recommend.ts` returns ephemeral output; no side effects ✅
- `task-promote-recommendation.ts` delegates mutation to `taskClaimCommand` ✅
- 9 validation checks documented (6 hard + 3 advisory) ✅
- `AssignmentPromotionRequest` is append-only JSON in `.ai/tasks/promotions/` ✅
- `pnpm typecheck`: all 11 packages pass ✅

---

## Closure Statement

The Recommendation Zone is now a first-class Narada zone with explicit authority (`derive`), explicit invariants (read-only, ephemeral, deterministic), and explicit boundaries (no mutation, no assignment authority, no scheduler override). Assignment is explicitly excluded from the zone; it is a separate governed crossing under the `Task attachment / carriage` regime. The durable artifact at the boundary is the `AssignmentPromotionRequest`, which preserves the recommendation snapshot and validation results for audit.

---

## Next Executable Line

**Task 553 — Recommendation Engine Invariant Enforcement:** Add static or runtime guards that verify the recommendation zone has no write paths (e.g., lint rule banning `writeFile` in `task-recommender.ts`, test asserting no mutation side effects).

---

**Closed by:** a2  
**Closed at:** 2026-04-24
