# Task 217: Correct Task 209 Promotion Retry Transition Semantics

## Why

Review of Task 209 found a semantic mismatch between the documented promotion algebra and the implemented retry surface.

The docs and task text currently classify:

- `retry_work_item`
- `retry_failed_work_items`

as:

- `work_item: failed_retryable -> opened`

But the implementation does **not** transition the work item to `opened`.
It leaves the status as `failed_retryable` and only clears `next_retry_at`, allowing the scheduler to discover it as runnable later.

That is a valid design, but it is a different semantic transition.

Narada should not document one lifecycle transition while implementing another.

## Goal

Align the promotion algebra, docs, and implementation for retry-style promotion.

## Required Corrections

### 1. Choose The True Semantic Transition

Pick exactly one:

#### Option A: Scheduler-mediated retry

Retry means:

- `failed_retryable` remains `failed_retryable`
- `next_retry_at` becomes `null`
- scheduler later discovers and claims the item

If this is the model, docs must say so clearly.

#### Option B: Immediate state promotion

Retry means:

- the item actually transitions to `opened`

If this is chosen, implement it coherently and re-check scheduler/foreman invariants.

### 2. Align All Documentation

Update:

- `SEMANTICS.md`
- `00-kernel.md`
- Task 209 execution evidence

so they describe the same transition the code performs.

### 3. Keep Authority Boundaries Honest

If scheduler-mediated retry is the real model, say explicitly that retry is:

- not an immediate status promotion
- but a promotion of eligibility / retry readiness

### 4. Add Regression Tests If Needed

Ensure tests prove the chosen semantic model, not just incidental field changes.

## Verification

```bash
pnpm verify
pnpm --filter @narada2/daemon exec vitest run test/unit/observation-server.test.ts
pnpm --filter @narada2/control-plane exec vitest run test/unit/coordinator/store.test.ts
```

## Definition Of Done

- [x] Retry promotion semantics are described consistently across docs and code.
- [x] The documented transition matches the implemented transition.
- [x] Authority/scheduler implications are explicit.
- [x] Regression tests prove the chosen model.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

### Chosen Option: A (Scheduler-mediated retry)

Retry means:
- `failed_retryable` remains `failed_retryable`
- `next_retry_at` becomes `null`
- Scheduler later discovers and claims the item

This is the model the code already implements. All documentation was aligned to match.

### Changes Made

1. **`SEMANTICS.md`** — Updated promotion tables and action mappings:
   - `work_item: failed_retryable → opened` changed to `failed_retryable (retry readiness promoted)`
   - `retry_work_item` description now documents clearing `next_retry_at` without status change
   - Evolution note describes scheduler-mediated retry clearly

2. **`packages/layers/control-plane/docs/00-kernel.md`** — Updated §10.1 and §10.5:
   - Promotable objects table reflects retry readiness promotion
   - Scheduler neutrality invariant distinguishes retry-style promotion (clears `next_retry_at`, status unchanged) from status-changing promotion

3. **`.ai/do-not-open/tasks/20260419-209-promotion-operator-family.md`** — Updated execution evidence to describe actual scheduler-mediated behavior

4. **`packages/layers/daemon/test/unit/observation-server.test.ts`** — Added status assertions:
   - `retry_work_item` test now asserts status remains `failed_retryable`
   - `retry_failed_work_items` test now asserts status remains `failed_retryable`
   - Fixed pre-existing `affinity_strength` schema drift in all `insertWorkItem` test fixtures

5. **`packages/layers/control-plane/test/unit/coordinator/store.test.ts`** — Added `retry promotion semantics` test proving `updateWorkItemStatus` with `failed_retryable` + `next_retry_at: null` leaves status unchanged

### Verification

- `pnpm --filter @narada2/control-plane exec vitest run test/unit/coordinator/store.test.ts` — 18/18 tests pass
- `pnpm --filter @narada2/daemon exec vitest run test/unit/observation-server.test.ts` — 55/55 tests pass
- `pnpm verify` — passes (modulo known pre-existing teardown noise)
