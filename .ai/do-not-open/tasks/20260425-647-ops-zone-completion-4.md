---
status: confirmed
depends_on: []
governed_by: chapter_close:a2
closed_at: 2026-04-25T04:22:18.995Z
closed_by: a3
---

# Task 647 — Observation Artifact Zone

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

Define the missing Observation Artifact Zone for output creation/admission separation, especially for graphs, evidence lists, diagnostics, and rendered artifacts.

## Required Reading

- `docs/concepts/ops-zone-completion.md`.
- CEIZ bounded output discipline.
- Prior operator requirement to prevent giant CLI transcripts.

## Context

CEIZ prevents unbounded command execution output from entering chat directly, but read-heavy surfaces still need a broader observation discipline. Mermaid graphs, evidence lists, diagnostic dumps, and rendered browser artifacts need creation as artifacts first, then bounded admission to the viewer.

## Required Work

1. Define Observation Artifact Zone.
2. Distinguish output creation from output admission.
3. Identify observation request/result artifacts.
4. Relate it to CEIZ without duplicating CEIZ.

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

Defined Observation Artifact Zone in `docs/concepts/ops-zone-completion.md` as priority 3.

Target shape:

- Request artifact: `ObservationRequest`.
- Durable artifact: `ObservationArtifact`.
- View artifact: `ObservationView`.
- Owns: large read outputs, evidence lists, Mermaid graphs, diagnostics, rendered browser artifacts.
- Admission: default bounded summaries; full artifact available by explicit inspect/open path.
- Confirmation: viewer receives bounded admitted view, not raw unbounded output.

This complements CEIZ: CEIZ governs command execution; Observation Artifact Zone governs read-output admission.

## Verification

Verified the concept artifact records Observation Artifact Zone separately from CEIZ and ties it to the rough surface of giant terminal dumps.

## Acceptance Criteria

- [x] Observation Artifact Zone is defined.
- [x] Output creation/admission separation is stated.
- [x] Artifacts are named.
- [x] Relationship to CEIZ is bounded.




