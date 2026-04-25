---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:12:36.441Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:12:37.671Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 724 — Close Residual Task Service Extraction Tasks

## Goal

Bring tasks 718, 719, and 720 from attempt_complete to evidence-complete closure so the committed service-extraction chapter is not left half-open.

## Context

After the service extraction commit, tasks 718-720 had implementation evidence but remained claimed with unchecked acceptance criteria and no governed closure. That makes the chapter state incoherent despite code being committed.

## Required Work

1. Inspect evidence for tasks 718, 719, and 720.
2. Use sanctioned task lifecycle commands to complete criteria proof, evidence admission, and closure for each task.
3. Record the verification already run for the service extraction work.
4. Confirm each task evidence verdict is complete.

## Non-Goals

- Do not rewrite task 718-720 requirements.
- Do not change service extraction code except where closure verification exposes a real defect.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Task 718 evidence verdict is complete.
- [x] Task 719 evidence verdict is complete.
- [x] Task 720 evidence verdict is complete.
- [x] No direct task markdown edits are used to close these tasks.
