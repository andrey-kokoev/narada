---
closes_tasks: [555]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: codex
governance: derive -> propose -> claim
---

# Decision 555 — Recommendation-To-Assignment Crossing Contract

## Problem

Narada has a working recommendation engine (`task-recommend`) and a working promotion operator (`task-promote-recommendation`), but the boundary between them is implicit. Recommendation and assignment could collapse if downstream consumers treat a recommendation artifact as sufficient authority for assignment, or if the promotion operator skips validation gates because it trusts the recommendation.

This decision makes the crossing explicit: recommendation lives in an advisory zone; assignment lives in an authoritative zone; and the crossing between them is governed by its own regime with independent validation, durable artifacts, and operator visibility.

---

## Execution Notes

### What Was Analyzed

1. **`packages/layers/cli/src/commands/task-promote-recommendation.ts`** (512 lines)
   - 9 validation checks executed at promotion time
   - `AssignmentPromotionRequest` durable artifact with `recommendation_snapshot`
   - Override mechanism for `write_set_risk` and `recommendation_fresh`
   - Hard failure vs soft warning distinction
   - Delegation to `taskClaimCommand` after all validations pass
   - 1-hour freshness window (`RECOMMENDATION_TTL_MS = 60 * 60 * 1000`)

2. **`packages/layers/cli/src/lib/task-recommender.ts`** (747 lines)
   - `TaskRecommendation` artifact shape
   - Greedy conflict resolution ensures one task per principal
   - Risk categories that can block candidates at recommendation time

3. **`packages/layers/control-plane/src/types/crossing-regime-inventory.ts`**
   - Existing 11 crossings (7 canonical, 3 advisory, 1 deferred)
   - "Task attachment / carriage" already exists as Agent → Task crossing
   - No recommendation → assignment crossing previously declared

4. **Crossing regime type system**
   - `CrossingRegimeDeclaration`: 6 irreducible fields
   - `CrossingRegimeKind`: 6 regime kinds
   - `validateCrossingRegimeDeclaration()` mechanical validation

### What Was Decided

| Finding | Decision |
|---------|----------|
| Promotion already performs 9 independent validations | Codify these as the canonical admissibility regime |
| `AssignmentPromotionRequest` already exists | Name it as the canonical crossing artifact |
| Freshness window is hardcoded to 1 hour | Document as v1 bound; defer policy-driven TTL |
| Override covers only write_set and freshness | Document that override is operator-owned and audit-logged |
| Task attachment crossing already exists in inventory | Add recommendation → assignment as distinct advisory crossing |

### What Was Changed

- Added `Recommendation → Assignment` entry to `CROSSING_REGIME_INVENTORY` in `crossing-regime-inventory.ts`
- No other code changes

---

## Crossing Declaration

### Six Irreducible Fields

| Field | Value |
|-------|-------|
| **source_zone** | `Recommendation` |
| **destination_zone** | `Task Assignment` |
| **authority_owner** | `Operator (claim)` for normal promotion; `Operator (admin)` for override |
| **admissibility_regime** | 9 validation checks + freshness window + policy gate (see below) |
| **crossing_artifact** | `AssignmentPromotionRequest` |
| **confirmation_rule** | Assignment record durably created + task status transitioned to `claimed` |

### Regime Kind

`policy_governed` — The crossing is gated by explicit validation rules and operator policy, not by self-certification or downstream reconciliation.

### Anti-Collapse Invariant

**Prevents advisory scoring from becoming authoritative assignment without independent validation.**

---

## Promotion Preconditions

The admissibility regime consists of 9 validation checks plus 2 policy gates. All checks are executed at promotion time; the recommendation artifact is consumed, not trusted.

### Validation Checks

| # | Check | Passing Condition | Hard Failure? | Overrideable? |
|---|-------|-------------------|---------------|---------------|
| 1 | `task_exists` | Task file found by number | Yes | No |
| 2 | `task_status` | Status is `opened` or `needs_continuation` | Yes | No |
| 3 | `dependencies` | All `depends_on` tasks are `closed` or `confirmed` | Yes | No |
| 4 | `agent_exists` | Agent ID exists in roster | Yes | No |
| 5 | `agent_available` | Agent status is `idle` or `done` | Yes | No |
| 6 | `no_active_assignment` | No unreleased assignment exists for this task | Yes | No |
| 7 | `write_set_risk` | No `severity: high` write_set risk on candidate | Yes | **Yes** |
| 8 | `recommendation_fresh` | Recommendation generated within 1 hour AND task+agent pair still recommended | Yes | **Yes** |
| 9 | `principal_unavailable` | PrincipalRuntime state is not `unavailable`/`stale`/`failed`/`budget_exhausted` | Yes | No |

### Policy Gates

| Gate | Rule |
|------|------|
| **Auto-promotion** | Only allowed when `allowed_autonomy_level = bounded_auto` AND `require_operator_approval_for_promotion = false` AND all validation gates pass |
| **Override** | Operator may override `write_set_risk` and `recommendation_fresh` with `--override-risk <reason>`; override reason is audit-logged |

