---
status: closed
amended_by: architect
amended_at: 2026-04-30T17:27:40.073Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T18:04:13.361Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777572180224_mb41hv
closed_at: 2026-04-30T18:04:32.306Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Improve Windows-safe task authoring and actionable handoff repair

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Make task authoring from Windows paths and underspecified task repair safe, diagnostic, and actionability-aware.

## Context

Inbox envelope env_81d2e767-9f18-4acf-8e8e-bf3ae9a8845d reports Windows path translation failures surfaced as misleading missing-title errors, task create still permits placeholder Required Work for executable tasks, and workboard repair guidance lacks a guided authoring workflow.

## Required Work

1. Inspect task create --input-json, path handling, Windows/WSL invocation assumptions, and validation error ordering.
2. Make unreadable input-json paths report path/input errors instead of falling through to missing title validation.
3. Define or implement Windows-safe task authoring input handling for native Windows paths or clear WSL conversion guidance.
4. Prevent placeholder Required Work for normal executable tasks unless explicitly marked draft/sketch/non-executable, coordinating with task 1138 if needed.
5. Provide a guided repair path for underspecified tasks, such as task make-actionable or task amend --from-intent, that rechecks handoff_actionability after repair.
6. Add tests for malformed/unreadable input-json path, Windows-style path handling or guidance, placeholder refusal, and guided repair clearing actionability.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T17:27:40.073Z: required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Unreadable --input-json path returns a path/input error, not --title is required.
- [x] Windows-origin task authoring has a documented or implemented safe path.
- [x] Placeholder Required Work is refused or explicitly non-executable for normal Builder handoffs.
- [x] A guided repair command/path can make an underspecified task actionable and recheck actionability.
- [x] Tests cover Windows/path error, placeholder refusal, and guided repair behavior.
