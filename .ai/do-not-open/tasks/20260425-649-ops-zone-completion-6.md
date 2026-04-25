---
status: confirmed
depends_on: []
governed_by: chapter_close:a2
closed_at: 2026-04-25T04:22:34.449Z
closed_by: a3
---

# Task 649 — Reconciliation Zone And Priority Chain

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

Define the missing Reconciliation Zone and record the final implementation priority chain for all missing ops zones.

## Required Reading

- `docs/concepts/ops-zone-completion.md`.
- Recent SQLite/task-file/roster/recommender drift repairs.

## Context

The recent buildout repeatedly encountered drift between task files, SQLite lifecycle, roster, assignments, recommender output, and evidence state. Repair has been ad hoc. A Reconciliation Zone is needed for explicit findings and repair results, but it should come after assignment/evidence/observation/operator-input zones because it repairs their disagreements.

## Required Work

1. Define Reconciliation Zone.
2. Identify finding and repair artifacts.
3. Record why it is lower priority than Assignment and Evidence zones.
4. Produce final priority order for future implementation.

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

Defined Reconciliation Zone in `docs/concepts/ops-zone-completion.md` as priority 5.

Target shape:

- Finding artifact: `ReconciliationFinding`.
- Repair artifact: `RepairResult`.
- Owns: detecting and repairing drift between authoritative and projected surfaces.
- Admission: mismatch is observed, scoped, and classified before repair.
- Confirmation: repair result states what changed and what surfaces now agree.

Final priority chain:

1. Assignment Intent Zone.
2. Evidence Admission Zone.
3. Observation Artifact Zone.
4. Operator Input Zone.
5. Reconciliation Zone.

## Verification

Verified the concept artifact contains the final priority chain and a closure rule requiring owner, request artifact, result artifact, admission rule, confirmation rule, and eliminated rough surface before any new top-level zone is accepted.

## Acceptance Criteria

- [x] Reconciliation Zone is defined.
- [x] Finding/repair artifacts are named.
- [x] Priority order is recorded.
- [x] New-zone closure rule is recorded.




