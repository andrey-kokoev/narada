---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:19:53.680Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:36:17.121Z
closed_at: 2026-04-25T18:36:22.395Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Eliminate stale dist as hidden CLI authority

## Goal

The shell-exposed narada command must not silently run stale compiled dist when source has changed.

## Context

The installed shim currently executes packages/layers/cli/dist/main.js. During rapid self-build work this can create a hidden authority split between src and dist.

## Required Work

Add a freshness contract to the shell-exposed narada path; make stale dist detectable before execution; provide a terse remediation message; verify the installed path cannot silently execute stale code.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:19:53.680Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Shell narada path detects stale CLI dist before execution
- [x] Stale dist remediation names the exact build command
- [x] The fix does not require agents to remember node packages/layers/cli/dist/main.js
- [x] Verification covers the shim or equivalent shell exposed path



