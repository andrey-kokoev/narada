---
status: closed
created: 2026-04-23
owner: unassigned
depends_on: [463]
---

# Task 486 - Agent Completion Finalizer for Report/Evidence/Roster Handoff

## Context

Narada now distinguishes roster availability from task completion evidence. `task roster done` blocks by default when required evidence is missing, but agents still need a single canonical completion path so "done" does not depend on chat memory.

Current surfaces:

- `narada task report <task-number> ...` writes a WorkResultReport for implementer work.
- `narada task review <task-number> ...` writes review/evaluation state.
- `narada task evidence <task-number>` inspects task evidence.
- `narada task roster done <task-number> --agent <id>` clears roster availability only when evidence is present, unless `--allow-incomplete` is explicit.

The missing piece is an agent-facing finalizer that performs these checks in the right order and refuses ambiguous completion.

## Goal

Add a canonical `narada task finish <task-number> --agent <id>` workflow that guides or completes the final report/evidence/roster handoff for implementers and reviewers.

The command should make the normal path easy and make incomplete handoff explicit.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `AGENTS.md` Task Completion Semantics
- `.ai/do-not-open/tasks/20260422-425-work-result-report-governance-primitive.md`
- `.ai/do-not-open/tasks/20260422-463-task-completion-evidence-and-closure-enforcement.md`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/task-evidence.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/cli/src/lib/task-governance.ts`

## Non-Goals

- Do not auto-review implementer work.
- Do not close tasks directly from `task finish`.
- Do not infer correctness from changed files alone.
- Do not fabricate verification results.
- Do not bypass `task report`, `task review`, `task evidence`, or `task roster done`.
- Do not weaken the default evidence gate added to `task roster done`.

## Required Work

1. Add a `task finish` CLI command.
   - Suggested shape:
     - `narada task finish <task-number> --agent <id>`
     - `--summary <text>`
     - `--changed-files <json-or-repeatable-paths>`
     - `--verification <json-or-repeatable-entry>`
     - `--residuals <json-or-repeatable-entry>`
     - reviewer-specific verdict/link options if needed.
   - The command should be explicit about whether it is finishing implementer work or reviewer work based on roster role/status.

2. Implement implementer finalization.
   - If no WorkResultReport exists for this agent/task, require enough inputs to submit one through the existing report path.
   - If a report already exists, do not duplicate it; reuse existing evidence.
   - Run evidence inspection after report submission.
   - Run roster done only when evidence is sufficient.
   - Return precise missing fields when report inputs are incomplete.

3. Implement reviewer finalization.
   - If the agent is in reviewer posture, require or create a review artifact through the existing review operator.
   - Preserve review/report separation.
   - Run evidence inspection after review.
   - Run roster done only when reviewer evidence is sufficient.
   - Return precise missing review data when incomplete.

4. Preserve explicit incomplete escape hatch.
   - If needed, support `--allow-incomplete` with the same meaning as `task roster done --allow-incomplete`.
   - The output must state that this records agent availability only and leaves the task incomplete.

5. Add human-readable and JSON output.
   - Human output should show:
     - report/review action taken or reused;
     - evidence verdict;
     - roster transition;
     - residual missing evidence if blocked.
   - JSON output should expose stable fields for automation.

6. Add tests.
   - Implementer finish with full report inputs succeeds and clears roster.
   - Implementer finish without report inputs fails and leaves roster unchanged.
   - Implementer finish reuses an existing report.
   - Reviewer finish with accepted/rejected review evidence succeeds and clears roster.
   - Reviewer finish without review evidence fails and leaves roster unchanged.
   - `--allow-incomplete` clears roster but reports incomplete evidence explicitly.
   - JSON output is stable enough for agents to consume.

7. Update docs/contracts.
   - Update `.ai/task-contracts/agent-task-execution.md` to name `task finish` as the preferred agent completion command.
   - Update `AGENTS.md` Task Completion Semantics / Quick Commands if appropriate.

## Acceptance Criteria

- [x] `narada task finish <task-number> --agent <id>` exists.
- [x] Implementer finish submits or reuses WorkResultReport evidence before roster done.
- [x] Reviewer finish submits or reuses review evidence before roster done.
- [x] Missing evidence causes a hard failure and leaves the roster assignment intact.
- [x] `--allow-incomplete` is explicit and preserves "agent available, task incomplete" semantics.
- [x] Human and JSON output describe report/review, evidence verdict, and roster transition.
- [x] Tests cover implementer, reviewer, blocked, reuse, incomplete escape, and JSON cases.
- [x] Documentation tells agents to use `task finish` rather than chat-only "done".
- [x] Verification evidence is recorded in this task.

## Execution Notes

### Implementer path (a1)
- Created `packages/layers/cli/src/commands/task-finish.ts` with `TaskFinishOptions` interface and `taskFinishCommand` function.
- The command detects agent role from roster (implementer vs reviewer).
- Implementer branch: checks for existing WorkResultReport → requires `--summary` if none → submits via `taskReportCommand` → inspects evidence → calls `taskRosterDoneCommand`.
- Reviewer branch: checks for existing review → requires `--verdict` if none → submits via `taskReviewCommand` → inspects evidence → calls `taskRosterDoneCommand`.
- Supports `--allow-incomplete` for explicit incomplete handoff.
- Returns structured JSON with `report_action`/`review_action`, `evidence_verdict`, `roster_transition`.
- Wired `task finish` subcommand in `packages/layers/cli/src/main.ts` with all options.
- Added 8 tests in `packages/layers/cli/test/commands/task-finish.test.ts`.
- Updated `.ai/task-contracts/agent-task-execution.md` to name `task finish` as the preferred completion command.
- Updated `AGENTS.md` Task Governance table.
- Fixed pre-existing `@narada2/linux-site` `console-adapter.ts` type errors discovered during verify.

### Reviewer path (a2)
- Confirmed all 8 task-finish tests pass.
- Confirmed existing task tests pass (60 total).
- Confirmed `pnpm verify` passes all 5 steps.
- Added missing Execution Notes section to task file.
- Created review artifact in `.ai/reviews/`.
- No findings — implementation satisfies all acceptance criteria.

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run test/commands/task-finish.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/task-roster.test.ts test/commands/task-report.test.ts test/commands/task-review.test.ts test/commands/task-evidence.test.ts
pnpm verify
```

**Results:**
- `task-finish.test.ts`: 8 passed
- `task-roster.test.ts`: 26 passed
- `task-report.test.ts`: 8 passed
- `task-review.test.ts`: 15 passed
- `task-evidence.test.ts`: 11 passed
- `pnpm verify`: all 5 steps passed

## Residuals / Deferred Work

- Automatic changed-file and verification summarization from git/test history may be added later. This task should not guess evidence that the agent did not provide.

