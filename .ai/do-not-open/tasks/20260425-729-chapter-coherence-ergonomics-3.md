---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:23:02.175Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:23:03.648Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 729 — Use Chapter Assert Complete Before Commit

## Goal

Verify the new ergonomic chapter command against recent ranges before committing this ergonomics chapter.

## Context

The command should become the operator-facing rhythm immediately, not remain theoretical.

## Required Work

1. Run the chapter alias against 718-720, 721-723, and 724-726.
2. Run the task evidence command in default/human mode to confirm readable output.
3. Run focused tests and typecheck.
4. Close this chapter and commit.

## Non-Goals

- Do not push unless requested.
- Do not broaden to unrelated CLI surfaces.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Chapter alias passes for 718-720, 721-723, and 724-726.
- [x] Default task evidence assertion output is readable.
- [x] Focused tests and typecheck pass.
- [x] Changes are committed in a single commit at chapter end.
