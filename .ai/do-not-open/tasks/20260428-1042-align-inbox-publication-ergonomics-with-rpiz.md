---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T22:35:54.991Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented RPIZ-aligned inbox publication output, bounded doctor guidance, command responsibility docs, and verified with focused inbox tests, typecheck, lifecycle export, and pnpm verify.
closed_at: 2026-04-28T22:36:04.881Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Align inbox publication ergonomics with RPIZ

## Chapter

canonical-inbox

## Goal

Tighten Canonical Inbox publication ergonomics so inbox export, publish, and doctor expose bounded operator guidance and explicitly route repository publication semantics through the Repository Publication Intent Zone model.

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

- [x] inbox publish dry-run returns exact execute and execute-push commands
- [x] inbox publish result labels commit and push as repository publication crossing posture rather than raw Git authority
- [x] inbox doctor human output remains bounded and points to inbox publish instead of manual Git choreography
- [x] canonical inbox docs distinguish submit
- [x] export
- [x] publish
- [x] import
- [x] doctor
- [x] and repo publication responsibilities
- [x] focused tests and pnpm verify pass
