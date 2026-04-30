---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T23:01:19.080Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777590007405_u2cvt5
closed_at: 2026-04-30T23:01:34.729Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Repair client Site task substrate bootstrap and pending target normalization

## Goal

Make newly bootstrapped client Sites task-ready without manual directory creation, and normalize inbox pending targets so task references do not render as task:task:<n>.

## Context

Source inbox envelope env_e12e7240-3685-4841-aa58-740e5d863ad2 reports CPY task creation failed until .ai/do-not-open/tasks was manually created, and inbox pending --to task:<n> later rendered as task:task:<n>.

## Required Work

1. Inventory Site bootstrap, task preflight, task create, and task registry-lock paths that assume .ai/do-not-open/tasks exists. 2. Implement a sanctioned self-repair or bootstrap path so task preflight/create can create or reconcile the canonical task spec directory for newly bootstrapped client Sites. 3. Fix inbox pending target normalization so target_kind and target_ref do not both carry the kind prefix. 4. Add regression coverage for a fresh client Site with only lifecycle DB/top-level Site structure being able to run task preflight/create without manual mkdir. 5. Add regression coverage for inbox pending --to task:1 rendering and storing as one normalized task target, not task:task:1. 6. Preserve direct-edit prohibition: repairs must go through sanctioned CLI/domain paths, not manual filesystem instructions as the normal path.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Fresh client Site task preflight/create succeeds or offers a sanctioned repair without manual .ai/do-not-open/tasks creation.
- [x] Registry lock acquisition does not fail with ENOENT for missing task spec parent directory on a bootstrapped Site.
- [x] inbox pending --to task:1 stores and displays a normalized task target without duplicated task prefix.
- [x] Tests cover both task substrate bootstrap repair and pending target normalization.
- [x] User-facing repair guidance no longer tells the Operator to manually create task substrate directories.
