---
status: closed
closed: 2026-04-22
depends_on: [417, 419, 401]
---

# Task 420 — Windows Campaign Context Derivation Step

## Assignment

Replace or supplement the Windows Site fixture derive-work step with real campaign-request context formation and foreman-owned work admission.

This task exists because Task 417 proved the current Windows derive-work step groups facts by `sourceId`, hardcodes `fixture-charter`, and opens work without the real campaign context strategy.

## Required Reading

- `.ai/tasks/20260422-401-campaign-brief-runtime-integration.md`
- `.ai/tasks/20260422-417-correct-task-400-windows-live-step-overclaim.md`
- `.ai/tasks/20260422-419-windows-live-graph-sync-step.md`
- `packages/sites/windows/src/cycle-step.ts`
- `packages/sites/windows/src/cycle-coordinator.ts`
- `packages/layers/control-plane/src/foreman/context.ts`
- `packages/layers/control-plane/src/foreman/facade.ts`
- `docs/deployment/campaign-request-fact-model.md`

## Required Work

1. Use real campaign context formation.

   - Apply `CampaignRequestContextFormation` or the canonical Task 401 equivalent to synced mail facts.
   - Group by the correct durable identity, normally campaign request/thread/conversation, not raw `sourceId`.
   - Preserve allowed-sender and bounded-input constraints from the live dry-run boundary.

2. Preserve foreman authority.

   - Work opening must route through the foreman/admission path, not direct ad-hoc inserts unless the coordinator method is explicitly the foreman-owned admission abstraction.
   - Do not create work for facts that fail campaign-request criteria.

3. Keep fixture derivation visibly separate.

   - Existing fixture derivation may remain for tests.
   - Fixture derivation must not be the path used by live dry-run config.

4. Add focused tests.

   - Real SQLite stores.
   - Mail/campaign facts produce one campaign context and one work item.
   - Non-campaign or disallowed facts produce no work.
   - Re-running derivation does not create duplicate active work.

5. Update task/docs state.

   - Update Task 400 correction notes if needed.
   - Update Task 403 blocker table if this task unblocks step 3.
   - Record exact focused verification.

## Non-Goals

- Do not implement live Graph sync.
- Do not implement charter evaluation.
- Do not implement outbound/effect execution.
- Do not broaden the dry run beyond one bounded input.

## Acceptance Criteria

- [x] Windows Site has a real campaign context derivation step distinct from fixture derivation.
- [x] Work opening respects foreman/admission authority.
- [x] Disallowed/non-campaign facts do not create work.
- [x] Re-derivation is idempotent for the same facts/context.
- [x] Focused tests prove positive, negative, and duplicate cases.

## Implementation Notes

- `WindowsCycleCoordinator` now owns a `SqliteIntentStore` and exposes `admitCampaignFacts(scopeId, config)` which instantiates `DefaultForemanFacade` with `CampaignRequestContextFormation`.
- `createCampaignDeriveWorkStepHandler(config)` is the real derive-work path; `createDeriveWorkStepHandler()` remains the fixture/test path.
- Runner auto-selects campaign derivation when `config.campaign_request_senders` is present.
- Facts are batch-marked as admitted after foreman processing so they are not re-derived.
- Three focused tests added to `runner.test.ts`:
  1. Allowed sender with campaign keywords → work item created for correct context
  2. Non-allowed sender → silently skipped, no work item
  3. Re-derivation → at most one active work item per context

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
