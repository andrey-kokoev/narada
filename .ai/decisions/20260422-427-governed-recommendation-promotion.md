# Decision: Governed Promotion — Recommendation to Assignment

**Date:** 2026-04-22
**Task:** 427
**Depends on:** 426 (Assignment Recommendation Implementation), 425 (Work Result Report), 413 (Review Separation / Write-Set), 412 (PrincipalRuntime Contract), 411 (Assignment Planner Design)
**Chapter:** Construction Operation (410–415)
**Verdict:** **Design accepted. Implementation deferred to post-415 or dedicated implementation task.**

---

## 1. Source and Target Objects

The promotion path involves five distinct objects. Each has a clear durability model and owner.

| Object | Durability | Owner | Authority | Role |
|--------|------------|-------|-----------|------|
| `TaskRecommendation` | Ephemeral / optionally recorded | Recommender (Task 426) | `inspect` (read-only) | Advisory source; scored, ranked candidate assignments |
| `AssignmentPromotionRequest` | Durable (append-only file) | Promotion operator | `claim` | Operator-selected intent to promote one recommendation candidate |
| `TaskAssignmentRecord` | Durable (JSON in `.ai/tasks/assignments/`) | Task governance | `claim` | Authoritative claim history for a task |
| Task front matter | Durable (Markdown file) | Task governance | `claim` | Authoritative task status (`opened` → `claimed`) |
| Roster entry | Durable (JSON in `.ai/agents/roster.json`) | Operator / task governance | `claim` + `resolve` | Agent tracking state (`idle` → `working`) |

### 1.1 Object Diagram

```
┌─────────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────────┐
│  TaskRecommendation     │     │  AssignmentPromotionRequest │     │  TaskAssignmentRecord   │
│  (advisory, ephemeral)  │────▶│  (durable, append-only)     │────▶│  (durable, mutable)     │
│                         │     │                             │     │                         │
│  • recommendation_id    │     │  • promotion_id             │     │  • task_id              │
│  • primary              │     │  • recommendation_id        │     │  • assignments[]        │
│  • alternatives         │     │  • task_number              │     │                         │
│  • abstained            │     │  • agent_id                 │     └───────────┬─────────────┘
│  • generated_at         │     │  • requested_by             │                 │
│                         │     │  • requested_at             │                 ▼
└─────────────────────────┘     │  • executed_at              │     ┌─────────────────────────┐
                                │  • status                   │     │  Task front matter      │
                                │  • recommendation_snapshot  │     │  (durable, mutable)     │
                                │  • validation_results       │     │                         │
                                │  • override_reason          │     │  • status: claimed      │
                                │  • assignment_id            │     │  • claimed_by           │
                                └─────────────────────────────┘     └─────────────────────────┘
```

**Key invariant:** `TaskRecommendation` is never authoritative. Even after promotion, the recommendation record remains advisory. The `AssignmentPromotionRequest` is the first durable object that records operator intent, but it is still *pre* the actual assignment mutation. The `TaskAssignmentRecord` and task front matter are the only authoritative boundaries.

---

## 2. Promotion Authority

### 2.1 Authority Classes

| Action | Required Authority | Rationale |
|--------|-------------------|-----------|
| Read recommendation | `inspect` (or no authority) | Recommendations are advisory signals; anyone may observe |
| Create promotion request | `claim` | Promotion is a claim-preparation step; it reserves the right to claim |
| Execute promotion (write assignment + task status) | `claim` | Same authority as `narada task claim`; promotion does not elevate authority |
| Override stale/high-risk recommendation | `claim` + `--override-risk <reason>` | Same base authority, but explicit audit trail required |
| Override write-set conflict | `claim` + `--override-risk <reason>` | Operator acknowledges risk; system records reason |
| Override dependency failure at promotion time | `admin` | Dependencies are hard gates; bypassing them is a system-level decision |

### 2.2 Why `claim` Is Sufficient

The promotion operator is semantically equivalent to:

```
operator reads recommendation
  → operator decides to act
  → operator runs narada task claim <task> --agent <id>
```

