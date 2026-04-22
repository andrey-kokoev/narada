---
status: closed
depends_on: [427, 426, 444]
closed_at: 2026-04-22T16:15:00.000Z
closed_by: a2
---

# Task 468 — Assignment Promotion Implementation

## Context

Task 427 designed the governed promotion path from advisory `AssignmentRecommendation` to durable `TaskAssignment`. The design specifies:

- `AssignmentPromotionRequest` as the operator-selected request object
- Atomic validation at promotion time (task exists, `opened`, dependencies satisfied, agent assignable, no active assignment)
- Atomic write: assignment record + task status `claimed` + roster `working`
- Append-only audit record in `.ai/tasks/promotions/`
- CLI surface: `narada task promote-recommendation <recommendation-id> --by <operator-id>`

This task implements that design.

## Goal

Implement `narada task promote-recommendation` as a governed promotion operator that turns a selected assignment recommendation into a durable task assignment only after explicit operator approval.

The implementation must preserve:
- Recommendation remains advisory;
- Assignment is authoritative task-governance mutation;
- Dependencies still gate assignment;
- Review separation and write-set risks remain visible;
- Operator approval is explicit and audited.

## Required Work

### 1. Create promotion command

Create `packages/layers/cli/src/commands/task-promote-recommendation.ts`:

```bash
narada task promote-recommendation <recommendation-id> --by <operator-id> [--dry-run] [--override-risk <reason>] [--format json|human]
```

Behavior:
- Load the recommendation by `recommendation_id` from the recommendation store or recompute it via `task recommend`.
- Validate all promotion conditions at promotion time:
  - task still exists;
  - task still `opened` or `needs_continuation`;
  - dependencies still satisfied (all `depends_on` tasks are `accepted` or `closed`);
  - agent still exists in roster;
  - agent still assignable (roster status `idle` or `done`);
  - no active assignment exists for the task;
  - write-set risk has not become blocking (re-check `write_set_risk`);
  - recommendation has not expired, or operator explicitly overrides with `--override-risk`.
- If validation fails, fail without mutation and print clear reason.
- If validation passes and not `--dry-run`:
  - Write `AssignmentPromotionRequest` audit record to `.ai/tasks/promotions/<id>.json`;
  - Call existing `task claim` helper to transition task status to `claimed`;
  - Call existing `task roster assign` helper to update roster to `working`;
  - Write assignment record to `.ai/tasks/assignments/`;
  - All writes must be atomic (use existing atomic write patterns).
- If `--dry-run`, print what would happen without mutation.

### 2. Define promotion audit record schema

Create `.ai/tasks/promotions/README.md` documenting the schema:

| Field | Meaning |
|-------|---------|
| `promotion_id` | Stable ID |
| `recommendation_id` | Source recommendation |
| `task_number` | Target task |
| `agent_id` | Assigned agent |
| `requested_by` | Operator ID |
| `requested_at` | ISO timestamp |
| `executed_at` | ISO timestamp |
| `status` | `requested`, `executed`, `rejected`, `stale`, `failed` |
| `recommendation_snapshot` | JSON snapshot of recommendation at promotion time |
| `validation_results` | Array of validation checks with pass/fail |
| `override_reason` | If `--override-risk` used |
| `assignment_id` | Reference to written assignment record |

### 3. Wire into main.ts

Add `narada task promote-recommendation` to `packages/layers/cli/src/main.ts`.

### 4. Add focused tests

Create `test/commands/task-promote-recommendation.test.ts` covering:

- Success: valid recommendation promoted, task claimed, roster updated, audit written;
- Failure: task not `opened`;
- Failure: dependency not satisfied;
- Failure: agent not assignable;
- Failure: active assignment already exists;
- Failure: write-set risk blocking (unless overridden);
- `--dry-run` prints expected actions without mutation;
- `--override-risk` allows promotion of expired/high-risk recommendation;
- Audit record contains recommendation snapshot and validation results;
- Command fails atomically if any validation check fails.

### 5. Update docs/contracts

Update `.ai/task-contracts/agent-task-execution.md` to clarify that promotion is the preferred path from recommendation to assignment.

Update `.ai/decisions/20260422-427-governed-recommendation-promotion.md` with implementation notes if the implementation differs from the design.

## Non-Goals

- Do not auto-assign agents without operator approval.
- Do not make recommendations authoritative.
- Do not bypass `task claim` or assignment validation semantics.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Execution Notes

### Implementation Summary

1. **Created `packages/layers/cli/src/commands/task-promote-recommendation.ts`**
   - `taskPromoteRecommendationCommand()` with 9 validation checks
   - Recomputes recommendation at promotion time via `generateRecommendations()` (no durable store yet)
   - Delegates mutation to `taskClaimCommand` (no duplication)
   - Writes append-only `AssignmentPromotionRequest` to `.ai/tasks/promotions/`
   - Supports `--dry-run`, `--override-risk`, `--format`, `--recommendation-id`

2. **Wired CLI in `packages/layers/cli/src/main.ts`**
   - `narada task promote-recommendation --task <n> --agent <id> --by <op>`

3. **Created `.ai/tasks/promotions/README.md`** documenting schema and invariants

4. **Fixed `checkDependencies` in `task-governance.ts`**
   - Numeric matching now handles zero-padded filenames (e.g., `-050-` matches dep `50`)
   - This was a pre-existing bug that blocked promotion of tasks with satisfied dependencies

5. **Updated docs**
   - `.ai/task-contracts/agent-task-execution.md` — added promotion path guidance
   - `.ai/decisions/20260422-427-governed-recommendation-promotion.md` — added §8 Implementation Notes

### Files Changed

- `packages/layers/cli/src/commands/task-promote-recommendation.ts` — new (~380 LOC)
- `packages/layers/cli/src/main.ts` — CLI wiring
- `packages/layers/cli/src/lib/task-governance.ts` — `checkDependencies` numeric matching fix
- `packages/layers/cli/test/commands/task-promote-recommendation.test.ts` — new (14 tests)
- `.ai/tasks/promotions/README.md` — new
- `.ai/task-contracts/agent-task-execution.md` — updated
- `.ai/decisions/20260422-427-governed-recommendation-promotion.md` — updated

### Verification

- `pnpm typecheck` — clean
- 15/15 focused tests pass (was 14; added working-agent rejection test)
- 82/82 tests pass across task-governance, claim, roster, recommend, promote-recommendation
- No derivative files created

### Fix during review

- **`assignableStatuses` in `task-promote-recommendation.ts`**: Removed `'working'` from the assignable status list. The task requirements explicitly state agents are assignable only when `idle` or `done`; `working` was incorrectly included, allowing promotion to already-busy agents. Added test coverage for this case.

## Acceptance Criteria

- [x] `narada task promote-recommendation` exists with `--dry-run`, `--override-risk`, and `--format`.
- [x] Validation re-checks current state at promotion time.
- [x] Promotion fails atomically if any validation check fails.
- [x] Audit record is append-only and preserves recommendation evidence.
- [x] Task status transitions to `claimed` and roster to `working` on success.
- [x] `--dry-run` shows expected actions without mutation.
- [x] `--override-risk` allows explicit override with reason.
- [x] Focused tests cover success and all failure paths.
- [x] No duplicate mutation logic — delegates to existing `task claim` and roster assign helpers.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-promote-recommendation.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```
