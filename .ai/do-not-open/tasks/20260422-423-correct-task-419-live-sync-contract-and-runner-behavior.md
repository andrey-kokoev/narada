---
status: closed
closed: 2026-04-22
depends_on: [419]
---

# Task 423 — Correct Task 419 Live Sync Contract and Runner Behavior

## Assignment

Correct the residual issues in Task 419's Windows live sync implementation before treating step 2 as fully unblocked for Task 403.

Task 419 added a real `createLiveSyncStepHandler()` and Graph source factory. That is substantive progress. The remaining issue is contract honesty: the runner and docs still allow ambiguous fixture fallback behavior, and the bounded selector is weaker than Task 403's "one controlled thread" requirement.

## Required Reading

- `.ai/do-not-open/tasks/20260422-419-windows-live-graph-sync-step.md`
- `.ai/do-not-open/tasks/20260422-403-controlled-live-input-and-dry-run-execution.md`
- `packages/sites/windows/src/runner.ts`
- `packages/sites/windows/src/types.ts`
- `packages/sites/windows/src/cycle-step.ts`
- `packages/sites/windows/src/graph-source.ts`
- `packages/sites/windows/test/unit/cycle-step-live-sync.test.ts`

## Findings To Correct

1. Runner fallback remains ambiguous.

   `DefaultWindowsSiteRunner.runCycle()` currently does:

   - live sync if `config.live_source` exists;
   - fixture sync if `options.fixtureDeltas` exists;
   - otherwise empty fixture sync.

   Task 419 required "no silent fallback." Empty fixture sync may be acceptable for explicit fixture/test mode, but it must not be the default for a real Site config that forgot `live_source`.

2. Type comments normalize fixture fallback.

   `WindowsSiteConfig.live_source` says "When absent, the runner falls back to fixture sync (test path)." This is too broad for production/live dry-run semantics.

3. The bounded selector is only folder-level.

   Task 403 requires one controlled mailbox thread. Task 419 claims bounded selector through `folder_id` and `limit`, which prevents an unbounded inbox sweep but does not select one thread/message. Decide whether step 2 supports only folder+limit for now and Task 403 must provide the stricter bound elsewhere, or extend the config with `conversation_id` / `message_id` / equivalent.

4. Task 403 still lists Task 419 as part of blockers.

   That is acceptable until this corrective task closes. Do not mark Task 403's step 2 blocker as fully resolved until runner behavior and selector language are honest.

## Required Work

1. Make runner mode explicit.

   Add an explicit mode or equivalent guard so the runner can distinguish:

   - live mode: requires valid `config.live_source`;
   - fixture/test mode: may use `options.fixtureDeltas`;
   - invalid mode: fails honestly instead of running empty fixture sync.

   The exact API is up to the implementer, but it must make accidental empty fixture sync impossible for live dry-run usage.

2. Tighten selector semantics.

   Choose one coherent path:

   - add `conversation_id` / `message_id` / equivalent narrow selector to `WindowsLiveGraphSourceConfig`; or
   - explicitly state that Task 419 provides folder-bounded source read only, and Task 403 remains blocked until a later selector layer narrows to one controlled thread.

   If choosing the second path, create or update a task dependency so the live dry run does not proceed on folder+limit alone.

3. Update comments/docs/task notes.

   - `WindowsSiteConfig.live_source` must not imply broad fixture fallback is normal.
   - Task 419 execution notes must accurately describe what is and is not proven.
   - Task 403 blocker table must reflect whether step 2 is truly resolved or still partially blocked by selector scope.

4. Add focused tests.

   Cover:

   - live mode without `live_source` fails honestly;
   - fixture mode can still run fixture sync;
   - default/unspecified mode cannot silently perform empty fixture sync for a live Site;
   - selector semantics match the chosen contract.

## Non-Goals

- Do not implement context derivation.
- Do not implement charter evaluation.
- Do not implement foreman handoff.
- Do not touch PrincipalRuntime.
- Do not run root `pnpm test`.

## Acceptance Criteria

- [x] Runner mode is explicit enough that live dry-run cannot accidentally run empty fixture sync.
- [x] `WindowsSiteConfig.live_source` comments no longer normalize fixture fallback for live Sites.
- [x] Selector semantics are either narrowed to one controlled thread/message or explicitly marked as still blocking Task 403.
- [x] Task 419 notes and Task 403 blocker table are honest after the correction.
- [x] Focused tests cover missing live config, fixture mode, no silent empty fixture fallback, and selector semantics.

## Execution Notes

Task 423 corrected the Task 419 live sync contract.

Changes verified by review:

| Area | Correction |
|------|------------|
| Runner mode | `CycleRunOptions.mode` now distinguishes `live` and `fixture`. If no mode, no `live_source`, and no `fixtureDeltas` are present, `runCycle()` fails honestly instead of running empty fixture sync. |
| Live mode guard | `mode: "live"` now requires `config.live_source`; missing config fails with a clear error. |
| Fixture mode | Fixture sync remains available only through explicit fixture mode or fixture deltas. |
| Selector | `WindowsLiveGraphSourceConfig.conversation_id` narrows live sync to one controlled conversation/thread. |
| Type comments | `WindowsSiteConfig.live_source` no longer normalizes fixture fallback for live Sites. |
| Tests | `runner.test.ts` covers live-without-source failure, no-mode/no-source failure, explicit fixture mode, and campaign derivation fixture behavior. `cycle-step-live-sync.test.ts` covers conversation filtering. |

Task 423 also appears to have implemented part of Task 420 early by adding `createCampaignDeriveWorkStepHandler()` and runner wiring via `campaign_request_senders`. That work should be reviewed under Task 420, not treated as closed by this task.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
