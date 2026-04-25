---
status: confirmed
closed: 2026-04-22
depends_on: [411]
---

## Chapter

Construction Operation

# Task 413 — Review Separation and Write-Set Conflict Design

## Assignment

Design review-separation checks and write-set conflict detection for the Construction Operation.

## Required Reading

- `.ai/decisions/20260422-411-assignment-planner-design.md`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/lib/task-governance.ts`
- `.ai/decisions/20260422-408-construction-operation-readiness.md`

## Context

Review integrity requires that a reviewer did not work on the task they review. Write-set integrity requires that two concurrently claimed tasks do not modify the same files. Currently, both checks are manual.

The design must:
- Detect reviewer==worker before review acceptance.
- Detect write-set overlap between active assignments.
- Surface warnings without blocking (advisory, not authority).
- Record separation validation in the review record.

## Concrete Deliverables

1. Decision artifact at `.ai/decisions/20260422-413-review-separation-write-set-conflict.md` containing:
   - Review-separation check algorithm
   - Write-set tracking model (how to record which files a task modifies)
   - Conflict detection algorithm
   - Warning/escalation rules
   - Review record schema extension (separation_validation field)
   - CLI surface design (`narada task validate-separation` or equivalent)

## Explicit Non-Goals

- Do not implement the checks.
- Do not auto-reject reviews or block claims.
- Do not require git integration for v1 (file-list based is sufficient).
- Do not design a full static analysis system.

## Acceptance Criteria

- [x] Decision artifact exists.
- [x] Review-separation algorithm is deterministic and auditable.
- [x] Write-set tracking model is simple and does not require external tools.
- [x] Warning rules are conservative (false positives are acceptable, false negatives are not).
- [x] Review record schema extension is backward-compatible.
- [x] No implementation code is added.

## Verification Scope

Review by operator or architect. No automated tests required.

## Execution Notes

### Write Set

- `.ai/decisions/20260422-413-review-separation-write-set-conflict.md` — new decision artifact

### Content Summary

The design defines two advisory integrity checks for the Construction Operation:

1. **Review-separation check**:
   - Algorithm compares `reviewer_agent_id` against the last active worker from the assignment record
   - Covers edge cases: never-claimed tasks, abandoned tasks, transfers, budget-exhausted releases
   - Check is run automatically during `narada task review`; warnings are printed but do not block
   - Operator may override with explicit reason

2. **Write-set conflict detection**:
   - Manifest-based tracking: agents declare intended file modifications at claim time via `--files`
   - `WriteSetManifest` stored in assignment record (optional, defaults to `["TBD"]`)
   - Conflict detection compares expanded manifests across all active assignments
   - Detects file overlap and create/delete conflicts
   - Conservative: false positives acceptable, false negatives not

3. **Schema extensions**:
   - `ReviewRecord` extended with optional `separation_check` field (backward-compatible)
   - `TaskAssignmentRecord` extended with optional `write_set_manifest` field (backward-compatible)
   - Both extensions are optional; existing records remain valid

4. **CLI surfaces**:
   - `narada task validate-separation <task-number> [--reviewer]` — explicit separation check
   - `narada task claim --files <paths>` — declare write-set at claim time
   - `narada task update-manifest <task-number> --files <paths>` — update manifest mid-work
   - `narada task check-conflicts [--task] [--agent]` — detect overlap among active assignments
   - `narada task review` — automatically runs separation check and records result

5. **Integration with Decision 411**:
   - The assignment planner's `review_separation_score` dimension is now defined as `checkReviewSeparation()` at recommendation time

### Residuals

- Git-diff based write-set tracking → Post-415 chapter
- Static analysis for overlap detection → Future enhancement
- Automatic manifest inference from actual changes → Post-415 chapter
- Cross-chapter write-set tracking → Future enhancement

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
