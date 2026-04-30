---
status: closed
amended_by: architect
amended_at: 2026-04-30T17:27:33.250Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T17:53:49.332Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777571582384_4gdn9j
closed_at: 2026-04-30T17:54:07.002Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add compact architect-loop workboard output

## Chapter

Architect Loop Output Austerity

## Goal

Provide a compact workboard view for routine Architect loops that avoids dumping stable guidance and full source-envelope context into chat transcripts.

## Context

Inbox envelope env_e06bcad8-9dfa-4c87-8057-df22c628256c reports that `narada task workboard --format json` emits hundreds of lines during routine status checks. Full machine-readable output remains useful, but Architect next-loop checks need a compact stable summary.

## Required Work

1. Inspect task workboard output structure and current consumers.
2. Define compact architect-loop output containing counts, pending reviews, in-progress tasks, local followups, deferred blockers, and high-priority diagnostics only.
3. Move stable guidance such as closure semantics, review handoff requirements, and concurrency boundaries behind explicit include-guidance or verbose flags for routine use.
4. Add a recommended command for Architect next-loop checks that is compact by construction.
5. Add tests for compact output shape, full output compatibility, guidance inclusion flag, and bounded transcript size.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T17:27:33.250Z: required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A compact workboard mode or view exists for Architect loops.
- [x] Compact output omits stable boilerplate guidance unless explicitly requested.
- [x] Compact output includes enough state to decide next Architect action.
- [x] Help or docs name the recommended compact next-loop command.
- [x] Tests cover compact/full output and guidance inclusion behavior.