### Hard Failure Classification

When hard failures exist, the promotion request is recorded with status:
- `rejected` — for dependency failures, agent unavailability, active assignment
- `stale` — for task status changed or recommendation expired
- `failed` — for claim delegation failure

---

## Durable Artifacts

### Crossing Artifact: `AssignmentPromotionRequest`

```typescript
interface AssignmentPromotionRequest {
  promotion_id: string;
  recommendation_id: string;
  task_id: string;
  task_number: number | null;
  agent_id: string;
  architect_id: string | null;
  requested_by: string;
  requested_at: string;
  executed_at: string | null;
  status: 'requested' | 'executed' | 'rejected' | 'stale' | 'failed';
  recommendation_snapshot: {
    generated_at: string;
    recommender_id: string;
    primary: {
      task_id: string;
      principal_id: string;
      score: number;
      confidence: string;
      rationale: string;
    } | null;
  };
  validation_results: ValidationResult[];
  failure_reason?: string;
  override_reason?: string;
  assignment_id?: string;
}
```

**Storage**: `.ai/tasks/promotions/${promotion_id}.json` — atomic write.

### Confirmation Artifact: Task Assignment Record

On successful promotion, `taskClaimCommand` produces:
- Assignment record in `.ai/tasks/assignments/${task_id}.json`
- Task status transitioned to `claimed`
- Roster updated with agent assignment (if applicable)

The `assignment_id` field in the promotion request links the crossing artifact to its confirmation.

---

## Operator Visibility and Override

### Visibility

| Surface | What Operator Sees |
|---------|-------------------|
| `narada task promote-recommendation --dry-run` | All 9 validation results with pass/fail and detail |
| `narada task promote-recommendation` | Promotion result + validation results + assignment ID on success |
| `narada workbench` | Promotion queue with status, override indicators, failure reasons |
| `.ai/tasks/promotions/*.json` | Full durable promotion request including snapshot and override reason |

### Override Posture

- Override is **operator-owned** and **audit-logged**
- Only `write_set_risk` and `recommendation_fresh` may be overridden
- Override reason is required (`--override-risk <reason>`)
- Override does not bypass other hard gates (dependencies, agent existence, active assignment)
- Promotion request records `override_reason` for later inspection

---

## Non-Goals

1. **No blind heuristic autoassign.** The system never assigns a task without explicit validation, even in `bounded_auto` mode.
2. **No bypass of assignment governance.** `task-promote-recommendation` delegates to `task-claim`, which enforces its own exclusivity and dependency checks.
3. **No generic crossing runtime.** This decision declares the regime; it does not introduce a `CrossingRegime` class or generic orchestration.
4. **No policy-driven TTL.** The 1-hour freshness window is hardcoded v1. Policy-driven TTL is deferred.
5. **No cryptographic assignment identity.** Assignment records are filesystem-based; cryptographic signing is deferred.

---

## Verification Evidence

| Check | Result |
|-------|--------|
| Crossing regime 6-field validation | Passes `validateCrossingRegimeDeclaration()` |
| Inventory entry added | `CROSSING_REGIME_INVENTORY` now contains 12 entries |
| Promotion test coverage | 21 tests in `task-promote-recommendation.test.ts` covering all 9 validation checks, override, dry-run, hard failures |
| Freshness boundary | 1-hour TTL verified in code (`RECOMMENDATION_TTL_MS`) |
| Audit trail | Promotion request durably stored with snapshot, validation results, override reason |
| Delegation integrity | Successful promotion delegates to `taskClaimCommand`; claim enforces its own gates |
| `pnpm typecheck` | All 12 packages pass |
| `pnpm verify` | 5/5 steps pass |

---

## Governed Closure Provenance

| Field | Value |
|-------|-------|
| **Closed by** | a2 |
| **Closed at** | 2026-04-24 |
| **Governance mode** | `derive` → `propose` → `claim` |
| **Authority class** | `propose` (defines promotion contract; no durable state mutated by this task itself) |
| **Review required by** | codex |
| **Closure basis** | All 6 acceptance criteria satisfied; crossing declared in 6-field regime language; 9 preconditions enumerated; durable artifacts named; operator override/visibility documented; non-goals explicit; inventory updated |
| **Code changes** | 1 file: `crossing-regime-inventory.ts` — 1 new advisory crossing entry added |

---

## Closure Statement

Task 555 is closed. The recommendation-to-assignment crossing is now a **declared, governed boundary** with its own crossing regime, independent of the recommendation zone and the assignment zone. The 9 validation checks, freshness window, policy gates, override posture, and durable artifacts are all explicitly documented. The crossing is added to the canonical inventory as an advisory regime, acknowledging that it is a real authority-changing boundary but less structurally central than the core control-plane crossings.
