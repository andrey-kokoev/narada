---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T00:34:45.024Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T00:34:45.591Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Validate package role catalog against workspace packages

## Chapter

Doctrine Review

## Goal

Prevent package role catalog drift by validating .narada/capabilities/package-role-catalog.json against workspace package manifests.

## Context

Derived from residual after tasks 1240/1242: package role catalog is a first projection and future package additions can drift unless a validation/check task wires it into CI or a Narada check command.

## Required Work

1. Add a lightweight validation test or command that compares workspace package manifests against .narada/capabilities/package-role-catalog.json. 2. Ensure every workspace package has one catalog entry and descriptor package guard remains present. 3. Keep this as validation only; do not change package behavior. 4. Record verification and close.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Validation fails if a workspace package is missing from package-role-catalog.json.
- [x] Validation checks descriptor package guard exists.
- [x] Focused verification passes.
