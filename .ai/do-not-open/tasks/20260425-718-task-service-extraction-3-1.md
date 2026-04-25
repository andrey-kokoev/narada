---
status: claimed
depends_on: []
---

# Task 718 — Extract Work Result Report Service

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/task-cli-service-extraction-rails.md
- docs/

## Context

<!-- Context placeholder -->

## Goal

Move task report operator semantics from the CLI command into @narada2/task-governance as a package service that owns work-result submission, assignment intent checks, idempotency, and authoritative store updates.

## Required Work

1. Create a report service module in packages/task-governance/src with structured options and result payload
2. Port all task-report command validation, transition checks, and mutation paths into service
3. Persist report records and assignment/task transitions through governance utilities and SQLite lifecycle
4. Update task-report CLI command to be an adapter only

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] task-report CLI command delegates to report service module
- [ ] report submission remains idempotent per assignment
- [ ] assignment and roster side effects remain unchanged
- [ ] existing command tests for task report pass against adapter behavior
