---
status: closed
depends_on: [417]
---

# Task 419 — Windows Live Graph Sync Step

## Assignment

Replace or supplement the Windows Site fixture sync step with a live, bounded Graph/mail source sync step suitable for the email-marketing live dry run.

This task exists because Task 417 proved Task 400 overclaimed real Windows Site step-handler coverage. Current Windows Site step 2 admits pre-built `FixtureSourceDelta[]`; it does not read from a configured source.

## Required Reading

- `.ai/do-not-open/tasks/20260422-417-correct-task-400-windows-live-step-overclaim.md`
- `.ai/do-not-open/tasks/20260422-403-controlled-live-input-and-dry-run-execution.md`
- `packages/sites/windows/src/runner.ts`
- `packages/sites/windows/src/cycle-step.ts`
- `packages/sites/windows/src/cycle-coordinator.ts`
- `packages/layers/control-plane/src/adapter/graph/`
- `packages/layers/control-plane/src/sources/`
- `docs/deployment/email-marketing-live-dry-run-runbook.md`

## Required Work

1. Define the live sync input contract.

   - Identify the minimal config required for one bounded mailbox/thread read.
   - Require an explicit bound: mailbox, folder/thread/message selector, or equivalent.
   - Do not allow an unbounded inbox sweep.

2. Implement a live Windows sync step.

   - Add a live step handler distinct from the fixture handler, or parameterize the existing handler without hiding fixture behavior.
   - Read real source data through existing control-plane source/Graph abstractions where possible.
   - Write facts through `WindowsCycleCoordinator` / existing stores.
   - Preserve cursor/apply-log/idempotency semantics where applicable.
   - Map auth/connectivity failures to health-compatible failure residuals.

3. Wire the runner safely.

   - `DefaultWindowsSiteRunner.runCycle()` must use the live sync path only when live source config is present.
   - Fixture sync must remain available for tests but must be visibly named as fixture/test-only.
   - The runner must not silently fall back from live to fixture when live config is invalid.

4. Add focused tests.

   - Test live sync with a mocked Graph/source adapter and real SQLite stores.
   - Test that missing/invalid live source config fails or skips honestly; it must not pretend success through empty fixtures.
   - Test idempotent duplicate event handling.

5. Update task/docs state.

   - Update Task 400 correction notes if needed.
   - Update Task 403 blocker table if this task unblocks step 2.
   - Record exact focused verification.

## Non-Goals

- Do not implement context formation.
- Do not implement charter evaluation.
- Do not implement foreman handoff.
- Do not implement Klaviyo mutation or email sending.
- Do not run broad test suites unless focused tests justify escalation.

## Execution Notes

### Files changed

| File | Action | Description |
|------|--------|-------------|
| `packages/sites/windows/src/types.ts` | Modified | Added `WindowsLiveGraphSourceConfig` and `WindowsLiveSourceConfig`; extended `WindowsSiteConfig` with optional `live_source` |
| `packages/sites/windows/src/graph-source.ts` | Created | Factory `createGraphSource(config, sourceId)` that builds `ClientCredentialsTokenProvider` → `GraphHttpClient` → `DefaultGraphAdapter` → `ExchangeSource` |
| `packages/sites/windows/src/cycle-step.ts` | Modified | Added `createLiveSyncStepHandler(source, options)` with bounded pull, apply-log dedup, fact admission, cursor update, and honest auth/connectivity failure residuals |
| `packages/sites/windows/src/runner.ts` | Modified | `runCycle()` now selects live sync when `config.live_source` is present, fixture sync when explicit fixture mode/data is present, and fails honestly when neither live nor fixture input is provided. |
| `packages/sites/windows/test/unit/cycle-step-live-sync.test.ts` | Created | 11 focused tests: success, duplicate skip, auth error, connectivity error, limit respect, empty batch, and 5 validation tests for `createGraphSource` |

### Verification

```bash
cd packages/sites/windows
pnpm exec tsc --noEmit          # ✅ clean
pnpm exec vitest run test/unit/cycle-step-live-sync.test.ts  # ✅ 11/11 pass
pnpm exec vitest run            # ✅ 167/167 pass (full suite)
```

Monorepo typecheck also clean across all 10 workspace projects.

### Task 423 Correction

Task 423 tightened this task's contract:

- no silent empty fixture fallback;
- explicit `mode: "live"` / `mode: "fixture"` behavior;
- `conversation_id` selector for one controlled thread;
- updated tests for missing live config, fixture mode, no-mode failure, and conversation filtering.

## Acceptance Criteria

- [x] Windows Site has a live source sync step distinct from fixture sync.
- [x] Live sync requires bounded source config (`folder_id`, `limit`) and now supports `conversation_id` for one controlled thread.
- [x] `runCycle()` does not silently use fixture sync when live config is requested.
- [x] Facts are written to real stores with idempotency preserved.
- [x] Auth/connectivity failures produce honest failure residuals/health-compatible output.
- [x] Focused tests prove live sync success, missing config behavior, and duplicate handling.
