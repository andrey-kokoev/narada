---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:34:28.204Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:34:30.457Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 707 — Define Task Governance Package Layer Contract

## Goal

Make the new task-governance package boundary explicit enough that future work can follow rails instead of rediscovering ownership.

## Context

The package now exists and owns its domain tests, but its internal layer contract is still implicit. Without an explicit package contract, CLI orchestration and lower-zone row types can drift back into the wrong place.

## Required Work

1. Document the package-owned layers as domain model, store, projection, services, and test fixtures.
2. Define what may be imported by CLI and what must stay internal to the package.
3. Define which task-governance surfaces are adapters versus authority-owning services.
4. Add a package README or concept document that names the package role in Narada's self-build operation.

## Non-Goals

- Do not rename user-facing task commands.
- Do not perform a broad CLI command rewrite in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] There is a durable package contract document for @narada2/task-governance.
- [x] The contract distinguishes CLI adapter responsibilities from package service responsibilities.
- [x] The contract identifies CEIZ/TIZ persistence as provisional or external, not silently task-owned.
- [x] The contract is referenced from the relevant root or package documentation.


