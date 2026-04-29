---
status: closed
amended_by: architect
amended_at: 2026-04-29T21:11:52.931Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T21:19:00.327Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented operator-surface identity add, labels build, bind-focused --identity/--as-self, rebind, unbind, list, and clean-stale command surfaces. Focused tests, CLI typecheck/build, and smoke commands verify durable identity admission, runtime binding deferral, self identity resolution, bounded JSON outputs, and authority split.
closed_at: 2026-04-29T21:19:41.282Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add operator-surface identity binding commands

## Chapter

Operator Surface Runtime Identity Machinery

## Goal

Implement governed operator-surface identity and runtime binding command surfaces that preserve durable identity authority versus volatile runtime-handle authority.

## Context

Inbox envelope env_99dad4bf-1caa-4364-809e-257977fccc4f reports that inhabited Windows User Site overlay use still requires ad hoc JSON edits, helper scripts, and manual memory of agent ids for identity admission and runtime window binding. Task 1089 defined runtime identity binding doctrine; this task is the follow-up implementation/product surface for CLI and UI-ready commands. Durable identity admission belongs to Site authority, while volatile substrate bindings such as HWND -> identity live in the PC/runtime locus.

## Required Work

1. Inspect runtime identity binding doctrine, Operator Surface docs, Site governance coordinates, Site state projections, and current CLI command registration patterns. 2. Design the command family, preserving authority split between durable Site identity records and PC/runtime-local volatile handles. 3. Implement or specify commands for identity admission, label projection, bind-focused, bind as self, rebind, unbind, list bindings, and clean stale bindings. Candidate verbs include narada operator-surface identity add, narada operator-surface labels build, narada operator-surface bind-focused --identity <id>, bind-focused --as self, unbind-focused, bindings list, and bindings clean-stale. 4. Ensure bind-as-self resolves the current principal/agent identity from governed role/session context rather than requiring the Operator to remember exact identity strings. 5. For host/runtime mutation that belongs to Windows PC/User Site, route through Site-local command/CEIZ or record explicit bounded deferral; Narada proper must not directly mutate Windows runtime state by convenience. 6. Produce bounded human and JSON outputs suitable for UI projection. 7. Add tests or fixtures for identity add, bind-as-self resolution, stale binding cleanup, authority-locus refusal/deferral, and no direct JSON editing. 8. Verify with focused tests and pnpm verify or record bounded blockers.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T21:11:52.931Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] CLI or specified product surface supports durable identity admission without direct JSON edits
- [x] CLI or specified product surface supports runtime binding operations including bind-focused bind-as-self rebind unbind list and clean-stale or records bounded deferrals
- [x] Authority split is enforced between Site identity records and PC/runtime-local volatile handles
- [x] Bind-as-self resolves the current agent identity without requiring Operator memory of exact identity strings
- [x] Human and JSON outputs are bounded and UI-ready
- [x] Source envelope env_99dad4bf-1caa-4364-809e-257977fccc4f is routed
