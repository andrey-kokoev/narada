# Task 226: Correct Task 222 v1 Affinity Wording And Task Artifact

## Why

Review of Task 222 found that the main correction largely landed:

- Task 212 now documents continuation affinity as **ordering-only (v1)**
- observability exposes `AffinityOutcome`
- kernel and architecture docs mostly reflect the deferred session-aware routing story

But two residual issues remain:

1. The low-level source comment on `ContinuationAffinity` in `packages/layers/control-plane/src/coordinator/types.ts` still says the scheduler may honor affinity “when the preferred session is available,” which overstates the actual v1 implementation. The scheduler does not check preferred-session availability.
2. Task 222’s own file still has unchecked Definition of Done boxes and no execution notes.

This leaves one local runtime-description mismatch plus an incomplete corrective-task artifact.

## Goal

Finish the Task 222 cleanup by:

- making the low-level type comment match the actual v1 implementation
- updating Task 222 as the canonical completion artifact

## Required Changes

### 1. Fix `ContinuationAffinity` Comment Honesty

Update:

- `packages/layers/control-plane/src/coordinator/types.ts`

so the comment reflects current reality:

- v1 = ordering hint only
- no preferred-session availability check
- no session-targeted lease acquisition yet

The wording should align with:

- `SEMANTICS.md`
- `00-kernel.md`
- `02-architecture.md`

### 2. Update Task 222

Update:

- `.ai/tasks/20260419-222-correct-task-212-affinity-routing-observability-and-task-state.md`

with:

- checked Definition of Done items as appropriate
- `Execution Notes`
- concise note about what landed vs what remains deferred

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- low-level type comments no longer imply preferred-session-aware routing in v1
- Task 222 reads as a completed corrective task rather than an open draft

## Definition Of Done

- [x] `ContinuationAffinity` comments match actual v1 behavior.
- [x] Task 222 is updated as the canonical completion artifact.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Reviewed State

The affinity wording correction was completed:

- `ContinuationAffinity` source comments now describe v1 as ordering-only affinity.
- The comments no longer imply preferred-session availability checks, session-targeted lease acquisition, or runner selection.
- Task 222 was updated as the canonical artifact with checked Definition of Done and execution notes.

### Verification

Reviewed by inspection of:

- `packages/layers/control-plane/src/coordinator/types.ts`
- `.ai/tasks/20260419-222-correct-task-212-affinity-routing-observability-and-task-state.md`