The promotion path merely **structures and audits** this manual sequence. It does not grant new capabilities. Therefore, the same `claim` authority that governs `narada task claim` governs promotion.

If an operator has `claim` but not `admin`, they may promote any recommendation that passes validation. They may override advisory risks (write-set conflict, stale recommendation) with an explicit reason. They may **not** override a hard dependency failure.

---

## 3. Lifecycle and Validation

### 3.1 Promotion State Machine

```
                      ┌─────────────────┐
                      │   RECOMMENDED   │  ← TaskRecommendation produced
                      │   (ephemeral)   │
                      └────────┬────────┘
                               │ operator selects candidate
                               ▼
                      ┌─────────────────┐
                      │   REQUESTED     │  ← AssignmentPromotionRequest created
                      │   (durable)     │
                      └────────┬────────┘
                               │ validate(current state)
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌──────────┐    ┌──────────┐     ┌──────────┐
       │ EXECUTED │    │ REJECTED │     │  STALE   │
       │(durable) │    │(durable) │     │(durable) │
       └────┬─────┘    └──────────┘     └──────────┘
            │
            ▼
    ┌───────────────┐
    │ Task claimed  │  ← TaskAssignmentRecord + front matter mutated
    │ Roster updated│
    └───────────────┘
```

**States:**

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `requested` | Operator has selected a candidate; validation pending | No |
| `executed` | Assignment written atomically; task claimed; roster updated | Yes |
| `rejected` | Validation failed; no mutation performed | Yes |
| `stale` | Recommendation expired or state changed between generation and promotion | Yes |
| `failed` | Unexpected error during atomic write (e.g., disk failure) | Yes |

### 3.2 Validation Table

Validation re-checks **current state** at promotion time. The recommendation may have been generated minutes or hours earlier.

| # | Check | Failure Result | Overrideable? |
|---|-------|----------------|---------------|
| 1 | Task file exists and is readable | `rejected` — `task_not_found` | No |
| 2 | Task status is `opened` or `needs_continuation` | `stale` — `task_status_changed` | No |
| 3 | Task dependencies are satisfied (re-run `checkDependencies`) | `rejected` — `dependencies_unmet` | Only with `admin` |
| 4 | Agent exists in roster | `rejected` — `agent_not_found` | No |
| 5 | Agent roster status is assignable (`idle`, `done`, or `working` with capacity) | `rejected` — `agent_unavailable` | No |
| 6 | No active assignment exists for this task | `rejected` — `already_claimed` | No |
| 7 | Write-set risk is not `high` severity | `rejected` — `write_set_conflict` | Yes, with `--override-risk` |
| 8 | Recommendation has not expired (default TTL: 1 hour) | `stale` — `recommendation_expired` | Yes, with `--override-risk` |
| 9 | PrincipalRuntime state (if available) does not exclude agent | `rejected` — `principal_unavailable` | No |

**Validation order:** Checks 1–3 are task-level; checks 4–6 are agent-level; checks 7–9 are risk-level. Early failure short-circuits.

### 3.3 Atomicity Guarantee

The promotion atomic unit is:

```
BEGIN:
  1. Write AssignmentPromotionRequest with status = "executed"
  2. Append assignment to TaskAssignmentRecord
  3. Update task front matter status → "claimed"
  4. Update roster entry status → "working", current_task → task_number
END
```

If any step fails, all prior steps in the transaction must be rolled back. The promotion request is left in status `failed` with `failure_reason` describing the partial state.

In the current file-based storage model, atomicity is approximated via:
1. Write promotion request first (idempotent: can be re-run if already `executed`)
2. Use `atomicWriteFile` for assignment, task file, and roster updates
3. On failure, attempt to mark promotion request as `failed`

---

## 4. Audit Record

### 4.1 Schema

