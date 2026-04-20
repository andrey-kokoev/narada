# Task 225: Close Residual Corrective Task Artifacts And Operator Action Doc List

## Why

Review of Tasks 216, 217, 221, and 223 found that most of the substantive code/doc corrections landed, but a small residual cluster remains:

1. **Task artifacts left stale**
   - `.ai/tasks/20260419-216-correct-task-208-selector-surface-overclaim-and-partial-consumption.md`
   - `.ai/tasks/20260419-217-correct-task-209-promotion-retry-transition-semantics.md`
   - `.ai/tasks/20260419-221-correct-task-206-projection-rebuild-multi-mailbox-and-task-state.md`

   still have unchecked Definition of Done sections despite the corresponding repo surfaces having been updated.

2. **Promotion/control doc residual**
   - `packages/layers/control-plane/docs/00-kernel.md` still says the safelisted operator actions are only `retry_work_item` and `acknowledge_alert`, even though `retry_failed_work_items` is now implemented and documented elsewhere.

3. **Task 223 slightly overclaims**
   - Task 223 says Task 215’s durable artifact reflects the final state, but Task 215 still ends with an unchecked bullet in its verification section.

These are not large semantic failures, but they leave Narada’s corrective-task chain untidy and slightly contradictory.

## Goal

Finish the cleanup pass so that:

- corrective task files reflect actual completion state
- the kernel doc’s operator-action list matches the implemented safelist
- Task 215 / 223 no longer contradict each other on artifact cleanliness

## Required Changes

### 1. Update Corrective Task Files

Update:

- `.ai/tasks/20260419-216-correct-task-208-selector-surface-overclaim-and-partial-consumption.md`
- `.ai/tasks/20260419-217-correct-task-209-promotion-retry-transition-semantics.md`
- `.ai/tasks/20260419-221-correct-task-206-projection-rebuild-multi-mailbox-and-task-state.md`

with:

- accurate Definition of Done checkbox state
- `Execution Notes`
- concise evidence of what landed

### 2. Fix Operator-Control Safelist Wording

Update:

- `packages/layers/control-plane/docs/00-kernel.md`

so that its audited operator-control wording reflects the actual safelisted actions, including:

- `retry_failed_work_items`

Do not over-expand the list beyond what is currently implemented in `executeOperatorAction()`.

### 3. Reconcile Task 215 / 223 Artifact Cleanliness

Clean up the dangling unchecked bullet in:

- `.ai/tasks/20260419-215-correct-task-204-recovery-vs-replay-and-task-state.md`

or otherwise make the final-state wording fully honest.

If Task 223 needs a note about this, add it in the original task file rather than creating any derivative artifact.

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- 216, 217, 221, and 223 read as completed corrective tasks rather than half-closed drafts
- kernel docs list the actual current operator safelist
- Task 215 and Task 223 no longer contradict each other

## Definition Of Done

- [x] Corrective task files 216, 217, and 221 are updated as canonical completion artifacts.
- [x] The kernel doc’s operator-control safelist matches implemented actions.
- [x] Task 215 / 223 artifact-state inconsistency is removed.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Reviewed State

The residual cleanup cluster was closed:

- Tasks 216, 217, and 221 now have checked Definition of Done sections and execution notes.
- `packages/layers/control-plane/docs/00-kernel.md` lists the implemented operator-control safelist, including `retry_failed_work_items`.
- Task 215 no longer has a dangling unchecked artifact bullet, and Task 223 no longer contradicts it.

### Verification

Reviewed by inspection of:

- `.ai/tasks/20260419-216-correct-task-208-selector-surface-overclaim-and-partial-consumption.md`
- `.ai/tasks/20260419-217-correct-task-209-promotion-retry-transition-semantics.md`
- `.ai/tasks/20260419-221-correct-task-206-projection-rebuild-multi-mailbox-and-task-state.md`
- `.ai/tasks/20260419-215-correct-task-204-recovery-vs-replay-and-task-state.md`
- `.ai/tasks/20260419-223-correct-task-215-kernel-doc-coherence-for-recovery-surface.md`
- `packages/layers/control-plane/docs/00-kernel.md`
