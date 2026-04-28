---
status: opened
depends_on: [1052]
---

# Task 1053 — Verify Operator Surface architecture and route implementation residuals

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/inhabited-evolution.md
- docs/concepts/canonical-inbox.md
- docs/product/site-governance-coordinates.md
- docs/product/site-bootstrap-contract.md

## Context

Architect should produce the chapter/spec and evidence, then Builder should build any implementation tasks. This closing task verifies that the architecture is coherent, bounded, and routed to the right authority loci, including the adjacent AgentRuntime / ControlChannel / SessionBinding model.

## Goal

Verify the Operator Surface chapter artifacts and route any build work to Builder-owned tasks or external Site inboxes.

## Required Work

1. Run docs/link/lint verification available in Narada proper, including pnpm verify after lifecycle export if task state changed.
2. Inspect that Operator Surface, AgentRuntime, ControlChannel, and SessionBinding docs do not imply authority, secrets, or adapter side effects.
3. Route implementation residuals either to Narada proper Builder tasks or to the appropriate User/PC Site inbox when authority belongs there.
4. Mark the source inbox envelopes pending/promoted/archive according to the chapter outcome.
5. Prepare Inspector review instructions for the chapter before closure.

## Non-Goals

- Do not implement adapter materializers
- Do not close Builder tasks without Builder evidence
- Do not treat architecture approval as implementation completion
- Do not treat session-binding architecture as a live session registry implementation

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

- [ ] Verification passes or blockers are recorded precisely
- [ ] Implementation residuals are routed to Builder/external Site rather than hidden in prose
- [ ] The source inbox envelopes are handled through sanctioned inbox transitions
- [ ] Chapter is ready for Builder implementation and Inspector review
