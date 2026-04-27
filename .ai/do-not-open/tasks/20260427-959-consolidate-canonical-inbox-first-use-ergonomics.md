---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T02:36:08.415Z
criteria_proof_verification:
  state: unbound
  rationale: Canonical Inbox docs now prefer payload-file/stdin and route first-use bootstrap, native binding, and git-worktree friction to doctor/preflight surfaces; observation envelope env_4a29858c archived; pnpm verify passed.
closed_at: 2026-04-27T02:36:09.884Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Consolidate Canonical Inbox first-use ergonomics

## Goal

Turn the received Canonical Inbox first-use ergonomics observation into durable guidance and archive the handled envelope.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Canonical Inbox docs prefer payload-file or payload-stdin for shell-hostile JSON
- [x] Canonical Inbox docs route bootstrap/build/native-binding/git-worktree friction to existing doctor and preflight surfaces
- [x] the handled observation envelope is archived after the guidance is recorded
- [x] full verification passes
