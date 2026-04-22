---
status: closed
depends_on: [417, 420, 401]
---

# Task 421 — Windows Charter Evaluation Step

## Assignment

Replace or supplement the Windows Site fixture evaluator with a dry-run-safe but real charter evaluation path for campaign-request work.

This task exists because Task 417 proved the current Windows evaluate step uses `fixtureEvaluate()` and does not invoke the charter runtime envelope, sandbox boundary, or campaign-production charter behavior.

## Required Reading

- `.ai/tasks/20260422-401-campaign-brief-runtime-integration.md`
- `.ai/tasks/20260422-417-correct-task-400-windows-live-step-overclaim.md`
- `.ai/tasks/20260422-420-windows-campaign-context-derivation-step.md`
- `packages/sites/windows/src/cycle-step.ts`
- `packages/layers/control-plane/src/foreman/types.ts`
- `packages/domains/charters/src/runtime/envelope.ts`
- `packages/domains/charters/src/runtime/runner.ts`
- `docs/deployment/campaign-charter-knowledge-binding.md`

## Required Work

1. Build the real evaluation envelope.

   - Use the work item/context/facts created by Task 420.
   - Include the campaign-production charter inputs required by Task 401.
   - Include private knowledge references only by configured path/URL/database handle; do not embed private data into public fixtures.

2. Invoke a dry-run-safe runtime.

   - For the live dry run, mock/Kimi/real runtime selection must be explicit in config.
   - A mock evaluator is acceptable only if it consumes the real envelope shape and produces schema-valid `campaign_brief` or `send_reply` proposals.
   - Do not use `fixtureEvaluate()` for live dry-run config.

3. Persist real evaluation records.

   - Write execution attempt/evaluation rows through existing stores.
   - Preserve evaluation vs decision separation.
   - Preserve failure classification for invalid runtime output.

4. Add focused tests.

   - Real SQLite stores.
   - Mock runner consuming real envelope produces `campaign_brief`.
   - Missing required campaign fields produces `send_reply`/request-info output.
   - Invalid runtime output is rejected or classified without creating a decision.

5. Update task/docs state.

   - Update Task 400 correction notes if needed.
   - Update Task 403 blocker table if this task unblocks step 4.
   - Record exact focused verification.

## Non-Goals

- Do not implement foreman handoff.
- Do not implement Klaviyo mutation.
- Do not send email.
- Do not make live Kimi/OpenAI credentials mandatory for tests.

## Acceptance Criteria

- [x] Windows Site has a real-envelope evaluation step distinct from `fixtureEvaluate()`.
- [x] Runtime mode is explicit and does not silently fall back to fixture behavior.
- [x] Evaluation rows preserve evaluation/decision separation.
- [x] Focused tests prove campaign-brief output, missing-info output, and invalid-output rejection.

## Implementation Notes

- `createCampaignEvaluateStepHandler(config)` builds real `CharterInvocationEnvelope`s via `buildInvocationEnvelope`, runs the provided `CharterRunner`, and persists execution attempt + evaluation via `persistEvaluation`.
- `SimpleMailMaterializer` materializes mail context directly from facts in the `PolicyContext` (no FileMessageStore required) — suitable for the Windows Site dry-run path.
- Runner auto-selects campaign evaluation when `config.campaign_request_senders` is present. It throws an honest error if no `charterRunner` is provided.
- Fixed pre-existing runner bug: a step returning `status: "failed"` now correctly propagates to cycle status `"failed"` (previously stayed `"complete"`).
- Four focused tests added:
  1. Mock runner with `campaign_brief` payload → evaluation persisted with correct outcome/summary
  2. Campaign mode active but no `charterRunner` → honest failure
  3. Charter runner throws → crashed execution attempt persisted, no evaluation created
  4. Idempotency test updated to pass explicit mock runner for second cycle
- 177 Windows Site tests pass, 71 control-plane tests pass, full typecheck clean.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
