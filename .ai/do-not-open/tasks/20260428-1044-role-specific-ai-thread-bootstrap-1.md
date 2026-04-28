---
status: opened
depends_on: []
---

# Task 1044 — Specify role-specific AI thread bootstrap contracts

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/inhabited-evolution.md
- docs/product/site-bootstrap-contract.md
- docs/product/site-governance-coordinates.md
- AGENTS.md

## Context

Narada currently generates Site AGENTS.md files for fresh architect threads only. Inhabited Evolution has now admitted a Builder role by real use, but bootstrap contracts, Site governance coordinates, and generated guidance still reflect the older single-agent model. This task is architecture/specification only and should not implement generated Site behavior.

## Goal

Define the admitted Architect and Builder thread bootstrap contracts without adding speculative roles or collapsing Operator authority.

## Required Work

1. Inventory the current fresh-thread bootstrap model and identify where it assumes architect-only execution.
2. Define a compact bootstrap contract grammar for inhabited roles: Operator, Architect, Builder, and Trace substrate.
3. Specify Architect responsibilities, limits, and default first actions in a fresh thread.
4. Specify Builder responsibilities, limits, and default first actions in a fresh thread.
5. Define the handoff grammar: Operator pressure -> Architect spec/review -> Builder execution/report -> Architect or Operator admission, with no speculative roles admitted.
6. Document non-goals and deferred roles explicitly as possibility/proposal/residual only.

## Non-Goals

- Do not implement CLI commands
- Do not modify generated AGENTS.md
- Do not admit inspector, clerk, PM, or superintendent as active roles

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

- [ ] Docs define Architect and Builder thread bootstrap contracts as distinct admitted roles
- [ ] Docs preserve Operator as owner/client authority and trace substrate as evidence, not a thinking role
- [ ] Docs state that no additional role is active until inhabited by real operation evidence
- [ ] Docs include default fresh-thread first actions for Architect and Builder
- [ ] No CLI behavior or Site generation is changed by this task
