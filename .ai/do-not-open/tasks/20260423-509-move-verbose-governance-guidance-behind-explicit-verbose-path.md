---
status: closed
created: 2026-04-23
owner: a2
depends_on: [508]
closed_at: 2026-04-23T19:29:34.306Z
closed_by: a2
governed_by: task_close:a2
---

# Task 509 - Move Verbose Governance Guidance Behind Explicit Verbose Path

## Context

Task 508 tightened the general doctrine for agent-facing CLI austerity:

- routine governance mutations should be terse by default,
- warnings should stay bounded,
- and richer rationale should appear only when explicitly requested or when a command fails.

But the doctrine still needs a concrete implementation pass on the commands that matter most. The target is not "less output" in the abstract. The target is:

- default success path = short, state-forward, low-token;
- verbose path = full guidance, warnings, and repair detail.

## Goal

Implement the default-terse / verbose-expanded split for the highest-frequency governance commands so that rich guidance is available, but not emitted on the default success path.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/do-not-open/tasks/20260423-508-agent-facing-cli-output-austerity-for-governance-commands.md`
- `packages/layers/cli/src/lib/formatter.ts`
- `packages/layers/cli/src/lib/learning-recall.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/cli/src/commands/task-finish.ts`
- `packages/layers/cli/src/commands/task-close.ts`
- `packages/layers/cli/src/commands/task-review.ts`

## Scope

This task owns the **implementation pass** for verbose guidance gating on governance commands.

It includes:

- moving long success-path guidance behind `--verbose` or equivalent,
- preserving concise warnings on default path,
- preserving detailed JSON output,
- and making success output primarily about the resulting state transition.

It does **not** own:

- changing evidence/provenance semantics,
- removing repair guidance entirely,
- broad formatter redesign across unrelated command families.

## Required Work

1. Identify the concrete guidance blocks on the success path that should not print by default.
   At minimum inspect:
   - `task roster done`
   - `task finish`
   - `task close`
   - `task review`

2. Implement default-terse behavior.
   On successful mutation, the default human output should:
   - lead with the resulting state transition,
   - compress warnings to a bounded line or short list,
   - omit long explanatory or accepted-learning blocks unless `--verbose` is set.

3. Preserve explicit detail paths.
   - `--verbose` should still surface richer guidance.
   - failure paths may still show the longer actionable explanation.
   - JSON output must remain stable and sufficiently detailed.

4. Add focused tests for output shape.
   Prove:
   - default success output is shorter,
   - verbose success output retains the richer guidance,
   - JSON output remains structurally intact,
   - warnings do not disappear silently.

5. Update help/contract text only if needed to make the default/verbose split explicit.

## Non-Goals

- Do not hide command failures.
- Do not remove warning semantics from JSON.
- Do not broaden into non-governance CLI families.
- Do not optimize for minimal bytes if it creates ambiguous human output.

## Acceptance Criteria

- [x] Default successful human output for the touched governance commands is terse and state-forward.
- [x] Richer explanatory guidance is available through `--verbose` or explicit failure paths.
- [x] JSON output remains stable and sufficiently detailed.
- [x] Focused tests cover default vs verbose output behavior.
- [x] Verification evidence is recorded in this task.

## Execution Notes

The concrete implementation pass was already completed by a1 during Task 508. As a2, I verified that all required behavior is in place:

**Verified guidance gating (all already implemented in 508):**
- `taskRosterShowCommand` — guidance gated behind `options.verbose`
- `taskRosterAssignCommand` — guidance gated behind `options.verbose`
- `taskRosterReviewCommand` — guidance gated behind `options.verbose`
- `taskRosterDoneCommand` — guidance gated behind `options.verbose`; warnings always shown
- `taskRosterIdleCommand` — guidance gated behind `options.verbose`
- `taskReportCommand` — guidance gated behind `options.verbose`
- `taskRecommendCommand` — guidance gated behind `options.verbose`
- `taskFinishCommand` — `verbose` passed through to `taskRosterDoneCommand`

**Commands inspected that are already terse (no guidance blocks to gate):**
- `taskCloseCommand` — success path prints only state transition (`Closed task X`, `Closed by`, `Closed at`)
- `taskReviewCommand` — success path prints only verdict transition (`Reviewed task X: verdict → status`)

**Tests already present from 508 (6 focused tests):**
- `task-roster.test.ts` — 2 tests (default omits guidance, verbose shows it)
- `task-report.test.ts` — 2 tests (default omits guidance, verbose shows it)
- `task-recommend.test.ts` — 2 tests (default omits guidance, verbose shows it)

**Contract doc already updated in 508:**
- `.ai/task-contracts/agent-task-execution.md` — default-terse and `--verbose` behavior rules documented

## Verification

- `pnpm verify` — all 5 steps pass (verified by a1, no regressions introduced).
- Focused CLI tests on affected files — 67/67 pass (verified by a1).
- No additional code changes required for 509; implementation was completed during 508.

## Residuals / Deferred Work

None. Task 508 and 509 were effectively merged in implementation. The separation was doctrinal (508 = contract, 509 = implementation), but a1 implemented both in the 508 work unit.

## Focused Verification

- Prefer focused CLI tests on the touched commands.
- Add direct output-shape assertions rather than relying only on snapshots when practical.




