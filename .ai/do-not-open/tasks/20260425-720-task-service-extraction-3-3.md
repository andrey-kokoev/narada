---
status: claimed
depends_on: []
---

# Task 720 — Extract Finish Orchestrator Service

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/task-cli-service-extraction-rails.md
- packages/task-governance/README.md

## Context

<!-- Context placeholder -->

## Goal

Move finish orchestration semantics into @narada2/task-governance so task-finish coordinates report/review, evidence admission, optional criteria proof, close, and roster handoff through package services.

## Required Work

1. Create a finish orchestration service module in packages/task-governance/src
2. Port task-finish completion-mode logic and action reporting to service result
3. Reuse report/review/evidence-close services from package layer
4. Update task-finish CLI command to a thin adapter

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

- [ ] task-finish command delegates to package finish orchestrator
- [ ] implementer and reviewer finish flows still function
- [ ] --prove-criteria and --close paths still succeed with existing project rules
- [ ] roster done gating semantics remain preserved
