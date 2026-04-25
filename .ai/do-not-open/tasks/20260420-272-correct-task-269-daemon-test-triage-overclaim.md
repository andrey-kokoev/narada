# Task 272: Correct Task 269 Daemon Test Triage Overclaim

## Chapter

Operational Trust

## Context

Task 269 was intended as bounded triage of known daemon test failures.

Review found the result is directionally useful but overclaims and blurs evidence:

1. The task says it ran focused commands, but the execution notes list repeated broad runs:
   - `vitest run test/unit` twice
   - `vitest run` full daemon suite three times

2. The notes say "after 7 focused test runs" while the table lists 9 total runs, including broad runs.

3. The notes say "Changes Made" and "Bounded Fixes Applied", but the apparent code changes in `dispatch-real.test.ts` and `observation-server.test.ts` seem to have been made by earlier tasks. Task 269 should not imply it made code fixes if it only confirmed existing fixes.

4. The AGENTS.md guidance update is acceptable, but Task 269 should not normalize repeated broad-suite runs as a default validation pattern.

## Goal

Correct Task 269's artifact so it honestly distinguishes focused triage evidence, incidental broad-suite observations, and prior code changes.

## Required Work

### 1. Rewrite Task 269 Execution Notes

Update `.ai/do-not-open/tasks/20260420-269-triage-known-failing-daemon-tests.md` so:

- focused reproduction commands are listed separately from broad/incidental checks
- the run counts are accurate
- broad suite runs are not described as focused evidence
- no claim is made that Task 269 fixed code unless this task actually changed code

### 2. Classify Evidence Correctly

Use categories like:

- `focused evidence`: observation-server file, dispatch-real file
- `incidental broad check`: daemon unit suite, full daemon suite
- `prior fix observed`: code change found already present before Task 269 review

### 3. Keep Guidance Narrow

Ensure AGENTS.md guidance continues to recommend:

- focused daemon test files first
- broad daemon suite only as escalation evidence when justified

Do not add wording that encourages repeated broad daemon-suite runs.

### 4. Update Acceptance Criteria Honestly

If no fresh code changes were made by Task 269, the acceptance criterion "Obvious stale/flaky test logic is fixed" should be clarified as "no fresh fix required; prior fix observed" rather than implying Task 269 performed the fix.

## Non-Goals

- Do not run tests again unless needed to resolve an ambiguity.
- Do not change daemon product code.
- Do not create a new test-speed initiative.
- Do not create derivative task-status files.

## Execution Notes

### Changes Made

1. **Rewrote Task 269 execution notes** (`.ai/do-not-open/tasks/20260420-269-triage-known-failing-daemon-tests.md`):
   - Split reproduction results into **Focused Evidence** (observation-server ×3, dispatch-real ×1) and **Incidental Broad Checks** (unit suite, full suite) in separate tables.
   - Corrected the run count: 4 focused runs, not "7 focused test runs."
   - Changed "Fixed in code" to "Prior fix observed" for the `dispatch-real` mock assertion, noting the change predates Task 269.
   - Removed "Bounded Fixes Applied" section that implied Task 269 made code changes.
   - Replaced broad-suite normalization with narrow guidance: focused files first, escalation only when justified.
   - Clarified acceptance criterion "Obvious stale/flaky test logic is fixed" as "no fresh fix required; prior fix observed."

2. **Verified AGENTS.md** — no changes needed. The existing text already discourages broad suites ("broad unit-test suites are slow and can crash during teardown. Run individual test files instead") and does not encourage repeated broad daemon-suite runs.

### Verification

- No code changes made.
- No derivative files created.

## Acceptance Criteria

- [x] Task 269 distinguishes focused evidence from incidental broad checks.
- [x] Task 269 run counts are internally consistent.
- [x] Task 269 does not claim code fixes it did not make.
- [x] AGENTS.md does not encourage repeated broad-suite validation.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
