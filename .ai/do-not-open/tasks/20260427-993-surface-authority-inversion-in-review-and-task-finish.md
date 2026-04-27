---
status: closed
depends_on: [992]
amended_by: architect
amended_at: 2026-04-27T21:49:38.250Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T22:08:59.848Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T22:09:00.320Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Surface authority inversion in review and task finish

## Chapter

authority-inversion-implementation

## Goal

Make Authority-Revealing Inversion visible during task report/review/finish so agent completion checks ask what authority the changed artifact embodies.

## Context

Agents repeatedly close work around artifacts: files, command output, task specs, inbox envelopes, snapshots, and DB projections. The doctrine should appear where closure authority is evaluated, without turning advisory review lenses into arbitrary blockers.

## Required Work

1. Identify the task report/review/finish surfaces that can safely show doctrine prompts or warnings.
2. Add bounded authority-inversion guidance for changed files matching known artifact-first categories.
3. Keep warnings advisory unless an existing authority guard is actually violated.
4. Ensure human and JSON output remain bounded and useful.
5. Add tests proving normal closure still works and artifact-first warnings are surfaced.

## Non-Goals

- Do not require every task to pass a subjective doctrine review.
- Do not add long transcript output.
- Do not change lifecycle authority semantics beyond surfaced guidance.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `task finish` or review output includes bounded authority-inversion prompts or warnings when changed files match known artifact-first surfaces.
- [x] Prompts remain advisory unless an existing authority violation is detected.
- [x] JSON output includes machine-readable warning metadata.
- [x] Tests prove normal task closure still works and artifact-first warnings are bounded.
- [x] `pnpm verify` passes.
