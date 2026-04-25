---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:08:31.131Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:08:32.789Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 714 — Document Remaining Task CLI Service Extraction Rails

## Goal

Make the remaining CLI-to-service extraction sequence explicit so future chapters continue on rails.

## Context

Task close, allocate, and search are now service-shaped or targeted for extraction. Several task commands still own domain orchestration.

## Required Work

1. Inventory remaining task CLI commands that still own domain transition or projection logic.
2. Classify each as adapter-complete, service-extraction-needed, or intentionally CLI-local.
3. Document the recommended next extraction order and why.
4. Reference the inventory from the task-governance package contract.

## Non-Goals

- Do not extract every remaining command in this task.
- Do not create unbounded follow-up tasks without operator direction.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] There is a durable extraction inventory document.
- [x] The document names the next highest-value service extraction candidates.
- [x] The document distinguishes domain services from CLI-local rendering or parsing concerns.
- [x] The package README points to the inventory.