```typescript
interface AssignmentPromotionRequest {
  /** Unique promotion ID (promotion-{timestamp}-{random}) */
  promotion_id: string;

  /** The recommendation this promotion is based on */
  recommendation_id: string;

  /** The selected candidate from the recommendation */
  task_id: string;
  task_number: number | null;
  agent_id: string;

  /** Who requested the promotion */
  requested_by: string;
  requested_at: string;

  /** When the promotion was executed (null until then) */
  executed_at: string | null;

  /** Terminal status */
  status: 'requested' | 'executed' | 'rejected' | 'stale' | 'failed';

  /** Snapshot of the recommendation at promotion time */
  recommendation_snapshot: {
    generated_at: string;
    primary: {
      task_id: string;
      principal_id: string;
      score: number;
      confidence: string;
      rationale: string;
    } | null;
  };

  /** Results of each validation check */
  validation_results: ValidationResult[];

  /** If status is rejected/stale/failed */
  failure_reason?: string;

  /** If operator overrode a risk */
  override_reason?: string;

  /** Reference to the created assignment (null until executed) */
  assignment_id?: string;
}

interface ValidationResult {
  check: string;
  passed: boolean;
  detail?: string;
}
```

### 4.2 Storage Path

```
.ai/
  tasks/
    promotions/
      promotion-{timestamp}-{task-id}.json   # AssignmentPromotionRequest
```

The promotion directory is **append-only**. Records are never updated in place; if a promotion is retried, a new record is created. The `status` field on the record describes the outcome of that specific attempt.

### 4.3 Preserving Evidence

The `recommendation_snapshot` field preserves the recommendation evidence even if:
- The task file is later modified
- The roster entry is updated
- The recommendation record is garbage-collected
- The agent is removed from the roster

This satisfies the audit requirement that the basis for the promotion decision remains inspectable.

---

## 5. CLI Surface

### 5.1 Chosen Surface: `narada task promote-recommendation`

```bash
narada task promote-recommendation <recommendation-id> \
  --by <operator-id>          # Required: who is promoting
  --task <task-number>        # Optional: verify the task matches rec
  --agent <agent-id>          # Optional: verify the agent matches rec
  --override-risk <reason>    # Optional: proceed despite stale/write-set risk
  --dry-run                   # Validate only; do not mutate
  --format json|human|auto    # Output format
  --cwd <path>                # Working directory
```

**Why this surface:**

- `promote-recommendation` makes the promotion step **explicit**. It is not `claim` (which is the underlying mutation) and not `assign` (which implies direct assignment without recommendation).
- The verb `promote` signals a **governed transition** from advisory to authoritative, consistent with the promotion-operator family.
- The noun `recommendation` keeps the advisory source in the name, reinforcing that the recommendation itself does not grant authority.

**Rejected alternatives:**

| Alternative | Why Rejected |
|-------------|--------------|
| `narada task assign --from-recommendation` | `assign` is too close to direct assignment; obscures the governance step |
| `narada task claim --recommendation-id` | Overloads `claim` with promotion semantics; claim should remain the low-level primitive |
| `narada task accept-recommendation` | `accept` implies the recommendation was offered by an authority; recommendations are advisory, not offers |

### 5.2 Output Formats

**Human (default):**

```
Promotion requested: promotion-20260422-427-abc123
  Recommendation: rec-20260422-427
  Task: 427 — Governed Promotion Design
  Agent: architect-alpha
  Requested by: operator-kimi

Validation:
  ✓ Task exists and is claimable
  ✓ Dependencies satisfied
  ✓ Agent exists and is available
  ⚠ Write-set conflict with task 426 (packages/layers/cli/src/lib/task-recommender.ts)
  ✓ Recommendation is fresh (generated 5 minutes ago)

Override: none

Result: EXECUTED
  Assignment: assignment-20260422-427-abc123
  Task status: claimed
  Roster status: working
```

**JSON:**

```json
{
  "status": "executed",
  "promotion_id": "promotion-20260422-427-abc123",
  "recommendation_id": "rec-20260422-427",
  "task_id": "20260422-427-governed-promotion-recommendation-to-assignment",
  "agent_id": "architect-alpha",
  "requested_by": "operator-kimi",
  "requested_at": "2026-04-22T15:00:00Z",
  "executed_at": "2026-04-22T15:00:01Z",
  "validation_results": [
    { "check": "task_exists", "passed": true },
    { "check": "task_status", "passed": true },
    { "check": "dependencies", "passed": true },
    { "check": "agent_exists", "passed": true },
    { "check": "agent_available", "passed": true },
    { "check": "no_active_assignment", "passed": true },
    { "check": "write_set_risk", "passed": false, "detail": "overlap with task 426" },
    { "check": "recommendation_fresh", "passed": true }
  ],
  "override_reason": null,
  "assignment_id": "assignment-20260422-427-abc123"
}
```

