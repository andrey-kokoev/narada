---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T22:53:57.547Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777589596759_r1kdod
closed_at: 2026-04-30T22:54:13.430Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Complete operator-surface agent admission readiness

## Goal

Make operator-surface agent admission produce a ready-to-nudge, task-aware agent surface or a bounded readiness checklist with exact repair commands.

## Context

Source inbox envelope env_32c66b5f-c096-4b19-a671-a1129ababdb7 reports that after admitting narada-cpy.builder, identity/labeling existed but normal messaging and task access failed until aliases, submit strategy, and task roster were manually repaired.

## Required Work

1. Inventory the operator-surface agent instantiate/admit path and all projections required for normal work: identity registry, message aliases, submit strategy, runtime binding, label projection, and task roster membership. 2. Define capability-scoped readiness: which requested capabilities require which projections, and which authority locus owns each projection. 3. Update the CLI/domain path so admitting a Site builder either creates/reconciles all sanctioned projections or emits a bounded readiness checklist with exact commands. 4. Ensure task peek-next/work-next for admitted builder identities does not fail with opaque agent_not_in_roster when admission requested task capability; it should create roster membership through sanctioned path or provide a direct repair command. 5. Add regression coverage for a client-Site builder identity admitted by CLI becoming message-addressable and task-roster-ready without manual JSON edits. 6. Preserve Site authority boundaries: User/PC carrier projections must not become task authority.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A newly admitted client-Site builder can be resolved by operator-surface message aliases when messaging capability is requested.
- [x] Submit strategy readiness is either created or reported with exact repair commands before first nudge.
- [x] Task roster membership is created or repaired through a sanctioned command when task capability is requested.
- [x] agent instantiate/admit output includes readiness status for identity, alias, submit strategy, binding, label, and task roster projections.
- [x] Focused tests cover the CPY-style narada-cpy.builder admission path.
