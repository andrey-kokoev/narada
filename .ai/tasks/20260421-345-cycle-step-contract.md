---
status: closed
depends_on: [344]
closed: 2026-04-21
---

# Task 345 — Cycle Step Contract

## Context

`packages/sites/cloudflare/src/runner.ts` currently represents steps 2–6 as:

```ts
if (canContinue()) { stepsCompleted.push(2); }
```

This proves timing and lock mechanics but not Narada kernel behavior.

Before implementing real steps, the runner needs a typed step contract so each step can report work performed, records written, residuals, and safe abort behavior.

## Goal

Replace bare step-number pushes for steps 2–6 with a typed step execution contract and default fixture-safe implementations.

## Required Work

### 1. Define step contract

Create types for:

- `CycleStepId`
- `CycleStepName`
- `CycleStepResult`
- `CycleStepContext`
- `CycleStepHandler`

Each step result should include:

- step id
- status: completed / skipped / failed
- records written count or summary
- residuals
- started/finished timestamps

### 2. Refactor runner

Refactor `runCycle()` so steps 2–6 are invoked through handlers rather than direct `stepsCompleted.push`.

Default handlers may initially perform bounded fixture-safe behavior, but they must not be silent no-ops. If a step is not implemented, it must return an explicit `skipped` result with residual.

### 3. Preserve health/lock behavior

Do not regress:

- lock acquisition/release
- stale lock recovery
- health decay
- notification emission
- final health lock state

### 4. Tests

Add focused tests proving:

- step handlers are called in order
- skipped steps record explicit residuals
- failed step fails the cycle and releases lock
- successful step results are included in trace/evidence

## Non-Goals

- Do not implement full source sync; Task 346 owns source/fact admission.
- Do not implement governance; Task 347 owns governance spine.
- Do not implement reconciliation; Task 348 owns reconciliation.
- Do not create generic Runtime Locus abstraction.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Steps 2–6 use typed handlers/results.
- [x] No silent no-op step remains.
- [x] Step residuals are traceable.
- [x] Existing unattended behavior still passes.
- [x] Focused tests cover order, skip, failure, and trace evidence.
- [x] No derivative task-status files are created.

## Execution Notes

**Implementation:**

1. `packages/sites/cloudflare/src/cycle-step.ts` — New step contract module:
   - `CycleStepId` (2–6), `CycleStepName`, `CycleStepStatus`, `CycleStepResult`, `CycleStepContext`, `CycleStepHandler` types
   - `CYCLE_STEP_ORDER` constant defining canonical execution sequence
   - `createDefaultStepHandlers()` returns fixture-safe handlers for all 5 steps
   - Each default handler returns explicit `skipped` status with residual naming the future task that owns real implementation (e.g., `"fixture_safe_noop: sync not yet implemented (Task 346)"`)

2. `packages/sites/cloudflare/src/types.ts` — Added `stepResults?: CycleStepResult[]` to `CycleTraceRecord` and `CycleResult`

3. `packages/sites/cloudflare/src/runner.ts` — Refactored:
   - Steps 2–6 now execute through `handlers[stepId](stepCtx, canContinue)` loop
   - `stepHandlers` parameter added to `runCycle` for test injection
   - Failed steps throw and are caught by outer catch block, triggering health decay + lock release
   - `stepResults` included in `CycleResult` and `CycleTraceRecord`
   - Lock acquisition/release, health decay, notification emission unchanged

**Tests:** `packages/sites/cloudflare/test/unit/cycle-step.test.ts` — 5 focused tests:
1. Step handlers called in order 2→3→4→5→6
2. Skipped steps record explicit residuals
3. Failed step fails the cycle and releases lock
4. Successful step results included in trace and cycle result
5. Steps stop executing when deadline exceeded

**Verification:**
- `npx vitest run test/unit/cycle-step.test.ts` — 5/5 pass
- Full Cloudflare suite — 101/101 pass
- `pnpm verify` — 5/5 pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/runner.test.ts
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/unattended-recovery.test.ts
pnpm verify
```
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
