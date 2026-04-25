---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:52.296Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:32.889Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:34.502Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Mechanically guard tracked lifecycle DB from ad hoc mutation

## Goal

The documented tracked DB posture should have a mechanical guardrail against direct sqlite mutation.

## Context

Docs say .ai/task-lifecycle.db is a tracked Site authority artifact, but nothing guides or blocks accidental ad hoc mutation.

## Required Work

Add a lightweight guard or sanctioned script/docs hook that identifies direct DB mutation risk; expose command-based posture clearly; avoid destructive index changes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:52.296Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Repo contains a mechanical or scripted guard for DB posture
- [x] Guard message points to sanctioned commands
- [x] No git index removal is performed
- [x] Verification covers the guard path


