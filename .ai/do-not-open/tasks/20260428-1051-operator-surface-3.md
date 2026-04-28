---
status: opened
depends_on: [1050]
---

# Task 1051 — Specify Operator Surface inspection and materialization posture

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/command-execution-intent-zone.md
- docs/concepts/repo-publication-intent-zone.md
- docs/product/site-bootstrap-contract.md
- packages/layers/cli/src/commands/sites.ts

## Context

Operator Surfaces are useful only if Operators and agents can inspect what surfaces exist and eventually materialize adapters. The first coherent surface should be read-only inspection; materialization should be deferred or dry-run unless explicitly earned.

## Goal

Define the CLI posture for inspecting and later materializing Operator Surfaces without creating hidden authority or autonomous UI mutation.

## Required Work

1. Specify read-only commands such as narada sites surface list/show for declared Operator Surfaces.
2. Specify future materialization commands as governed crossings with dry-run first and explicit --execute if implemented later.
3. Define output bounds and no-secret rules for launch/focus metadata.
4. State how adapter-specific side effects must pass through CEIZ or another governed execution boundary.
5. Record adapter materializers as deferred unless Builder is explicitly assigned an implementation task.

## Non-Goals

- Do not implement the CLI command in this architecture task
- Do not run Windows or Komorebi commands
- Do not auto-edit terminal profiles

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

- [ ] Docs specify read-only inspection posture for Operator Surfaces
- [ ] Docs define materialization as a future governed crossing, not implicit Site bootstrap side effect
- [ ] Docs require bounded output and no raw secrets in surface metadata
- [ ] Deferred adapter implementation is explicit
