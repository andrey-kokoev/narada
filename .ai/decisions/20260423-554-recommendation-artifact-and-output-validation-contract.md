---
closes_tasks: [554]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: codex
governance: derive -> propose
---

# Decision 554 — Recommendation Artifact and Output Validation Contract

## Problem

Narada's assignment recommendation exists as working code (`task-recommend`, `task-recommender.ts`, `task-promote-recommendation`) but lacks a canonical contract that defines:
- The exact shape of the recommendation artifact
- What the artifact is *not* (non-authoritative posture)
- Deterministic validation rules for output correctness
- When the system must abstain rather than recommend
- How operators and downstream systems may inspect and consume recommendations

Without this contract, the boundary between recommendation (advisory) and assignment (authoritative) is implicit and vulnerable to drift.

---

## Execution Notes

### What Was Analyzed

1. **`packages/layers/cli/src/lib/task-recommender.ts`** (747 lines)
   - Core types: `TaskRecommendation`, `CandidateAssignment`, `ScoreBreakdown`, `RecommendationReason`, `RecommendationRisk`, `AbstainedTask`
   - Six weighted scoring dimensions: affinity (0.30), capability (0.25), load (0.20), history (0.10), review_separation (0.10), budget (0.05)
   - Confidence classification thresholds: `high` (≥0.8 with 0.2 margin), `medium` (≥0.5), `low` (<0.5)
   - Greedy conflict resolution: one task per principal, one principal per task
   - Graceful degradation: missing PrincipalRuntime → all agents treated as available; missing assignment history → 50% history score

2. **`packages/layers/cli/src/commands/task-recommend.ts`** (254 lines)
   - CLI surface with `--format json|human`, `--agent`, `--task`, `--limit`
   - CCC posture integration with five coordinate adjustments
   - Read-only guarantee: no file writes, no task mutations, no roster updates

3. **`packages/layers/cli/src/commands/task-promote-recommendation.ts`** (512 lines)
   - Nine validation checks executed at promotion time (task_exists, task_status, dependencies, agent_exists, agent_available, no_active_assignment, write_set_risk, recommendation_fresh, principal_unavailable)
   - Durable promotion request artifact with `recommendation_snapshot`
   - Override mechanism for write_set and freshness checks
   - Hard failure vs soft warning distinction

4. **Test corpus**
   - `task-recommend.test.ts`: 18 tests
   - `task-promote-recommendation.test.ts`: 21 tests
   - Total: 39 tests covering recommendation generation, validation gates, override behavior, dry-run, abstain conditions

### What Was Decided

| Finding | Decision |
|---------|----------|
| Existing types already capture the artifact shape | Document them as canonical; no type changes needed |
| Confidence thresholds are hardcoded magic numbers | Document them as v1 bounds; defer parameterization |
| Score rounding to 3 decimals may hide tie differences | Document tie-break by roster order as canonical |
| `AbstainedTask` has only `reason: string` | Sufficient for v1; defer structured abstain taxonomy |
| Promotion re-validates everything independently | Explicitly state that recommendation is *consumed*, not *trusted* |
| `generated_at` includes wall-clock time | Accept as non-deterministic element; reproducibility bounded to same snapshot + same code version |

### What Was NOT Changed

No code was modified. This is a pure contract/documentation task. The decision artifact codifies what already exists and makes implicit boundaries explicit.

---

## Recommendation Artifact Shape

The canonical recommendation artifact is `TaskRecommendation`:

```typescript
interface TaskRecommendation {
  recommendation_id: string;   // `rec-${timestamp}` — advisory trace id
  generated_at: string;        // ISO-8601 timestamp of generation
  recommender_id: string;      // Principal that produced the recommendation
  primary: CandidateAssignment | null;
  alternatives: CandidateAssignment[];
  abstained: AbstainedTask[];
  summary: string;
}
```

### Candidate Assignment

```typescript
interface CandidateAssignment {
  task_id: string;
  task_number: number | null;
  task_title: string | null;
  principal_id: string;
  principal_type: 'operator' | 'agent' | 'worker' | 'external';
  score: number;               // Composite [0.0, 1.0], rounded to 3 decimals
  confidence: 'high' | 'medium' | 'low';
  breakdown: ScoreBreakdown;
  rationale: string;
  reasons: RecommendationReason[];
  risks: RecommendationRisk[];
}
```

### Score Breakdown

| Dimension | Weight | Source | Authority |
|-----------|--------|--------|-----------|
| affinity | 0.30 | Task `continuation_affinity` + assignment history | Advisory |
| capability | 0.25 | Keyword extraction vs roster capabilities | Advisory |
| load | 0.20 | Roster `status` | Advisory |
| history | 0.10 | Completion/abandonment ratio | Derived |
| review_separation | 0.10 | Last worker on same task | Derived |
| budget | 0.05 | PrincipalRuntime snapshot | Advisory |

### Risk Flags

```typescript
interface RecommendationRisk {
  category: 'blocked' | 'write_set' | 'review_separation' | 'budget' | 'capability_gap' | 'workload' | 'availability';
  severity: 'none' | 'low' | 'medium' | 'high';
  description: string;
}
```

Risks with `severity === 'high'` in `availability`, `workload`, or `budget` cause candidate skip. All other risks are carried forward for operator inspection.

### Abstained Tasks

```typescript
interface AbstainedTask {
  task_id: string;
  task_number: number | null;
  reason: string;
}
```

