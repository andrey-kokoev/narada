---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:12:58.914Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:13:00.206Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 725 — Add Chapter Commit Coherence Inspection

## Goal

Provide a small sanctioned inspection surface that detects task ranges with attempt-complete or incomplete tasks before a chapter commit.

## Context

The previous commit succeeded while its chapter tasks were not closed. The missing surface is not another reminder; it is an executable check that can be run before committing a chapter.

## Required Work

1. Add a command or script-level sanctioned inspection path for a numeric range, reusing task evidence logic.
2. Report non-complete tasks with task number, status, and verdict without dumping giant evidence transcripts.
3. Return a non-zero exit code when any task in the requested range is not evidence-complete.
4. Keep output terse in both human and JSON forms.

## Non-Goals

- Do not wire a git hook in this task.
- Do not change the meaning of task evidence verdicts.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The check passes for a range where every task evidence verdict is complete.
- [x] The check fails for a range with at least one incomplete or attempt_complete task.
- [x] The check output is bounded and does not emit full evidence records by default.
- [x] Focused tests cover passing and failing ranges.
