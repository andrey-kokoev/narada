# Review: Task 352 — Live Source Adapter Spike

**Target:** `packages/sites/cloudflare/src/source-adapter.ts`, `src/cycle-step.ts` (`createLiveSyncStepHandler`), `test/unit/live-source-adapter.test.ts`  
**Reviewer:** agent review  
**Date:** 2026-04-21

---

## 1. Verdict

**ACCEPTED_WITH_FIXES_APPLIED**

The live source adapter implementation is sound after fixes. The `HttpSourceAdapter` provides a bounded, testable read seam. The `createLiveSyncStepHandler` correctly delegates to the adapter, catches failures before state mutation, and admits successful deltas through the existing fact/cursor/apply-log boundary.

One **critical data-loss bug** was found and fixed in both the live and fixture sync handlers.

---

## 2. Critical Fix Applied

### 2.1 Cursor advanced past unprocessed deltas on mid-sync deadline exceeded

**Severity:** blocking  
**Location:** `src/cycle-step.ts` — both `createSyncStepHandler` and `createLiveSyncStepHandler`

**Problem:** When `canContinue()` returned `false` mid-loop, the handler broke out of the delta-processing loop but still set the cursor to `deltas[deltas.length - 1]` (the last delta in the batch). On the next cycle, the adapter would be called with a cursor past the unprocessed deltas, causing them to be permanently skipped.

**Fix:** Track `lastProcessedDelta` during iteration. Only advance the cursor to the last delta that was actually examined (admitted or skipped). If the loop breaks early, the cursor stays at the last successfully processed delta.

**Tests added:**
- `live-source-adapter.test.ts`: "does not advance cursor past unprocessed deltas when deadline exceeded mid-sync"
- `fact-admission.test.ts`: cursor assertion added to existing mid-sync deadline test

---

## 3. Minor Observations (No Fix Required)

### 3.1 `insertFact` + `markEventApplied` are separate SQL exec calls

**Location:** `src/coordinator.ts`  
**Observation:** Each call is an auto-committed statement in DO SQLite. A crash between them could leave a fact without an apply-log entry. However, `INSERT OR IGNORE` on `facts` makes replay safe — re-admitting the same fact is idempotent.

**Status:** Acceptable for v0. Full transaction wrapping is a future enhancement.

### 3.2 `HttpSourceAdapter` does not retry transient failures

**Location:** `src/source-adapter.ts`  
**Observation:** Network errors and 5xx responses immediately throw `SourceAdapterError`. The caller (cycle step) returns a failed step. There is no built-in retry with backoff.

**Status:** Acceptable for a bounded spike. The cycle runner's health decay + next Cron invocation provides implicit retry at the Cycle level.

### 3.3 Default transform uses `as Record<string, unknown>`

**Location:** `src/source-adapter.ts`, `defaultHttpTransform`  
**Observation:** The cast is defensive but loses type safety. The function fails fast with `SourceAdapterError` when required fields are missing, which is the correct bounded behavior.

**Status:** Acceptable for a generic adapter that must handle arbitrary endpoint shapes.

---

## 4. Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Bounded live source-read seam exists | **Pass** | `HttpSourceAdapter` in `src/source-adapter.ts` |
| Live observations route through fact/cursor/apply-log admission | **Pass** | `createLiveSyncStepHandler` uses `insertFact`, `markEventApplied`, `setCursor` in the same pattern as fixture handler |
| Failures do not corrupt durable admission state | **Pass** | Adapter errors are caught before any coordinator mutation; cursor only advances to processed deltas |
| Focused tests exist | **Pass** | 8 tests in `live-source-adapter.test.ts`; 15 tests across live + fact-admission files |
| No derivative task-status files created | **Pass** | Only source, test, and review files were modified |

---

## 5. Boundary Statement

> The live source-read adapter is a **mechanical seam**: it reads from an external HTTP endpoint and produces deltas. It does not open work items, evaluate, or create decisions. All external change enters as `Fact` through the same admission boundary established in Task 346. Adapter failure is caught before any durable state mutation. The cursor advances only to the last processed delta, preserving the "no loss after commit" invariant.