---

## Non-Authoritative Posture

| Assertion | Rationale |
|-----------|-----------|
| **Not an assignment** | No `assignment.json` written; no task front-matter mutated; no roster updated. |
| **Not a claim** | Recommender does not acquire authority. `task-recommend` is `derive`/`propose` class, not `claim`. |
| **Not authority to bypass promotion** | `task-promote-recommendation` re-validates every precondition independently. |
| **Not deterministic across time** | Same inputs at different times yield different `recommendation_id` and `generated_at`. |
| **Not a promise of availability** | PrincipalRuntime state is advisory and may change before promotion. |

---

## Deterministic Output Validation

A recommendation artifact is **structurally valid** when:

### Structural Completeness
- `recommendation_id` non-empty, matches `rec-\d+`
- `generated_at` parseable ISO-8601
- `recommender_id` non-empty
- If `primary` non-null, all `CandidateAssignment` fields present, `score ∈ [0.0, 1.0]`
- `breakdown` has all six dimensions, values in `[0.0, 1.0]`
- `confidence ∈ ['high', 'medium', 'low']`
- Every risk has `severity ∈ ['none', 'low', 'medium', 'high']`

### Admissible Snapshot
- Task directory readable (graceful degradation to empty)
- Roster readable (graceful degradation to empty)
- PrincipalRuntime advisory (missing → all available)
- No contradictory task states

### Reproducibility
Given same task files, roster, assignment history, PrincipalRuntime snapshots, and code version → same runnable set, same scores (within float tolerance), same partitioning.

**Non-deterministic elements**: `recommendation_id` (timestamp), `generated_at` (wall-clock). Tie-breaking: roster array order.

### Tie-Break and Abstain Rules

| Condition | Rule |
|-----------|------|
| Identical score for same task | Higher roster index wins |
| One principal best for multiple tasks | Greedy: highest-scoring pair wins first |
| No principal scores > 0 | Task abstained |
| All principals unavailable | All runnable tasks abstained |
| Empty roster | All runnable tasks abstained |

---

## Abstain Conditions

The recommender MUST abstain when:

| Condition | Reason | Hard/Soft |
|-----------|--------|-----------|
| Unmet dependencies | "Blocked by unmet dependencies" | Hard |
| Status is `in_review` | "Completed, awaiting review or closure" | Hard |
| No agent scored > 0 | "No available principal with suitable capabilities" | Hard |
| PrincipalRuntime `budget_exhausted` | Skipped at candidate; all skipped → abstained | Hard |
| PrincipalRuntime `unavailable`/`stale`/`failed` | Skipped at candidate | Hard |
| Active work item | Skipped at candidate | Hard |

Soft carries (included as risk, not abstained): capability gap, write-set overlap, review separation.

---

## Inspection Posture

### Operator Visibility
- `narada task recommend --format json` — full artifact
- `narada task recommend --format human` — condensed summary
- `narada workbench` API — `/recommendations` endpoint

### Durable Audit Trail
Promotion stores `recommendation_snapshot` (subset: generated_at, recommender_id, primary) in `AssignmentPromotionRequest`, preserving inspectability after ephemeral `rec-*` ages out.

### Non-Authoritative Consumption
- Scheduler MAY use as reordering hint
- Operator console MAY display for review
- Promotion operator MUST re-validate every precondition
- No component may transition task state solely on recommendation presence

---

## Verification Evidence

| Check | Result |
|-------|--------|
| Existing type coverage | `TaskRecommendation`, `CandidateAssignment`, `ScoreBreakdown`, `RecommendationRisk`, `AbstainedTask` all defined in `task-recommender.ts` |
| Test coverage | 39 tests (18 recommend + 21 promote) covering generation, validation, override, dry-run, abstain |
| Structural validation | All six score dimensions present; weights sum to 1.0; confidence enum is exhaustive |
| Reproducibility | Greedy conflict resolution is deterministic given stable roster order; score rounding to 3 decimals bounds float variance |
| Graceful degradation | Verified in code: missing runtime → empty map; missing assignments → 50% history; missing roster → empty agents array |
| Non-authoritative | `task-recommend` performs zero file writes; `task-promote-recommendation` re-validates all 9 checks independently |
| `pnpm typecheck` | All 12 packages pass |
| `pnpm verify` | 5/5 steps pass |

---

## Governed Closure Provenance

| Field | Value |
|-------|-------|
| **Closed by** | a2 |
| **Closed at** | 2026-04-24 |
| **Governance mode** | `derive` → `propose` |
| **Authority class** | `derive` (read-only contract definition; no mutation of durable state) |
| **Review required by** | codex (per task assignment record) |
| **Closure basis** | Task 554 acceptance criteria fully satisfied; artifact shape documented from existing types; non-authoritative posture explicit; validation rules derived from existing implementation; abstain conditions enumerated from code paths; inspection posture recorded; verification evidence referenced |
| **No code changes** | This closure is documentation-only. No files were modified. |

---

## Closure Statement

Task 554 is closed. The recommendation artifact shape, output validation rules, abstain conditions, and inspection posture are now canonically documented. The contract maps 1:1 to the existing implementation in `task-recommender.ts` and `task-promote-recommendation.ts` — no code drift was introduced. The boundary between advisory recommendation and authoritative assignment is explicit: recommendation is consumed, not trusted, and promotion re-validates every precondition independently.