### 5.3 Dry Run

`--dry-run` runs all validation checks and prints the promotion request that *would* be created, but does not:
- Write the promotion request file
- Append to the assignment record
- Mutate the task front matter
- Update the roster

This allows operators to preview the outcome before committing.

### 5.4 Override Semantics

When `--override-risk <reason>` is provided:

1. Validation checks 7 (write-set conflict) and 8 (recommendation expired) are treated as **warnings**, not failures.
2. The `override_reason` field is populated with the operator-provided reason.
3. The promotion proceeds to execution if all other checks pass.
4. The override is recorded in the audit trail and surfaced in observation queries.

If `--override-risk` is provided but no risk exists, the promotion proceeds normally and `override_reason` is still recorded (operator was being cautious).

---

## 6. Relation to Existing Commands

### 6.1 Promotion Reuses `task claim` Internally

The promotion command **delegates** to the existing `task claim` validation and mutation logic. It does not duplicate mutation code.

```
promote-recommendation:
  1. Load recommendation (from ephemeral memory or optional durable store)
  2. Validate recommendation_id, task_id, agent_id consistency
  3. RUN taskClaimCommand({ taskNumber, agent, reason, dryRun })
     → reuses all claim validation (task exists, status, dependencies, agent, no active assignment)
  4. IF claim validation fails:
       CREATE promotion record with status = "rejected" or "stale"
       RETURN failure
  5. IF --dry-run:
       RETURN preview
  6. RUN taskClaimCommand (for real)
     → reuses all claim mutation (assignment record, task file, roster)
  7. CREATE promotion record with status = "executed"
  8. RETURN success
```

**Why this design:**

- `task claim` is the **single source of truth** for assignment validation and mutation.
- Promotion adds **governance scaffolding** (audit trail, recommendation snapshot, override tracking) around the existing primitive.
- If `task claim` validation rules change, promotion automatically inherits them.
- No duplicate mutation logic means no risk of divergence.

### 6.2 Integration Map

| Existing Surface | How Promotion Uses It |
|------------------|----------------------|
| `narada task recommend` (Task 426) | Source of recommendations; promotion references `recommendation_id` |
| `narada task claim` | **Underlying primitive** — promotion delegates validation and mutation to claim |
| `narada task roster assign` | Obsolete; roster is updated by `task claim` during promotion |
| Assignment record (`saveAssignment`) | Written by `task claim`; promotion records the `assignment_id` |
| `checkDependencies` | Called inside `task claim`; promotion inherits dependency gating |
| WorkResultReport (Task 425) | Not directly used in promotion; may be referenced in future for write-set manifest |
| Review separation (Task 413) | Surfaces as advisory risk in recommendation; promotion may warn but does not block |

### 6.3 Non-Duplication Contract

The promotion implementation must not:
- Re-implement task status validation (use `task claim`)
- Re-implement dependency checking (use `checkDependencies` via `task claim`)
- Re-implement assignment record writing (use `saveAssignment` via `task claim`)
- Re-implement roster updating (use `task claim`)
- Re-implement front matter mutation (use `writeTaskFile` via `task claim`)

The only **new** mutation is writing the `AssignmentPromotionRequest` record to `.ai/tasks/promotions/`.

---

## 7. Residual Risks

| Risk | Mitigation | Residual |
|------|-----------|----------|
| Recommendation stale by the time operator sees it | TTL check + `--override-risk` | Operator may still act on outdated info if they override |
| Write-set conflict becomes severe after promotion | Detected at promotion time; override requires explicit reason | Conflict may emerge during work, not detectable at claim time |
| Agent becomes unavailable between recommendation and promotion | PrincipalRuntime re-check at promotion time | Race condition: agent may drop between check and claim |
| Promotion record directory grows unbounded | No garbage collection designed | Operator must periodically archive old promotions |
| File-system atomicity is approximate | `atomicWriteFile` + promotion record as reconciliation anchor | Crash between assignment write and roster write leaves partial state; promotion record documents intent for recovery |

