# Task 132: Correct Task 122 Wake Controller Runtime Integration

## Why

Review of Task 122 found that retry-aware sleep and health-file improvements landed, but the wake/coalescing model is still only partially implemented in real runtime behavior.

`WakeController` now exists with priority ordering and pending-wake state, but the daemon loop does not actually consume pending wake requests between sleeps.

That means the repo currently has:

- a wake-priority abstraction
- unit tests for the abstraction
- a public `requestWake(reason)` API

but not a fully integrated pending-wake runtime model.

## Problem

### 1. Pending wakes are not consumed by the daemon loop

`WakeController.getAndClearPendingWake()` exists, but the daemon loop never calls it.

So if a wake request arrives while the daemon is not currently blocked in `sleep()`, the pending wake reason is recorded but later ignored.

That fails the intended coalescing semantics.

### 2. Wake reasons are only partially integrated

`retry` and `poll` are exercised by the main loop.

But `webhook` and `manual` are not meaningfully integrated into the daemon runtime path; they currently exist as API/test concepts more than end-to-end operational behavior.

## Goal

Make the daemon's wake model fully real, not just locally unit-tested.

## Required Outcomes

### 1. Consume pending wake requests in the main loop

The daemon loop must check for a pending wake before entering a new sleep period.

Expected behavior:

- if a higher-priority wake was queued between loops, the daemon should act on it immediately
- pending wake state must not be silently discarded

### 2. Make coalescing semantics operational

The priority model must affect actual daemon behavior, not just controller unit tests.

At minimum, prove that:

- lower-priority wake can be replaced by higher-priority wake
- the resulting chosen wake reason is what the loop actually observes and acts upon

### 3. Wire real runtime wake sources where applicable

At minimum, ensure the daemon runtime has a coherent story for:

- manual wake
- retry wake
- poll wake

If `webhook` wake is intended as part of the model, it must be wired into a real path or explicitly downgraded from the claimed semantics.

Do not leave `webhook` as a nominal priority level with no production trigger path if the task/docs still claim it as part of the runtime model.

### 4. Add integration tests for actual wake behavior

Unit tests for `WakeController` are not enough.

Add focused integration coverage proving the daemon loop itself honors pending wake/coalescing behavior.

## Deliverables

- daemon loop consumes pending wake state correctly
- wake priority/coalescing affects real runtime behavior
- wake-reason model is either fully wired or narrowed honestly
- integration tests cover the corrected behavior

## Definition Of Done

- [ ] pending wake requests are consumed by the daemon loop before sleeping
- [ ] coalescing semantics affect actual runtime behavior, not only unit tests
- [ ] claimed wake reasons in code/docs match real production trigger paths
- [ ] integration tests prove the corrected daemon wake behavior

## Notes

This is a corrective task for the unfinished portion of Task 122.

It should not reopen the already-correct retry-aware sleep logic or health-file additions.
