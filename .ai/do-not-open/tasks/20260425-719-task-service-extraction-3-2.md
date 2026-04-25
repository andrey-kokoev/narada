---
status: claimed
depends_on: []
---

# Task 719 — Extract Review Admission Service

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/task-cli-service-extraction-rails.md
- docs/SEMANTICS.md

## Context

<!-- Context placeholder -->

## Goal

Move task review operator semantics from the CLI command into @narada2/task-governance so verdict handling, findings validation, evidence admission, and closure orchestration are package-owned.

## Required Work

1. Create a review service module in packages/task-governance/src
2. Port task review status transitions, validation, linked report checks, and evidence admission gating
3. Call governed close service for accepted reviews when evidence is sufficient
4. Update task-review CLI command to delegate to package service

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

- [ ] task-review command delegates to review service
- [ ] accepted and rejected verdict transitions match existing behavior
- [ ] evidence gating still enforced for accepted verdicts
- [ ] linked report status updates remain correct