---

## 8. Implementation Notes (Task 468)

Task 468 implemented this design. The implementation follows the design with these practical adjustments:

### 8.1 Recommendation Store

The design assumed a durable recommendation store. Since no store exists yet, the implementation **recomputes** the recommendation at promotion time via `generateRecommendations({ taskFilter, agentFilter })`. This is equivalent to validating current state and preserves all advisory risks (write-set, availability, etc.) without requiring a new storage layer.

### 8.2 CLI Surface

The implemented CLI requires `--task` and `--agent` as primary identifiers:

```bash
narada task promote-recommendation \
  --task <task-number> \
  --agent <agent-id> \
  --by <operator-id> \
  [--recommendation-id <id>] \
  [--override-risk <reason>] \
  [--dry-run] \
  [--format json|human]
```

`--recommendation-id` is optional audit linkage; the command operates on the task+agent pair regardless.

### 8.3 Status Selection

The implementation maps validation failures to terminal statuses as specified in §3.2:

| Failed Check | Status |
|--------------|--------|
| `dependencies` | `rejected` |
| `task_status` | `stale` |
| `recommendation_fresh` | `stale` |
| All others | `rejected` |

### 8.4 Atomicity

The actual atomic sequence is:

1. Run all validations (no mutations).
2. If dry-run, return preview.
3. If hard failures, write `rejected`/`stale` promotion record and return error.
4. Call `taskClaimCommand` (handles assignment + task file + roster).
5. If claim fails, write `failed` promotion record.
6. If claim succeeds, write `executed` promotion record.

The promotion record is written **after** the outcome is known, so the record always reflects the final state of that attempt.

### 8.5 Files Changed

- `packages/layers/cli/src/commands/task-promote-recommendation.ts` — new
- `packages/layers/cli/src/main.ts` — CLI wiring
- `packages/layers/cli/src/lib/task-governance.ts` — fixed `checkDependencies` numeric matching for zero-padded filenames
- `packages/layers/cli/test/commands/task-promote-recommendation.test.ts` — new (14 tests)
- `.ai/tasks/promotions/README.md` — schema documentation
- `.ai/task-contracts/agent-task-execution.md` — promotion path guidance

### 8.6 Deferred Items

- Observation query for promotion history (not implemented; can be added when an observation API consumer exists).
- `--recommendation-id` audit linking in `task claim` (the promotion record stores the ID; claim does not need to know it).

## 8. Implementation Task Recommendation

If this design is accepted, the implementation task should:

1. Create `.ai/tasks/promotions/` directory in `init-repo.ts`
2. Implement `promoteRecommendationCommand()` in `packages/layers/cli/src/commands/task-promote-recommendation.ts`
3. Add CLI wiring in `main.ts`
4. Add tests in `test/commands/task-promote-recommendation.test.ts`
5. Update `task claim` to accept an optional `--recommendation-id` for audit linking (Decision 411 §7.2)
6. Add observation query for promotion history (read-only, `inspect` authority)

**Estimated scope:** ~200 lines of implementation + ~300 lines of tests.

---

## 9. Acceptance Criteria

- [x] Decision record exists at `.ai/decisions/20260422-427-governed-recommendation-promotion.md`.
- [x] Design clearly separates recommendation, promotion request, assignment, task state, and roster state.
- [x] Authority class for promotion is explicit (`claim`).
- [x] Validation re-checks current state at promotion time (9 checks defined).
- [x] Audit record shape is append-only and preserves recommendation evidence via `recommendation_snapshot`.
- [x] CLI surface is chosen (`promote-recommendation`) and alternatives are documented with rationale.
- [x] Existing mutation helpers are reused (`task claim` is the underlying primitive).
- [x] No implementation code is changed.
- [x] No derivative task-status files are created.
